import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, ThumbnailRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")


class ReadMixin:
    def get_outline(self, doc_id: str) -> List[PdfOutlineItem]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return []
            outline = doc.get_toc()
        result: List[PdfOutlineItem] = []
        stack: List[tuple] = []
        
        for item in outline:
            level, title, page = item[0], item[1], item[2] - 1
            node = PdfOutlineItem(title=title, page=page, children=[])
            
            while len(stack) >= level:
                stack.pop()
            
            if not stack:
                result.append(node)
            else:
                parent = stack[-1][1]
                if parent.children is None:
                    parent.children = []
                parent.children.append(node)
            
            stack.append((level, node))
        
        return result

    def search_text(self, doc_id: str, query: str, limit: int = 500) -> List[dict]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return []

            results = []
            for page_num in range(len(doc)):
                if len(results) >= limit:
                    break
                page = doc.load_page(page_num)
                rects = page.search_for(query)
                for rect in rects:
                    if len(results) >= limit:
                        break
                    band = fitz.Rect(0, rect.y0 - 1, page.rect.width, rect.y1 + 1)
                    snippet = page.get_textbox(band).replace("\n", " ").strip()
                    if len(snippet) > 160:
                        snippet = snippet[:160] + "…"
                    results.append({
                        "page": page_num,
                        "x": rect.x0,
                        "y": rect.y0,
                        "width": rect.width,
                        "height": rect.height,
                        "snippet": snippet,
                    })
            return results

    def get_page_text_data(self, doc_id: str, page_num: int) -> Optional[dict]:
        """Both the positioned text blocks (for the selectable overlay) and the plain
        text (for copy / read-aloud) in a single locked call."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            blocks = []
            try:
                for b in page.get_text("blocks"):
                    x0, y0, x1, y1, text, *_ = b
                    blocks.append({"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0, "text": text.strip()})
            except Exception:
                blocks = []
            return {"blocks": blocks, "text": page.get_text()}

    def get_page_spans(self, doc_id: str, page_num: int) -> List[dict]:
        """Per-span text with bounding boxes, used to build a selectable text layer."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return []
            page = doc.load_page(page_num)
            data = page.get_text("dict")
            spans: List[dict] = []
            for block in data.get("blocks", []):
                for line in block.get("lines", []):
                    for sp in line.get("spans", []):
                        text = sp.get("text", "")
                        if not text.strip():
                            continue
                        x0, y0, x1, y1 = sp["bbox"]
                        spans.append({
                            "text": text,
                            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                            "size": sp.get("size", y1 - y0),
                            "color": "#%06x" % (sp.get("color", 0) & 0xFFFFFF),
                            "font": sp.get("font", ""),
                        })
            return spans

    def get_text_clip(self, doc_id: str, page_num: int, x: float, y: float, w: float, h: float) -> str:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return ""
        page = doc.load_page(page_num)
        rect = fitz.Rect(x, y, x + w, y + h)
        return page.get_text("text", clip=rect)

    def get_snap_points(self, doc_id: str, page_num: int) -> Optional[List[dict]]:
        """Puntos de ajuste para mediciones: extremos y puntos medios de líneas,
        esquinas de rectángulos y extremos de curvas del contenido vectorial.
        Coordenadas en unidades PDF (las mismas que usan las anotaciones)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            cache_key = (doc_id, page_num)
            if cache_key in self._snap_cache:
                self._snap_cache.move_to_end(cache_key)
                return self._snap_cache[cache_key]

            MAX_POINTS = 20000
            points: List[dict] = []
            seen = set()

            def add(x: float, y: float):
                key = (round(x, 1), round(y, 1))
                if key not in seen:
                    seen.add(key)
                    points.append({"x": key[0], "y": key[1]})

            page = doc.load_page(page_num)
            try:
                drawings = page.get_drawings()
            except Exception:
                drawings = []
            for d in drawings:
                if len(points) >= MAX_POINTS:
                    break
                for item in d.get("items", []):
                    kind = item[0]
                    if kind == "l":
                        p1, p2 = item[1], item[2]
                        add(p1.x, p1.y)
                        add(p2.x, p2.y)
                        add((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
                    elif kind == "re":
                        r = item[1]
                        add(r.x0, r.y0)
                        add(r.x1, r.y0)
                        add(r.x0, r.y1)
                        add(r.x1, r.y1)
                    elif kind == "c":
                        add(item[1].x, item[1].y)
                        add(item[4].x, item[4].y)
                    elif kind == "qu":
                        q = item[1]
                        for p in (q.ul, q.ur, q.ll, q.lr):
                            add(p.x, p.y)
                    if len(points) >= MAX_POINTS:
                        break

            self._snap_cache[cache_key] = points
            while len(self._snap_cache) > self._snap_cache_max:
                self._snap_cache.popitem(last=False)
            return points

    def ocr_available(self) -> bool:
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False

    def make_searchable(self, doc_id: str, pages: Optional[List[int]] = None) -> int:
        """OCR scanned pages and embed an invisible text layer so they become
        searchable/selectable. Returns words added, or -1 if Tesseract is unavailable."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return 0
            try:
                import pytesseract
                from pytesseract import Output
                from PIL import Image
                from io import BytesIO
            except Exception:
                return -1
            try:
                pytesseract.get_tesseract_version()
            except Exception:
                return -1

            DPI = 200
            scale = 72.0 / DPI
            indices = pages if pages is not None else list(range(len(doc)))
            total = 0
            for i in indices:
                if i < 0 or i >= len(doc):
                    continue
                page = doc.load_page(i)
                if page.get_text().strip():
                    continue  # already has a text layer
                pix = page.get_pixmap(dpi=DPI)
                img = Image.open(BytesIO(pix.tobytes("png")))
                data = pytesseract.image_to_data(img, lang="spa+eng", output_type=Output.DICT)
                for j, txt in enumerate(data["text"]):
                    if not txt or not txt.strip():
                        continue
                    x = data["left"][j] * scale
                    y = data["top"][j] * scale
                    h = max(4, data["height"][j] * scale)
                    try:
                        page.insert_text((x, y + h), txt, fontsize=h * 0.9, render_mode=3)
                        total += 1
                    except Exception:
                        continue
            if total:
                self._dirty[doc_id] = True
                self._invalidate_render_cache(doc_id)
            return total

    def ocr_page(self, doc_id: str, page_num: int) -> Optional[str]:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return None
        try:
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=300)
            from io import BytesIO
            from PIL import Image
            import pytesseract
            img = Image.open(BytesIO(pix.tobytes("png")))
            return pytesseract.image_to_string(img, lang='spa+eng')
        except Exception:
            logger.exception("ocr_page falló (doc %s, página %s)", doc_id, page_num)
            return None
