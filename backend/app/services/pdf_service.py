"""PdfService: fachada que compone los mixins por dominio sobre PdfServiceBase.
El estado (LRU, caches, _lock) y los helpers viven en _pdf_base; cada mixin agrupa
una familia de operaciones. PyMuPDF no es thread-safe: todo acceso a fitz sigue
serializado por self._lock (heredado de la base). Instancia singleton abajo."""
from app.services._pdf_base import PdfServiceBase, PasswordRequiredError, DocumentNotFoundError, logger
from app.services._pdf_render import RenderMixin
from app.services._pdf_read import ReadMixin
from app.services._pdf_pages import PagesMixin
from app.services._pdf_edit import EditMixin
from app.services._pdf_annotations import AnnotationsMixin
from app.services._pdf_export import ExportMixin
from app.services._pdf_forms import FormsMixin
from app.services._pdf_documents import DocumentsMixin


class PdfService(RenderMixin, ReadMixin, PagesMixin, EditMixin, AnnotationsMixin, ExportMixin, FormsMixin, DocumentsMixin, PdfServiceBase):
    pass


pdf_service = PdfService()
