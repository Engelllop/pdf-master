import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, PdfOutlineItem, PageSize, Annotation
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

    def set_outline(self, doc_id: str, items: List[dict]) -> bool:
        """Reescribe el TOC del PDF. items: [{title, page, children?}]."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return False
            toc: List[list] = []

            def walk(nodes: List[dict], level: int) -> None:
                for n in nodes:
                    title = str(n.get("title") or "Sin título")
                    page = int(n.get("page") or 0) + 1
                    toc.append([level, title, page])
                    walk(n.get("children") or [], level + 1)

            walk(items, 1)
            doc.set_toc(toc)
            self._dirty[doc_id] = True
        # Sin invalidar el cache de render: el índice/TOC no se dibuja en la página.
        return True

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
                    rect = self._a_vista(page, rect)
                    band = self._desde_vista(page, fitz.Rect(0, rect.y0 - 1, page.rect.width, rect.y1 + 1))
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
                    x0, y0, x1, y1 = self._a_vista(page, fitz.Rect(b[:4]))
                    text = b[4]
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
                        x0, y0, x1, y1 = self._a_vista(page, fitz.Rect(sp["bbox"]))
                        spans.append({
                            "text": text,
                            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                            "size": sp.get("size", y1 - y0),
                            "color": "#%06x" % (sp.get("color", 0) & 0xFFFFFF),
                            "font": sp.get("font", ""),
                        })
            return spans

    @staticmethod
    def _estilo_span(sp) -> tuple:
        """(negrita, cursiva) de un span: por las banderas de PyMuPDF (16 y 2) o por
        el nombre de la fuente, que es lo único que traen muchos PDF exportados."""
        f = (sp.get("font") or "").lower()
        flags = sp.get("flags", 0)
        negrita = bool(flags & 16) or any(k in f for k in ("bold", "black", "semibold", "heavy"))
        cursiva = bool(flags & 2) or "italic" in f or "oblique" in f
        return negrita, cursiva

    def get_text_block(self, doc_id: str, page_num: int, x: float, y: float) -> Optional[dict]:
        """El texto editable bajo un punto del visor, al nivel más grande que se pueda
        reescribir sin perder formato:

        - `block`: el PÁRRAFO entero, si todas sus líneas comparten fuente, cuerpo y
          dirección. Las líneas que llegan al borde se unen con espacio (es ajuste,
          no un salto del autor) y las cortas con salto de línea.
        - `line`: solo la línea, si el párrafo mezcla estilos pero la línea no.
        - `span`: solo el tramo, si hasta la línea mezcla estilos (una palabra en
          negrita). Es lo que se hacía siempre.

        Antes se editaba siempre un tramo de una línea: un Enter escribía la segunda
        línea ENCIMA de la siguiente del párrafo, y el texto nuevo no se reacomodaba.
        """
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            p = self._desde_vista(page, fitz.Point(x, y))
            todas = [l for b in page.get_text("dict").get("blocks", []) if b.get("type", 0) == 0
                     for l in b.get("lines", [])
                     if any(s.get("text", "").strip() for s in l.get("spans", []))]
            linea = next((l for l in todas if p in fitz.Rect(l["bbox"]) + (-1, -1, 1, 1)), None)
            if linea is None:
                return None
            tramo = next((s for s in linea["spans"]
                          if s.get("text", "").strip() and p in fitz.Rect(s["bbox"]) + (-1, -1, 1, 1)), None)
            return self._bloque_editable(page, self._parrafo_de(todas, linea), linea, tramo)

    # Por dirección de línea: (inicio, fin) a lo largo del renglón y la coordenada en
    # la que se apilan los renglones, para tratar igual texto horizontal y girado.
    @staticmethod
    def _ejes_linea(l):
        x0, y0, x1, y1 = l["bbox"]
        ox, oy = l["spans"][0]["origin"]
        d = tuple(round(v) for v in l.get("dir", (1, 0)))
        if d == (0, -1):
            return -y1, -y0, ox
        if d == (-1, 0):
            return -x1, -x0, -oy
        if d == (0, 1):
            return y0, y1, -ox
        return x0, x1, oy

    def _clave_estilo(self, l):
        ss = [s for s in l["spans"] if s.get("text", "").strip()]
        claves = {(round(s["size"] * 2) / 2, self._base14_font(s.get("font"))) for s in ss}
        return next(iter(claves)) if len(claves) == 1 else None

    def _parrafo_de(self, todas, linea) -> list:
        """Las líneas del párrafo de `linea`. No se fía de los bloques del extractor:
        muchos PDF (los de CAD, y los que escribe el propio PyMuPDF) traen cada renglón
        en un bloque suelto. Se arma por vecindad: misma dirección y estilo, renglones
        que se solapan a lo largo y un interlineado parejo."""
        clave = self._clave_estilo(linea)
        if clave is None:
            return [linea]
        direccion = tuple(round(v) for v in linea.get("dir", (1, 0)))
        cuerpo = clave[0]
        candidatas = [l for l in todas
                      if tuple(round(v) for v in l.get("dir", (1, 0))) == direccion and self._clave_estilo(l) == clave]
        parrafo = [linea]
        for sentido in (1, -1):
            actual, paso = linea, None
            while True:
                a0, a1, ap = self._ejes_linea(actual)
                mejor, dist = None, None
                for l in candidatas:
                    if any(l is q for q in parrafo):
                        continue
                    b0, b1, bp = self._ejes_linea(l)
                    delta = (bp - ap) * sentido
                    if not (0.9 * cuerpo <= delta <= 2.2 * cuerpo) or min(a1, b1) - max(a0, b0) <= 0:
                        continue
                    if dist is None or delta < dist:
                        mejor, dist = l, delta
                if mejor is None or (paso is not None and abs(dist - paso) > 0.2 * paso):
                    break
                paso = paso or dist
                parrafo.append(mejor)
                actual = mejor
        return sorted(parrafo, key=lambda l: self._ejes_linea(l)[2])

    def _bloque_editable(self, page, lineas, linea, tramo) -> dict:
        def tramos(ls):
            return [s for l in ls for s in l["spans"] if s.get("text", "").strip()]

        def uniforme(ls) -> bool:
            ss = tramos(ls)
            ref = ss[0]
            dir0 = tuple(round(v) for v in ls[0].get("dir", (1, 0)))
            return all(abs(s["size"] - ref["size"]) <= 0.6
                       and self._base14_font(s.get("font")) == self._base14_font(ref.get("font"))
                       for s in ss) and all(tuple(round(v) for v in l.get("dir", (1, 0))) == dir0 for l in ls)

        if uniforme(lineas):
            modo, elegidas = ("block" if len(lineas) > 1 else "line"), lineas
        elif uniforme([linea]):
            modo, elegidas = "line", [linea]
        else:
            modo, elegidas = "span", None

        if modo == "span":
            s = tramo or max(tramos([linea]), key=lambda t: len(t["text"]))
            rect = fitz.Rect(s["bbox"])
            texto = s["text"]
            ref = s
            alto_linea = None
            alineacion = "left"
        else:
            ss = tramos(elegidas)
            ref = max(ss, key=lambda t: len(t["text"]))
            dx, dy = (round(v) for v in elegidas[0].get("dir", (1, 0)))
            horizontal = dy == 0
            largo = lambda l: (fitz.Rect(l["bbox"]).width if horizontal else fitz.Rect(l["bbox"]).height)
            maximo = max(largo(l) for l in elegidas)
            partes = []
            fuente = self._base14_font(ref.get("font"))

            def cabia_la_siguiente(l, siguiente) -> bool:
                # El corte es de ajuste si la primera palabra del renglón siguiente NO
                # cabía al final de este: es lo que decide cualquier compositor.
                palabra = "".join(s.get("text", "") for s in siguiente["spans"]).strip().split(" ")[0]
                try:
                    ancho = fitz.get_text_length(" " + palabra, fontname=fuente, fontsize=ref["size"])
                except Exception:
                    ancho = len(palabra) * ref["size"] * 0.5
                return largo(l) + ancho <= maximo + 0.5

            for i, l in enumerate(elegidas):
                t = "".join(s.get("text", "") for s in l["spans"]).strip()
                if i == len(elegidas) - 1:
                    partes.append(t)
                elif not cabia_la_siguiente(l, elegidas[i + 1]):
                    # Línea llena: el corte es del ajuste, no del autor. Un guion al
                    # final se conserva pegado (no se sabe si era de partición).
                    partes.append(t if t.endswith("-") else t + " ")
                else:
                    partes.append(t + "\n")
            texto = "".join(partes)
            rect = fitz.Rect()
            for l in elegidas:
                rect |= fitz.Rect(l["bbox"])
            # Interlineado real del párrafo (distancia entre orígenes / cuerpo): sin
            # esto el texto reescrito queda más apretado o más suelto que el original.
            alto_linea = None
            if len(elegidas) > 1:
                ejes = [l["spans"][0]["origin"][1 if horizontal else 0] for l in elegidas]
                pasos = sorted(abs(b - a) for a, b in zip(ejes, ejes[1:]))
                paso = pasos[len(pasos) // 2]
                if paso > 0:
                    alto_linea = round(paso / ref["size"], 3)
            alineacion = "left"
            if horizontal and len(elegidas) > 1:
                cajas = [fitz.Rect(l["bbox"]) for l in elegidas]
                izq = max(c.x0 for c in cajas) - min(c.x0 for c in cajas)
                der = max(c.x1 for c in cajas) - min(c.x1 for c in cajas)
                cen = max((c.x0 + c.x1) / 2 for c in cajas) - min((c.x0 + c.x1) / 2 for c in cajas)
                if izq > 4 and cen <= 2:
                    alineacion = "center"
                elif izq > 4 and der <= 2:
                    alineacion = "right"

        negrita, cursiva = self._estilo_span(ref)
        x0, y0, x1, y1 = self._a_vista(page, rect)
        return {
            "mode": modo,
            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "text": texto,
            "size": ref.get("size", 12),
            "color": "#%06x" % (ref.get("color", 0) & 0xFFFFFF),
            "font": ref.get("font", ""),
            "bold": negrita,
            "italic": cursiva,
            "align": alineacion,
            "lineHeight": alto_linea,
        }

    def get_text_clip(self, doc_id: str, page_num: int, x: float, y: float, w: float, h: float) -> str:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return ""
            page = doc.load_page(page_num)
            rect = self._desde_vista(page, fitz.Rect(x, y, x + w, y + h))
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
                if page.rotation:
                    x, y = self._a_vista(page, fitz.Point(x, y))
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

    def pages_without_text(self, doc_id: str) -> Optional[List[int]]:
        """Índices de las páginas sin capa de texto, o sea las que el OCR tendría que
        procesar. Barato (no rasteriza nada) y sirve para poder decirle al usuario
        cuánto va a tardar ANTES de arrancar: el OCR de un documento entero son
        minutos con la app tomada y no se puede cancelar."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            return [i for i in range(len(doc)) if not doc.load_page(i).get_text().strip()]

    def make_searchable(self, doc_id: str, pages: Optional[List[int]] = None, stash: bool = True):
        """OCR scanned pages and embed an invisible text layer so they become
        searchable/selectable. Returns (words, stash_id, stash_page). words=-1 if
        Tesseract is unavailable."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return 0, '', None
            indices = pages if pages is not None else list(range(len(doc)))
            to_ocr = [i for i in indices if 0 <= i < len(doc) and not doc.load_page(i).get_text().strip()]
            if not to_ocr:
                return 0, '', None
            try:
                import pytesseract
                from pytesseract import Output
                from PIL import Image
                from io import BytesIO
            except Exception:
                return -1, '', None
            try:
                pytesseract.get_tesseract_version()
            except Exception:
                return -1, '', None

            DPI = 200
            scale = 72.0 / DPI
            stash_id = ''
            stash_page = None
            if stash:
                if len(to_ocr) == 1:
                    stash_id = self._stash_pages(doc, to_ocr)
                    stash_page = to_ocr[0]
                else:
                    stash_id = self._stash_document(doc)
            total = 0
            for i in to_ocr:
                page = doc.load_page(i)
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
            return total, stash_id, stash_page

    def ocr_page(self, doc_id: str, page_num: int) -> Optional[str]:
        with self._lock:
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
