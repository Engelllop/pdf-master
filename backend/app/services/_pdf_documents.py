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


class DocumentsMixin:
    def open_document(self, file_path: str, password: Optional[str] = None) -> PdfInfo:
        doc = self._open_stream(file_path)
        if doc.needs_pass:
            if not password:
                doc.close()
                raise PasswordRequiredError("Document requires a password")
            auth_result = doc.authenticate(password)
            if not auth_result:
                doc.close()
                raise PasswordRequiredError("Incorrect password")
        doc_id = str(uuid.uuid4())

        page_sizes = []
        for i in range(len(doc)):
            rect = doc.load_page(i).rect
            page_sizes.append(PageSize(page_num=i, width=rect.width, height=rect.height))

        info = PdfInfo(
            doc_id=doc_id,
            file_path=file_path,
            page_count=len(doc),
            title=doc.metadata.get("title"),
            author=doc.metadata.get("author"),
            subject=doc.metadata.get("subject"),
            current_page=0,
            page_sizes=page_sizes
        )

        with self._lock:
            self._docs[doc_id] = doc
            self._infos[doc_id] = info
            self._dirty[doc_id] = False
            self._passwords[doc_id] = password
            self._lru[doc_id] = None
            self._evict_inactive()
        return info

    def get_document(self, doc_id: str) -> Optional[fitz.Document]:
        return self._acquire(doc_id)

    def get_info(self, doc_id: str) -> Optional[PdfInfo]:
        return self._infos.get(doc_id)

    def create_blank_pdf(self, output_path: str, page_width: float = 595, page_height: float = 842, page_count: int = 1) -> Optional[PdfInfo]:
        doc = fitz.open()
        for _ in range(page_count):
            doc.new_page(width=page_width, height=page_height)
        doc.save(output_path)
        doc.close()
        return self.open_document(output_path)

    def compress(self, doc_id: str, output_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        try:
            doc.save(output_path, garbage=4, deflate=True, clean=True)
            return True
        except Exception:
            logger.exception("compress falló (doc %s → %s)", doc_id, output_path)
            return False

    def save(self, doc_id: str, output_path: Optional[str] = None) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            save_path = output_path or self._doc_path(doc_id)
            if not save_path:
                return None
            temp_path = None
            try:
                import tempfile
                dir_name = os.path.dirname(os.path.abspath(save_path))
                fd, temp_path = tempfile.mkstemp(suffix='.pdf', dir=dir_name)
                os.close(fd)
                doc.save(temp_path, garbage=4, deflate=True)
                # El doc se abrió por stream: el motor no tiene el archivo abierto, así
                # que os.replace sobre el original funciona sin cerrar/reabrir el handle.
                os.replace(temp_path, save_path)
                self._dirty[doc_id] = False
                return save_path
            except Exception:
                logger.exception("save falló (doc %s → %s)", doc_id, save_path)
                try:
                    if temp_path and os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception:
                    pass
                return None

    def save_with_password(self, doc_id: str, output_path: Optional[str] = None, user_password: Optional[str] = None, owner_password: Optional[str] = None) -> Optional[str]:
        doc = self._acquire(doc_id)
        if not doc:
            return None
        save_path = output_path or self._doc_path(doc_id)
        try:
            import tempfile
            dir_name = os.path.dirname(os.path.abspath(save_path))
            fd, temp_path = tempfile.mkstemp(suffix='.pdf', dir=dir_name)
            os.close(fd)
            if user_password or owner_password:
                doc.save(temp_path, garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=user_password or '', owner_pw=owner_password or user_password or '')
            else:
                doc.save(temp_path, garbage=4, deflate=True)
            if os.path.exists(save_path):
                os.replace(temp_path, save_path)
            else:
                os.rename(temp_path, save_path)
            self._dirty[doc_id] = False
            return save_path
        except DocumentNotFoundError:
            raise
        except Exception:
            logger.exception("save_with_password falló (doc %s)", doc_id)
            return None

    def compare_text(self, doc_id_a: str, doc_id_b: str) -> Optional[dict]:
        import difflib
        with self._lock:
            a = self._acquire(doc_id_a)
            b = self._acquire(doc_id_b)
            if not a or not b:
                return None
            text_a = [a.load_page(i).get_text() for i in range(len(a))]
            text_b = [b.load_page(i).get_text() for i in range(len(b))]
        diffs = []
        for i in range(max(len(text_a), len(text_b))):
            ta = text_a[i] if i < len(text_a) else ""
            tb = text_b[i] if i < len(text_b) else ""
            if ta == tb:
                continue
            sm = difflib.SequenceMatcher(None, ta.split(), tb.split())
            added, removed = [], []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag in ("replace", "delete"):
                    removed.extend(ta.split()[i1:i2])
                if tag in ("replace", "insert"):
                    added.extend(tb.split()[j1:j2])
            diffs.append({
                "page": i,
                "added": " ".join(added)[:400],
                "removed": " ".join(removed)[:400],
            })
        return {"pages_with_changes": len(diffs), "diffs": diffs}

    def close_document(self, doc_id: str) -> bool:
        with self._lock:
            existed = doc_id in self._infos
            doc = self._docs.pop(doc_id, None)
            if doc:
                doc.close()
            self._infos.pop(doc_id, None)
            self._dirty.pop(doc_id, None)
            self._passwords.pop(doc_id, None)
            self._lru.pop(doc_id, None)
            return existed
