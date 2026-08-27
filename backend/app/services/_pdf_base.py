import fitz  # PyMuPDF
import logging
import uuid
import threading
from typing import Dict, Optional
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageSize
from app.core.config import settings

logger = logging.getLogger("pdfmaster")


# Los tipos base de PDF (helv y compañía) solo cubren latin-1: al estampar texto con
# `insert_text`, cualquier carácter de fuera —una raya «—», un «→», un «✔», un «≥»—
# DESAPARECÍA sin aviso. Pasaba en el resumen de marcas (el «—» de su propia cabecera
# incluido), en la marca de agua, en el encabezado/pie y en la numeración. Se
# transliteran los habituales y el resto cae en «?»: perder el carácter exacto es
# aceptable; perder el dato en silencio, no.
_TRANSLITERACIONES = {
    '—': '-', '–': '-', '―': '-',        # rayas
    '‘': "'", '’': "'", '“': '"', '”': '"',  # comillas tipográficas
    '…': '...', '•': '-',
    '→': '->', '←': '<-', '↳': '>',      # flechas
    '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
    '≥': '>=', '≤': '<=', '≠': '!=', '±': '+/-',
    ' ': ' ', ' ': ' ', '​': '',
}


def texto_estampable(texto: Optional[str]) -> str:
    """Texto que `insert_text` puede escribir con una fuente base sin perder nada."""
    if not texto:
        return ''
    salida = []
    for ch in texto:
        reemplazo = _TRANSLITERACIONES.get(ch)
        if reemplazo is not None:
            salida.append(reemplazo)
            continue
        try:
            ch.encode('latin-1')
            salida.append(ch)
        except UnicodeEncodeError:
            salida.append('?')
    return ''.join(salida)


class PasswordRequiredError(Exception):
    """fitz no define PasswordError; esta señala al router que devuelva 401."""


class DocumentNotFoundError(Exception):
    """doc_id desconocido o archivo ya no disponible; el handler global devuelve 404."""


