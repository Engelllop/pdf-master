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


class PagesMixin:
    def rotate_page(self, doc_id: str, page_num: int, degrees: int) -> bool:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        page.set_rotation((page.rotation + degrees) % 360)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def rotate_all_pages(self, doc_id: str, degrees: int) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        for i in range(len(doc)):
            page = doc.load_page(i)
            page.set_rotation((page.rotation + degrees) % 360)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def rotate_pages(self, doc_id: str, pages: List[int], degrees: int) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        for p in pages:
            if 0 <= p < len(doc):
                page = doc.load_page(p)
                page.set_rotation((page.rotation + degrees) % 360)
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def reorder_pages(self, doc_id: str, new_order: List[int]) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        if len(new_order) != len(doc) or set(new_order) != set(range(len(doc))):
            return False
        doc.select(new_order)
        info = self._infos.get(doc_id)
        if info:
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def delete_pages(self, doc_id: str, pages: List[int], stash: bool = True) -> Optional[str]:
        """None = falló. '' = ok sin guardar. uuid = páginas en el stash para undo."""
        doc = self._acquire(doc_id)
        if not doc:
            return None
        valid = [p for p in sorted(set(pages)) if 0 <= p < len(doc)]
        if not valid:
            return None
        stash_id = self._stash_pages(doc, valid) if stash else ''
        for p in reversed(valid):
            doc.delete_page(p)
        info = self._infos.get(doc_id)
        if info:
            info.page_count = len(doc)
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return stash_id

    def restore_pages(self, doc_id: str, stash_id: str, at: List[int]) -> bool:
        """Reinserta las páginas del stash en los índices originales (de menor a mayor)."""
        data = self._page_stash.get(stash_id)
        if not data:
            return False
        doc = self._acquire(doc_id)
        if not doc:
            return False
        src = fitz.open(stream=data, filetype='pdf')
        if len(at) != len(src):
            src.close()
            return False
        try:
            for i, pos in enumerate(at):
                idx = max(0, min(len(doc), pos))
                doc.insert_pdf(src, from_page=i, to_page=i, start_at=idx)
        finally:
            src.close()
        info = self._infos.get(doc_id)
        if info:
            info.page_count = len(doc)
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def restore_document(self, doc_id: str, stash_id: str) -> bool:
        """Reemplaza el documento vivo por la copia del stash."""
        data = self._page_stash.get(stash_id)
        if not data:
            return False
        with self._lock:
            if doc_id not in self._infos:
                return False
            src = fitz.open(stream=data, filetype='pdf')
            old = self._docs.get(doc_id)
            self._docs[doc_id] = src
            if old is not None:
                try:
                    old.close()
                except Exception:
                    pass
            info = self._infos.get(doc_id)
            if info:
                info.page_count = len(src)
                info.page_sizes = [PageSize(page_num=i, width=src.load_page(i).rect.width, height=src.load_page(i).rect.height) for i in range(len(src))]
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            self._lru.pop(doc_id, None)
            self._lru[doc_id] = None
            return True

    def merge_pdf(self, doc_id: str, source_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc or not os.path.exists(source_path):
            return False
        try:
            src = fitz.open(source_path)
            doc.insert_pdf(src)
            src.close()
            info = self._infos.get(doc_id)
            if info:
                info.page_count = len(doc)
                info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return True
        except Exception:
            logger.exception("merge_pdf falló (doc %s, fuente %s)", doc_id, source_path)
            return False

    def split_pages(self, doc_id: str, pages: List[int], output_path: Optional[str] = None) -> Optional[str]:
        doc = self._acquire(doc_id)
        if not doc:
            return None
        new_doc = fitz.open()
        for p in pages:
            if 0 <= p < len(doc):
                new_doc.insert_pdf(doc, from_page=p, to_page=p)
        save_path = output_path or os.path.join(os.path.dirname(self._doc_path(doc_id)), f"split_{uuid.uuid4().hex[:8]}.pdf")
        new_doc.save(save_path)
        new_doc.close()
        return save_path

    def crop_page(self, doc_id: str, page_num: int, top: float, right: float, bottom: float, left: float, stash: bool = True) -> Optional[str]:
        """None = falló. '' = ok sin stash. uuid = página original para undo."""
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return None
        page = doc.load_page(page_num)
        rect = page.rect
        new_rect = fitz.Rect(rect.x0 + left, rect.y0 + top, rect.x1 - right, rect.y1 - bottom)
        if new_rect.width <= 0 or new_rect.height <= 0:
            return None
        stash_id = self._stash_pages(doc, [page_num]) if stash else ''
        page.set_cropbox(new_rect)
        info = self._infos.get(doc_id)
        if info:
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return stash_id

    def replace_page(self, doc_id: str, page_num: int, stash_id: str) -> bool:
        """Sustituye una página por la copia del stash (undo de recorte/redacción)."""
        data = self._page_stash.get(stash_id)
        if not data:
            return False
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        src = fitz.open(stream=data, filetype='pdf')
        try:
            doc.delete_page(page_num)
            doc.insert_pdf(src, from_page=0, to_page=0, start_at=page_num)
        finally:
            src.close()
        info = self._infos.get(doc_id)
        if info:
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        self._invalidate_render_cache(doc_id)
        return True

    def duplicate_page(self, doc_id: str, page_num: int) -> bool:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return False
            doc.fullcopy_page(page_num, page_num + 1)
            info = self._infos.get(doc_id)
            if info:
                info.page_count = len(doc)
                info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return True

    def insert_blank_page(self, doc_id: str, index: int,
                          width: Optional[float] = None, height: Optional[float] = None) -> bool:
        """Sin medidas explícitas, la página en blanco copia el tamaño de su vecina.
        Antes era A4 fijo: insertar una hoja en medio de un juego de planos metía una
        A4 diminuta entre láminas de 3024 pt."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return False
            idx = max(0, min(len(doc), index))
            if width is None or height is None:
                ref = max(0, min(len(doc) - 1, idx - 1)) if len(doc) else -1
                if ref >= 0:
                    rect = doc.load_page(ref).rect
                    width = width if width is not None else rect.width
                    height = height if height is not None else rect.height
                else:
                    width = width if width is not None else 595
                    height = height if height is not None else 842
            doc.new_page(pno=idx, width=width, height=height)
            info = self._infos.get(doc_id)
            if info:
                info.page_count = len(doc)
                info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return True
