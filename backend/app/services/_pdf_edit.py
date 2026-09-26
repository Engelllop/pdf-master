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
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError, texto_estampable

logger = logging.getLogger("pdfmaster")


MARGEN = 18  # pt de margen mínimo desde el borde de la página


def _paginas_objetivo(doc, pages: Optional[List[int]]) -> List[int]:
    """Índices sobre los que aplicar la operación. `None` (o lista vacía) = todo el
    documento, que es como se comportaban marca de agua, encabezado/pie y numeración
    antes de que se pudiera elegir rango. Se descartan los índices fuera del
    documento en vez de reventar: el rango lo escribe el usuario a mano."""
    total = len(doc)
    if not pages:
        return list(range(total))
    return sorted({i for i in pages if 0 <= i < total})


class EditMixin:
    # Tope de repeticiones por página: con una fuente pequeña en un plano grande la
    # rejilla se dispara y el motor (1 worker, PyMuPDF) se queda colgado.
    MAX_WATERMARK_TILES = 400

    def _texto_en_vista(self, page, punto, texto, morph=None, **opciones):
        """insert_text con el punto (y el pivote del morph) en coordenadas de pantalla.

        En una página con /Rotate, insert_text escribe en la página SIN girar: la marca
        de agua, el encabezado o el número caían en otro lado y girados. Se lleva el punto
        a ese espacio y se gira el texto con la página para que se lea igual que en
        pantalla. Sin rotación es exactamente la llamada de antes."""
        if page.rotation:
            punto = self._desde_vista(page, fitz.Point(punto))
            if morph:
                morph = (self._desde_vista(page, fitz.Point(morph[0])), morph[1])
            opciones["rotate"] = page.rotation
        if morph:
            opciones["morph"] = morph
        return page.insert_text(punto, texto, **opciones)

    def add_watermark(self, doc_id: str, text: str, color: str = "#888888", fontsize: float = 48,
                      angle: int = 45, opacity: float = 0.3, tiled: bool = True, stash: bool = True,
                      pages: Optional[List[int]] = None) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            stash_id = self._stash_document(doc) if stash else ''
            rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0.5, 0.5, 0.5)
            text = texto_estampable(text)
            text_width = fitz.get_text_length(text, fontsize=fontsize)
            for i in _paginas_objetivo(doc, pages):
                page = doc.load_page(i)
                rect = page.rect
                # insert_text(rotate=...) solo acepta múltiplos de 90; el diagonal de 45°
                # se hace con morph (rotación alrededor del punto de anclaje).
                if not tiled:
                    pivot = fitz.Point(rect.width / 2, rect.height / 2)
                    insert = fitz.Point(pivot.x - text_width / 2, pivot.y + fontsize / 4)
                    self._texto_en_vista(page, insert, text, morph=(pivot, fitz.Matrix(angle)),
                                         fontsize=fontsize, color=rgb, fill_opacity=opacity, overlay=True)
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
                        self._texto_en_vista(page, fitz.Point(x, y), text, morph=(pivot, fitz.Matrix(angle)),
                                             fontsize=fontsize, color=rgb, fill_opacity=opacity, overlay=True)
                        drawn += 1
                        x += step_x
                    y += step_y
                    row += 1
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def redact_area(self, doc_id: str, page_num: int, x: float, y: float, width: float, height: float, stash: bool = True) -> Optional[str]:
        """None = falló. '' = ok sin stash. uuid = página original para undo."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            stash_id = self._stash_pages(doc, [page_num]) if stash else ''
            page = doc.load_page(page_num)
            rect = self._desde_vista(page, fitz.Rect(x, y, x + width, y + height))
            page.add_redact_annot(rect)
            page.apply_redactions()
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def insert_image(self, doc_id: str, page_num: int, x: float, y: float, width: float, height: float, image_path: str, stash: bool = True) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc) or not os.path.exists(image_path):
                return None
            stash_id = self._stash_pages(doc, [page_num]) if stash else ''
            page = doc.load_page(page_num)
            rect = self._desde_vista(page, fitz.Rect(x, y, x + width, y + height))
            # insert_image gira la imagen con la página: se compensa para que quede
            # derecha en pantalla.
            page.insert_image(rect, filename=image_path, rotate=page.rotation)
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def add_header_footer(self, doc_id: str, header: Optional[str] = None, footer: Optional[str] = None, fontsize: float = 10, color: str = "#000000", stash: bool = True, pages: Optional[List[int]] = None) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            stash_id = self._stash_document(doc) if stash else ''
            rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
            header = texto_estampable(header) if header else header
            footer = texto_estampable(footer) if footer else footer
            for i in _paginas_objetivo(doc, pages):
                page = doc.load_page(i)
                rect = page.rect
                # Centrado, pero sin dejar que un texto más ancho que la página se salga
                # por la izquierda (x negativa): con un encabezado largo, el principio de la
                # frase quedaba fuera del papel.
                if header:
                    tw = fitz.get_text_length(header, fontsize=fontsize)
                    self._texto_en_vista(page, (max(MARGEN, rect.width / 2 - tw / 2), 20), header,
                                         fontsize=fontsize, color=rgb, overlay=True)
                if footer:
                    tw = fitz.get_text_length(footer, fontsize=fontsize)
                    self._texto_en_vista(page, (max(MARGEN, rect.width / 2 - tw / 2), rect.height - 10), footer,
                                         fontsize=fontsize, color=rgb, overlay=True)
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def replace_text(self, doc_id: str, query: str, replace: str, page_num: Optional[int] = None, case_sensitive: bool = False, replace_all: bool = True, stash: bool = True):
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or not query:
                return 0, '', None
            count = 0
            stash_id = ''
            stash_page = None
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
                if stash and not stash_id:
                    if page_num is not None or not replace_all:
                        stash_id = self._stash_pages(doc, [p])
                        stash_page = p
                    else:
                        stash_id = self._stash_document(doc)
                # Con `replace_all=False` se reemplaza UNA ocurrencia, no todas las de la
                # página: se borraban las tres «REV B» de una lámina y se escribía una sola.
                objetivos = rects if replace_all else rects[:1]
                # El estilo se toma ANTES de redactar: `apply_redactions` se lleva el texto
                # original, así que leído después no hay span que consultar y todo salía en
                # negro al tamaño estimado por la altura del rect.
                estilos = [self._style_at(page, r) for r in objetivos]
                # Redact old text
                for rect in objetivos:
                    page.add_redact_annot(rect)
                # LINE_ART_NONE: `apply_redactions()` por omisión BORRA el dibujo vectorial
                # que quede contenido en el rect (`REMOVE_IF_COVERED`). Acá el rect es el de
                # un texto, no una redacción: reemplazar «REV B» por «REV C» en un plano se
                # llevaba el achurado o el guion que hubiera detrás, en silencio. Las
                # herramientas de redactar de verdad (área y buscar-y-redactar) sí lo borran.
                # IMAGE_NONE por lo mismo: por omisión (`IMAGE_PIXELS`) se blanquean los
                # píxeles de las imágenes que toca el rect, así que reemplazar un texto sobre
                # un plano ESCANEADO dejaba un rectángulo blanco en el escaneo.
                page.apply_redactions(graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                                      images=fitz.PDF_REDACT_IMAGE_NONE)
                # Una inserción por ocurrencia. Antes se insertaba solo en la primera y las
                # demás quedaban borradas y sin reemplazo — texto que desaparecía del plano,
                # y encima el aviso contaba todas como reemplazadas.
                for rect, (size, fontname, rgb, base) in zip(objetivos, estilos):
                    page.insert_text(
                        (rect.x0, base), texto_estampable(replace), fontsize=size, color=rgb,
                        fontname=self._base14_font(fontname), overlay=True,
                    )
                count += len(objetivos)
                if not replace_all:
                    break
            if count > 0:
                self._dirty[doc_id] = True
                self._invalidate_render_cache(doc_id)
            return count, stash_id, stash_page

    def set_metadata(self, doc_id: str, title: Optional[str] = None, author: Optional[str] = None, subject: Optional[str] = None, keywords: Optional[str] = None) -> Optional[dict]:
        """None = falló. Si ok, devuelve los metadatos anteriores para undo."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            meta = doc.metadata or {}
            previous = {
                'title': meta.get('title') or '',
                'author': meta.get('author') or '',
                'subject': meta.get('subject') or '',
                'keywords': meta.get('keywords') or '',
            }
            if title is not None:
                meta['title'] = title
            if author is not None:
                meta['author'] = author
            if subject is not None:
                meta['subject'] = subject
            if keywords is not None:
                meta['keywords'] = keywords
            doc.set_metadata(meta)
            info = self._infos.get(doc_id)
            if info:
                if title is not None:
                    info.title = title or None
                if author is not None:
                    info.author = author or None
                if subject is not None:
                    info.subject = subject or None
            self._dirty[doc_id] = True
            # Sin invalidar el cache de render: los metadatos no se ven en la página.
            return previous

    @staticmethod
    def _style_at(page, rect):
        """Fuente/tamaño/color y LÍNEA BASE del span que intersecta el rect (para
        replace). La línea base sale del `origin` del span porque `insert_text` recibe
        justamente eso: pasándole la esquina superior del rect, el reemplazo salía una
        línea más arriba que el texto que sustituía — encima de lo que hubiera ahí."""
        size = max(8, min(72, int(rect.height * 0.8)))
        fontname = None
        rgb = (0.0, 0.0, 0.0)
        # Sin span que consultar, la base se estima: el descendente ronda un 22 % de la
        # altura de la caja de búsqueda.
        base = rect.y1 - rect.height * 0.22
        try:
            for block in page.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        sr = fitz.Rect(span.get("bbox", rect))
                        if not sr.intersects(rect):
                            continue
                        size = float(span.get("size") or size)
                        fontname = span.get("font")
                        c = span.get("color", 0)
                        if isinstance(c, int):
                            rgb = ((c >> 16) / 255.0, ((c >> 8) & 255) / 255.0, (c & 255) / 255.0)
                        origen = span.get("origin")
                        if origen:
                            base = float(origen[1])
                        return size, fontname, rgb, base
        except Exception:
            pass
        return size, fontname, rgb, base

    @staticmethod
    def _base14_font(font: Optional[str]) -> str:
        """Mapea el nombre de fuente detectado a una base14 de PyMuPDF."""
        f = (font or "").lower()
        bold = "bold" in f or "black" in f or "semibold" in f
        italic = "italic" in f or "oblique" in f
        if "courier" in f or "mono" in f or "consol" in f:
            return "cobi" if bold and italic else "coit" if italic else "cobo" if bold else "cour"
        if "times" in f or "georgia" in f or "serif" in f or "roman" in f or "garamond" in f:
            return "tibi" if bold and italic else "tiit" if italic else "tibo" if bold else "tiro"
        return "hebi" if bold and italic else "heit" if italic else "hebo" if bold else "helv"

    def edit_text_span(self, doc_id: str, page_num: int, x0: float, y0: float,
                       x1: float, y1: float, text: str, size: Optional[float] = None,
                       color: str = "#000000", font: Optional[str] = None, stash: bool = True) -> Optional[str]:
        """Edición in-situ: tapa el span original con el color de fondo muestreado y
        reinserta el texto nuevo en la misma posición, mapeando la fuente a una base14
        aproximada (PyMuPDF no reusa fuentes incrustadas por nombre)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            stash_id = self._stash_pages(doc, [page_num]) if stash else ''
            page = doc.load_page(page_num)
            # El span llega en coordenadas de pantalla (las de /spans). El clip del pixmap
            # va en ese mismo espacio; la redacción, en el de la página sin girar.
            vista = fitz.Rect(x0, y0, x1, y1)
            rect = self._desde_vista(page, vista)
            # Color de fondo: el píxel más claro del borde del span (evita los glifos).
            fill = (1.0, 1.0, 1.0)
            try:
                pix = page.get_pixmap(clip=vista, colorspace=fitz.csRGB, alpha=False)
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
            span_previo = self._span_en(page, rect) if page.rotation else None
            page.add_redact_annot(rect, fill=fill)
            # Editar un span redacta como paso intermedio: ni el dibujo contenido en
            # el rect ni los píxeles del escaneo de abajo son suyos (ver replace_text).
            page.apply_redactions(graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                                  images=fitz.PDF_REDACT_IMAGE_NONE)
            c = color.lstrip("#")
            rgb = tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)) if len(c) == 6 else (0, 0, 0)
            text = texto_estampable(text)
            if page.rotation:
                # En una página girada el texto puede ir en cualquier sentido respecto de
                # la pantalla (lo normal es que vaya girado con ella): se reescribe en el
                # origen y la dirección del span que había, leídos ANTES de redactarlo.
                origen, giro = span_previo or ((rect.x0, rect.y1 - max(1.0, rect.height * 0.2)), 0)
                fs = size or max(6.0, min(vista.width, vista.height) * 0.85)
                opciones = dict(fontsize=fs, color=rgb, overlay=True, rotate=giro)
            else:
                origen = (x0, y1 - max(1.0, (y1 - y0) * 0.2))
                fs = size or max(6.0, (y1 - y0) * 0.85)
                opciones = dict(fontsize=fs, color=rgb, overlay=True)
            try:
                page.insert_text(origen, text, fontname=self._base14_font(font), **opciones)
            except Exception:
                page.insert_text(origen, text, **opciones)
            self._dirty[doc_id] = True
            # Editar un span cambia el bitmap: sin invalidar, `/pdf/page-image` (export
            # a PNG, contexto «página actual» de la IA) y los puntos de snap seguían
            # siendo los de antes de la edición.
            self._invalidate_render_cache(doc_id)
            return stash_id

    # Dirección de la línea (PyMuPDF, página sin girar) → `rotate` de insert_text.
    _GIRO_POR_DIRECCION = {(1, 0): 0, (0, -1): 90, (-1, 0): 180, (0, 1): 270}

    @classmethod
    def _span_en(cls, page, rect):
        """(origen, giro) del span que más ocupa `rect` (sin girar), o None."""
        mejor, area = None, 0.0
        for bloque in page.get_text("dict").get("blocks", []):
            for linea in bloque.get("lines", []):
                dx, dy = linea.get("dir", (1, 0))
                giro = cls._GIRO_POR_DIRECCION.get((round(dx), round(dy)), 0)
                for sp in linea.get("spans", []):
                    comun = fitz.Rect(sp["bbox"]) & rect
                    if not comun.is_empty and comun.get_area() > area:
                        mejor, area = (tuple(sp["origin"]), giro), comun.get_area()
        return mejor

    @staticmethod
    def _giro_de_imagen(page, xref: int, rect) -> int:
        """Múltiplo de 90 con que está colocada la imagen (su matriz), para reinsertarla
        igual. Sin esto, mover una imagen girada —la de una página con /Rotate que se ve
        derecha, o una insertada con giro— la dejaba de lado y encogida."""
        giro, area = 0, -1.0
        for info in page.get_image_info(xrefs=True):
            if info.get("xref") != xref:
                continue
            comun = fitz.Rect(info["bbox"]) & rect
            a = comun.get_area() if not comun.is_empty else 0.0
            if a <= area:
                continue
            area = a
            ta, tb, tc, td = info["transform"][:4]
            giro = (0 if ta > 0 and td > 0 else 90 if tb < 0 and tc > 0 else
                    180 if ta < 0 and td < 0 else 270 if tb > 0 and tc < 0 else 0)
        return giro

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
                    x0, y0, x1, y1 = self._a_vista(page, fitz.Rect(info["bbox"]))
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
                        delete: bool = False, replace_path: Optional[str] = None, stash: bool = True) -> Optional[str]:
        """Mueve/redimensiona/borra/reemplaza una imagen existente: tapa el área
        original con el color de fondo muestreado y, si no es borrado, reinserta (la
        misma imagen o una nueva) en el rect destino."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            stash_id = self._stash_pages(doc, [page_num]) if stash else ''
            page = doc.load_page(page_num)
            img_bytes: Optional[bytes] = None
            if not delete:
                if replace_path:
                    try:
                        with open(replace_path, "rb") as f:
                            img_bytes = f.read()
                    except Exception:
                        return None
                else:
                    try:
                        ext = doc.extract_image(xref)
                        img_bytes = ext.get("image") if ext else None
                    except Exception:
                        img_bytes = None
            # `old`/`new` en coordenadas de pantalla (las de list_page_images). El muestreo
            # del fondo usa un pixmap, que va en ese espacio; la redacción y la imagen, en
            # el de la página sin girar. La imagen se reinserta con el giro que tenía.
            old_vista = fitz.Rect(*old)
            old_rect = self._desde_vista(page, old_vista)
            giro = self._giro_de_imagen(page, xref, old_rect)
            page.add_redact_annot(old_rect, fill=self._sample_bg_color(page, old_vista))
            try:
                # Igual que arriba: se está moviendo/rotando una imagen, no redactando.
                # Borrar el dibujo que quedaba debajo de su posición vieja era destruir
                # contenido del plano.
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE,
                                      graphics=fitz.PDF_REDACT_LINE_ART_NONE)
            except Exception:
                # Sin IMAGE_NONE a propósito: si el borrado de la imagen vieja falló,
                # que al menos se blanqueen sus píxeles (lo que hace `IMAGE_PIXELS` por
                # omisión). Si no, quedaría el fantasma de la imagen en su sitio viejo.
                page.apply_redactions(graphics=fitz.PDF_REDACT_LINE_ART_NONE)
            if not delete and img_bytes:
                try:
                    page.insert_image(self._desde_vista(page, fitz.Rect(*(new or old))), stream=img_bytes,
                                      rotate=giro)
                except Exception:
                    return None
            self._dirty[doc_id] = True
            # Mover, rotar o borrar una imagen también cambia el bitmap de la página.
            self._invalidate_render_cache(doc_id)
            return stash_id

    def add_page_numbers(self, doc_id: str, prefix: str = "", start: int = 1, position: str = "bottom", fontsize: float = 10, color: str = "#000000", stash: bool = True, pages: Optional[List[int]] = None) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            stash_id = self._stash_document(doc) if stash else ''
            rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
            prefix = texto_estampable(prefix)
            n = len(doc)
            # El número sigue siendo el de la página dentro del documento (`start + i`),
            # no el de la enésima página sellada: al numerar solo las láminas 5-10, lo
            # útil es que digan 5..10, no 1..6.
            for i in _paginas_objetivo(doc, pages):
                page = doc.load_page(i)
                # Bates-style fixed-width number when a prefix is given, else "k / n"
                label = f"{prefix}{start + i:06d}" if prefix else f"{start + i} / {n}"
                rect = page.rect
                tw = fitz.get_text_length(label, fontsize=fontsize)
                x = rect.width / 2 - tw / 2
                y = rect.height - 18 if position == "bottom" else 24
                self._texto_en_vista(page, (x, y), label, fontsize=fontsize, color=rgb, overlay=True)
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def redact_matches(self, doc_id: str, query: str, stash: bool = True):
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or not query:
                return 0, ''
            hits = []
            for i in range(len(doc)):
                rects = doc.load_page(i).search_for(query)
                if rects:
                    hits.append((i, rects))
            if not hits:
                return 0, ''
            stash_id = self._stash_document(doc) if stash else ''
            count = 0
            for i, rects in hits:
                page = doc.load_page(i)
                for r in rects:
                    page.add_redact_annot(r, fill=(0, 0, 0))
                    count += 1
                page.apply_redactions()
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return count, stash_id
