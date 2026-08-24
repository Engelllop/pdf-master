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


class RenderMixin:
    def get_page_info(self, doc_id: str, page_num: int, zoom: float = 1.0) -> Optional[dict]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            max_px = 3000 if zoom <= 1.6 else 6000
            scale = self._capped_scale(page, zoom * settings.RENDER_DPI / 72, max_px)
            pw = int(page.rect.width * scale)
            ph = int(page.rect.height * scale)
            return {
                "page_num": page_num,
                "width": pw,
                "height": ph,
                "original_width": page.rect.width,
                "original_height": page.rect.height,
            }

    def get_pdf_bytes(self, doc_id: str) -> Optional[bytes]:
        """Serializa el documento en memoria (incluye rotaciones/borrados aún sin
        guardar) para que PDF.js lo renderice en el cliente. El PDF resultante queda
        desencriptado (PyMuPDF ya autenticó al abrir), así PDF.js no pide contraseña."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            # Sin cambios y sin cifrado, el documento en memoria es el archivo: leerlo
            # de disco evita re-comprimir decenas de MB (con el lock y el único worker
            # tomados) cada vez que PDF.js pide el PDF de un plano recién abierto.
            if not self._dirty.get(doc_id) and not doc.is_encrypted:
                try:
                    with open(self._doc_path(doc_id), "rb") as fh:
                        return fh.read()
                except OSError:
                    pass
            return doc.tobytes(garbage=0, deflate=True)

    def get_page_image_bytes(self, doc_id: str, page_num: int, zoom: float = 1.0) -> Optional[bytes]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            cache_key = (doc_id, page_num, zoom)
            if cache_key in self._render_cache:
                render = self._render_cache[cache_key]
                # Extract raw base64 bytes
                b64 = render.image_base64.split(',')[1]
                return base64.b64decode(b64)
            page = doc.load_page(page_num)
            max_px = 3000 if zoom <= 1.6 else 6000
            scale = self._capped_scale(page, zoom * settings.RENDER_DPI / 72, max_px)
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, alpha=False, annots=False)
            return pix.tobytes("png")

    def render_tile_bytes(self, doc_id: str, page_num: int, x0: float, y0: float,
                          x1: float, y1: float, zoom: float) -> Optional[bytes]:
        """Render only a sub-rectangle (in PDF points) of a page at the true target
        zoom. Used for crisp deep-zoom on dense plans without rasterizing the whole
        page at huge resolution. The tile pixel size is capped so a single request
        can't block the render thread."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            clip = fitz.Rect(x0, y0, x1, y1) & page.rect
            if clip.is_empty or clip.width <= 0 or clip.height <= 0:
                return None
            desired = zoom * settings.RENDER_DPI / 72
            md = max(clip.width, clip.height)
            scale = max(0.05, min(desired, 4000 / md)) if md > 0 else desired
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False, annots=False)
            return pix.tobytes("png")

    def render_page(self, doc_id: str, page_num: int, zoom: float = 1.0) -> Optional[PageRender]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None

            cache_key = (doc_id, page_num, zoom)
            if cache_key in self._render_cache:
                return self._render_cache[cache_key]

            page = doc.load_page(page_num)
            # Modest cap for the base view (fast first paint), larger cap when the user
            # zooms in (sharper on demand) — keeps huge CAD plans both responsive and legible.
            max_px = 3000 if zoom <= 1.6 else 6000
            scale = self._capped_scale(page, zoom * settings.RENDER_DPI / 72, max_px)
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, alpha=False, annots=False)

            img_data = pix.tobytes("png")
            img_b64 = base64.b64encode(img_data).decode('utf-8')

            result = PageRender(
                page_num=page_num,
                image_base64=f"data:image/png;base64,{img_b64}",
                width=pix.width,
                height=pix.height,
                original_width=page.rect.width,
                original_height=page.rect.height
            )
            self._render_cache[cache_key] = result
            if len(self._render_cache) > self._render_cache_max:
                self._render_cache.popitem(last=False)
            return result

    def render_thumbnail(self, doc_id: str, page_num: int) -> Optional[ThumbnailRender]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None

            cache_key = (doc_id, page_num)
            if cache_key in self._thumb_cache:
                return self._thumb_cache[cache_key]

            page = doc.load_page(page_num)
            scale = self._capped_scale(page, settings.THUMBNAIL_DPI / 72, 300)
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, alpha=False, annots=False)

            img_data = pix.tobytes("png")
            img_b64 = base64.b64encode(img_data).decode('utf-8')

            result = ThumbnailRender(
                page_num=page_num,
                image_base64=f"data:image/png;base64,{img_b64}",
                width=pix.width,
                height=pix.height
            )
            self._thumb_cache[cache_key] = result
            if len(self._thumb_cache) > self._thumb_cache_max:
                self._thumb_cache.popitem(last=False)
            return result