class PdfServiceBase:
    def __init__(self):
        self._docs: Dict[str, fitz.Document] = {}
        self._infos: Dict[str, PdfInfo] = {}
        self._dirty: Dict[str, bool] = {}  # Track unsaved changes
        # Marcas de la app pendientes de incrustar. NO se aplican al documento vivo:
        # se incrustan sobre una copia en cada guardado. Aplicarlas al vivo hacía que
        # el segundo guardado las añadiera otra vez encima (resaltados apilados).
        self._pending_annotations: Dict[str, list] = {}
        self._passwords: Dict[str, Optional[str]] = {}  # Kept so evicted protected docs can be reopened
        self._render_cache: OrderedDict = OrderedDict()  # (doc_id, page_num, zoom) -> PageRender
        self._render_cache_max = 150
        self._snap_cache: OrderedDict = OrderedDict()  # (doc_id, page_num) -> List[dict]
        self._snap_cache_max = 60
        # LRU eviction: with 60+ plans open the backend would otherwise keep every
        # fitz.Document (and its cached page objects) alive. We close the least-recently
        # used *non-dirty* documents and transparently reopen them from disk on access.
        # Dirty docs are never evicted (reopening would lose unsaved edits).
        self._lru: "OrderedDict[str, None]" = OrderedDict()  # doc_id -> None, oldest first
        self._max_live_docs = 12
        # PyMuPDF is not thread-safe and handlers now run in FastAPI's threadpool,
        # so serialize all access to documents and caches.
        self._lock = threading.RLock()
        # Páginas borradas, para Ctrl+Z. bytes de un PDF chico; tope 20.
        self._page_stash: "OrderedDict[str, bytes]" = OrderedDict()
        self._page_stash_max = 20

    def _stash_pages(self, doc: fitz.Document, pages: list) -> str:
        """Copia las páginas (índices) a un PDF en memoria. Devuelve el id del stash."""
        tmp = fitz.open()
        for p in pages:
            tmp.insert_pdf(doc, from_page=p, to_page=p)
        stash_id = uuid.uuid4().hex
        self._page_stash[stash_id] = tmp.tobytes()
        tmp.close()
        while len(self._page_stash) > self._page_stash_max:
            self._page_stash.popitem(last=False)
        return stash_id

    def _stash_document(self, doc: fitz.Document) -> str:
        """Copia el PDF entero al stash (marca de agua, redacción masiva, etc.)."""
        stash_id = uuid.uuid4().hex
        self._page_stash[stash_id] = doc.tobytes()
        while len(self._page_stash) > self._page_stash_max:
            self._page_stash.popitem(last=False)
        return stash_id

    @staticmethod
    def _open_stream(file_path: str) -> fitz.Document:
        """Abre el PDF leyendo los bytes a memoria, sin que PyMuPDF mantenga abierto
        el archivo en disco. Así el motor nunca bloquea el archivo del usuario: puede
        borrarlo, moverlo o sobrescribirlo aunque esté abierto en la app."""
        with open(file_path, "rb") as fh:
            data = fh.read()
        return fitz.open(stream=data, filetype="pdf")

    def _doc_path(self, doc_id: str) -> str:
        """file_path original del doc (doc.name queda vacío al abrir por stream)."""
        info = self._infos.get(doc_id)
        return info.file_path if info else ""

    def _acquire(self, doc_id: str) -> fitz.Document:
        """Return the live fitz.Document for doc_id, reopening it from disk if it was
        evicted. Updates LRU recency and evicts other inactive non-dirty docs.
        Raises DocumentNotFoundError for unknown docs or if the file can't be reopened."""
        with self._lock:
            if doc_id not in self._infos:
                raise DocumentNotFoundError(f"Unknown document {doc_id}")
            doc = self._docs.get(doc_id)
            if doc is None:
                info = self._infos[doc_id]
                try:
                    doc = self._open_stream(info.file_path)
                except Exception:
                    logger.exception("No se pudo reabrir %s desde %s", doc_id, info.file_path)
                    raise DocumentNotFoundError(f"File no longer available: {info.file_path}")
                pw = self._passwords.get(doc_id)
                if doc.needs_pass and pw:
                    doc.authenticate(pw)
                self._docs[doc_id] = doc
                self._dirty.setdefault(doc_id, False)
            self._lru.pop(doc_id, None)
            self._lru[doc_id] = None  # most-recently used
            self._evict_inactive()
            return self._docs.get(doc_id)

    def _evict_inactive(self):
        """Close least-recently-used non-dirty documents when over the live cap.
        Must be called holding self._lock."""
        if len(self._docs) <= self._max_live_docs:
            return
        for did in list(self._lru.keys()):
            if len(self._docs) <= self._max_live_docs:
                break
            if did not in self._docs:
                self._lru.pop(did, None)
                continue
            if self._dirty.get(did):
                continue  # keep unsaved work in memory
            doc = self._docs.pop(did, None)
            if doc is not None:
                try:
                    doc.close()
                except Exception:
                    pass
            self._lru.pop(did, None)

    @staticmethod
    def _capped_scale(page, desired_scale: float, max_px: int) -> float:
        """Clamp the render scale so very large pages (e.g. architectural drawings)
        don't produce multi-thousand-pixel bitmaps that block the render thread."""
        md = max(page.rect.width, page.rect.height)
        if md <= 0:
            return desired_scale
        return max(0.05, min(desired_scale, max_px / md))

    def _invalidate_render_cache(self, doc_id: str):
        keys_to_remove = [k for k in self._render_cache.keys() if k[0] == doc_id]
        for k in keys_to_remove:
            del self._render_cache[k]
        keys_to_remove = [k for k in self._snap_cache.keys() if k[0] == doc_id]
        for k in keys_to_remove:
            del self._snap_cache[k]
