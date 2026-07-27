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


class EditMixin:
    # Tope de repeticiones por página: con una fuente pequeña en un plano grande la
    # rejilla se dispara y el motor (1 worker, PyMuPDF) se queda colgado.
    MAX_WATERMARK_TILES = 400

    def add_watermark(self, doc_id: str, text: str, color: str = "#888888", fontsize: float = 48,
                      angle: int = 45, opacity: float = 0.3, tiled: bool = True) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0.5, 0.5, 0.5)
        text_width = fitz.get_text_length(text, fontsize=fontsize)
        for i in range(len(doc)):
            page = doc.load_page(i)
            rect = page.rect
            # insert_text(rotate=...) solo acepta múltiplos de 90; el diagonal de 45°
            # se hace con morph (rotación alrededor del punto de anclaje).
            if not tiled:
                pivot = fitz.Point(rect.width / 2, rect.height / 2)
                insert = fitz.Point(pivot.x - text_width / 2, pivot.y + fontsize / 4)
                page.insert_text(insert, text, fontsize=fontsize, color=rgb,
                                 fill_opacity=opacity, morph=(pivot, fitz.Matrix(angle)), overlay=True)
                continue

            # Mosaico al tresbolillo cubriendo TODA la página (la marca de agua de
            # una sola línea al centro se perdía en un plano grande).
            step_x = max(text_width + fontsize * 2.0, fontsize)
            step_y = max(fontsize * 3.2, 1.0)
            # Margen: al girar 45° las filas se salen, así se cubren las esquinas.
            margin = max(rect.width, rect.height) * 0.5
            cols = int((rect.width + 2 * margin) / step_x) + 1
            rows = int((rect.height + 2 * margin) / step_y) + 1
            if cols * rows > self.MAX_WATERMARK_TILES:
                factor = ((cols * rows) / self.MAX_WATERMARK_TILES) ** 0.5
                step_x *= factor
                step_y *= factor
            drawn = 0
            row = 0
            y = rect.y0 - margin
            while y < rect.y1 + margin and drawn < self.MAX_WATERMARK_TILES:
                x = rect.x0 - margin + (step_x / 2 if row % 2 else 0)
                while x < rect.x1 + margin and drawn < self.MAX_WATERMARK_TILES:
                    pivot = fitz.Point(x + text_width / 2, y)
                    page.insert_text(fitz.Point(x, y), text, fontsize=fontsize, color=rgb,
                                     fill_opacity=opacity, morph=(pivot, fitz.Matrix(angle)), overlay=True)
                    drawn += 1
                    x += step_x
                y += step_y
                row += 1
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def redact_area(self, doc_id: str, page_num: int, x: float, y: float, width: float, height: float) -> bool:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        rect = fitz.Rect(x, y, x + width, y + height)
        page.add_redact_annot(rect)
        page.apply_redactions()
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def insert_text(self, doc_id: str, page_num: int, x: float, y: float, text: str, color: str = "#000000", fontsize: float = 12) -> bool:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        # Parse hex color
        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
        page.insert_text((x, y), text, fontsize=fontsize, color=rgb)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def insert_image(self, doc_id: str, page_num: int, x: float, y: float, width: float, height: float, image_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc) or not os.path.exists(image_path):
            return False
        page = doc.load_page(page_num)
        rect = fitz.Rect(x, y, x + width, y + height)
        page.insert_image(rect, filename=image_path)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def add_header_footer(self, doc_id: str, header: Optional[str] = None, footer: Optional[str] = None, fontsize: float = 10, color: str = "#000000") -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
        for i in range(len(doc)):
            page = doc.load_page(i)
            rect = page.rect
            if header:
                tw = fitz.get_text_length(header, fontsize=fontsize)
                page.insert_text((rect.width / 2 - tw / 2, 20), header, fontsize=fontsize, color=rgb, overlay=True)
            if footer:
                tw = fitz.get_text_length(footer, fontsize=fontsize)
                page.insert_text((rect.width / 2 - tw / 2, rect.height - 10), footer, fontsize=fontsize, color=rgb, overlay=True)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def replace_text(self, doc_id: str, query: str, replace: str, page_num: Optional[int] = None, case_sensitive: bool = False, replace_all: bool = True) -> int:
        doc = self._acquire(doc_id)
        if not doc or not query:
            return 0
        count = 0
        pages_to_search = [page_num] if page_num is not None else range(len(doc))
        for p in pages_to_search:
            if p < 0 or p >= len(doc):
                continue
            page = doc.load_page(p)
            # search_for de PyMuPDF es siempre case-insensitive; la sensibilidad se
            # aplica comparando el texto real de cada rect con la query exacta.
            rects = page.search_for(query, flags=fitz.TEXT_DEHYPHENATE)
            if case_sensitive:
                rects = [r for r in rects if query in page.get_textbox(r + (-1, -1, 1, 1))]
            if not rects:
                continue
            # Redact old text
            for rect in rects:
                page.add_redact_annot(rect)
            page.apply_redactions()
            # Insert new text at first rect position with default styling
            if rects:
                # Estimate font size from rect height
                est_fontsize = max(8, min(72, int(rects[0].height * 0.8)))
                page.insert_text(rects[0].tl, replace, fontsize=est_fontsize, color=(0, 0, 0), overlay=True)
                count += len(rects)
            if not replace_all:
                break
        if count > 0:
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
        return count

    def set_metadata(self, doc_id: str, title: Optional[str] = None, author: Optional[str] = None, subject: Optional[str] = None, keywords: Optional[str] = None) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        meta = doc.metadata
        if title is not None:
            meta['title'] = title
        if author is not None:
            meta['author'] = author
        if subject is not None:
            meta['subject'] = subject
        if keywords is not None:
            meta['keywords'] = keywords
        doc.set_metadata(meta)
        self._dirty[doc_id] = True
        return True

    @staticmethod
    def _base14_font(font: Optional[str]) -> str:
        """Mapea el nombre de fuente detectado a una base14 de PyMuPDF."""
        f = (font or "").lower()
        bold = "bold" in f or "black" in f or "semibold" in f
        italic = "italic" in f or "oblique" in f
        if "courier" in f or "mono" in f or "consol" in f:
            return "cobo" if bold and italic else "cobi" if italic else "cobo" if bold else "cour"
        if "times" in f or "georgia" in f or "serif" in f or "roman" in f or "garamond" in f:
            return "tibi" if bold and italic else "tiit" if italic else "tibo" if bold else "tiro"
        return "hebi" if bold and italic else "heit" if italic else "hebo" if bold else "helv"

    def edit_text_span(self, doc_id: str, page_num: int, x0: float, y0: float,
                       x1: float, y1: float, text: str, size: Optional[float] = None,
                       color: str = "#000000", font: Optional[str] = None) -> bool:
        """Edición in-situ: tapa el span original con el color de fondo muestreado y
        reinserta el texto nuevo en la misma posición, mapeando la fuente a una base14
        aproximada (PyMuPDF no reusa fuentes incrustadas por nombre)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return False
            page = doc.load_page(page_num)
            rect = fitz.Rect(x0, y0, x1, y1)
            # Color de fondo: el píxel más claro del borde del span (evita los glifos).
            fill = (1.0, 1.0, 1.0)
            try:
                pix = page.get_pixmap(clip=rect, colorspace=fitz.csRGB, alpha=False)
                w, h = pix.width, pix.height
                if w > 0 and h > 0:
                    samples = []
                    for px in range(0, w, max(1, w // 8)):
                        samples.append(pix.pixel(px, 0))
                        samples.append(pix.pixel(px, h - 1))
                    bg = max(samples, key=lambda c: sum(c))
                    fill = tuple(v / 255 for v in bg)
            except Exception:
                pass
            page.add_redact_annot(rect, fill=fill)
            page.apply_redactions()
            c = color.lstrip("#")
            rgb = tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)) if len(c) == 6 else (0, 0, 0)
            fs = size or max(6.0, (y1 - y0) * 0.85)
            try:
                page.insert_text((x0, y1 - max(1.0, (y1 - y0) * 0.2)), text,
                                 fontsize=fs, color=rgb, fontname=self._base14_font(font), overlay=True)
            except Exception:
                page.insert_text((x0, y1 - max(1.0, (y1 - y0) * 0.2)), text,
                                 fontsize=fs, color=rgb, overlay=True)
            self._dirty[doc_id] = True
            return True

    def list_page_images(self, doc_id: str, page_num: int) -> List[dict]:
        """Imágenes de la página con su bbox (para editar/mover/borrar)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return []
            page = doc.load_page(page_num)
            out: List[dict] = []
            try:
                for info in page.get_image_info(xrefs=True):
                    xref = info.get("xref", 0)
                    if not xref:
                        continue
                    x0, y0, x1, y1 = info["bbox"]
                    out.append({"xref": xref, "x0": x0, "y0": y0, "x1": x1, "y1": y1})
            except Exception:
                pass
            return out

    @staticmethod
    def _sample_bg_color(page, rect):
        """Muestrea el color de fondo del borde exterior de rect para rellenar el
        hueco al borrar/mover una imagen (antes quedaba siempre en blanco). Promedia
        el marco de 1px de un clip ligeramente mayor que el rect; fallback a blanco."""
        try:
            pad = 3.0
            outer = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad) & page.rect
            if outer.is_empty:
                return (1, 1, 1)
            pix = page.get_pixmap(clip=outer, alpha=False)
            w, h = pix.width, pix.height
            if w < 2 or h < 2:
                return (1, 1, 1)
            edge = [pix.pixel(x, 0) for x in range(w)] + [pix.pixel(x, h - 1) for x in range(w)]
            edge += [pix.pixel(0, y) for y in range(h)] + [pix.pixel(w - 1, y) for y in range(h)]
            n = len(edge)
            return (sum(p[0] for p in edge) / n / 255.0,
                    sum(p[1] for p in edge) / n / 255.0,
                    sum(p[2] for p in edge) / n / 255.0)
        except Exception:
            return (1, 1, 1)

    def transform_image(self, doc_id: str, page_num: int, xref: int,
                        old: List[float], new: Optional[List[float]] = None,
                        delete: bool = False, replace_path: Optional[str] = None) -> bool:
        """Mueve/redimensiona/borra/reemplaza una imagen existente: tapa el área
        original con el color de fondo muestreado y, si no es borrado, reinserta (la
        misma imagen o una nueva) en el rect destino."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return False
            page = doc.load_page(page_num)
            img_bytes: Optional[bytes] = None
            if not delete:
                if replace_path:
                    try:
                        with open(replace_path, "rb") as f:
                            img_bytes = f.read()
                    except Exception:
                        return False
                else:
                    try:
                        ext = doc.extract_image(xref)
                        img_bytes = ext.get("image") if ext else None
                    except Exception:
                        img_bytes = None
            old_rect = fitz.Rect(*old)
            page.add_redact_annot(old_rect, fill=self._sample_bg_color(page, old_rect))
            try:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)
            except Exception:
                page.apply_redactions()
            if not delete and img_bytes:
                try:
                    page.insert_image(fitz.Rect(*(new or old)), stream=img_bytes)
                except Exception:
                    return False
            self._dirty[doc_id] = True
            return True

    def add_page_numbers(self, doc_id: str, prefix: str = "", start: int = 1, position: str = "bottom", fontsize: float = 10, color: str = "#000000") -> bool:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return False
            rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
            n = len(doc)
            for i in range(n):
                page = doc.load_page(i)
                # Bates-style fixed-width number when a prefix is given, else "k / n"
                label = f"{prefix}{start + i:06d}" if prefix else f"{start + i} / {n}"
                rect = page.rect
                tw = fitz.get_text_length(label, fontsize=fontsize)
                x = rect.width / 2 - tw / 2
                y = rect.height - 18 if position == "bottom" else 24
                page.insert_text((x, y), label, fontsize=fontsize, color=rgb, overlay=True)
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return True

    def redact_matches(self, doc_id: str, query: str) -> int:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or not query:
                return 0
            count = 0
            for i in range(len(doc)):
                page = doc.load_page(i)
                rects = page.search_for(query)
                for r in rects:
                    page.add_redact_annot(r, fill=(0, 0, 0))
                    count += 1
                if rects:
                    page.apply_redactions()
            if count:
                self._dirty[doc_id] = True
                self._invalidate_render_cache(doc_id)
            return count
