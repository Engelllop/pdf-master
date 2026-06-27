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


class ExportMixin:
    def export_excel(self, doc_id: str, output_path: str) -> bool:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return False
            try:
                from openpyxl import Workbook
                wb = Workbook()
                first = True

                def next_sheet(title: str):
                    nonlocal first
                    ws = wb.active if first else wb.create_sheet()
                    ws.title = title[:31]
                    first = False
                    return ws

                for i in range(len(doc)):
                    page = doc.load_page(i)
                    tables = []
                    try:
                        tables = page.find_tables().tables
                    except Exception:
                        tables = []
                    if tables:
                        # Preserve real table structure, one sheet per table
                        for t_idx, tab in enumerate(tables):
                            ws = next_sheet(f"P{i+1}_T{t_idx+1}")
                            for row in tab.extract():
                                ws.append([("" if c is None else c) for c in row])
                    else:
                        # Fall back to raw text lines for pages without tables
                        ws = next_sheet(f"Página {i+1}")
                        for line in page.get_text().splitlines()[:1000]:
                            ws.append([line])
                wb.save(output_path)
                return True
            except DocumentNotFoundError:
                raise
            except Exception:
                logger.exception("export_excel falló (doc %s)", doc_id)
                return False

    def export_pptx(self, doc_id: str, output_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        try:
            from pptx import Presentation
            from pptx.util import Inches
            from io import BytesIO
            prs = Presentation()
            blank_layout = prs.slide_layouts[6]
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=150)
                img_stream = BytesIO(pix.tobytes("png"))
                slide = prs.slides.add_slide(blank_layout)
                slide.shapes.add_picture(img_stream, Inches(0), Inches(0), width=prs.slide_width, height=prs.slide_height)
            prs.save(output_path)
            return True
        except DocumentNotFoundError:
            raise
        except Exception:
            logger.exception("export_pptx falló (doc %s)", doc_id)
            return False

    def export_txt(self, doc_id: str, output_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                for i in range(len(doc)):
                    f.write(doc.load_page(i).get_text())
                    if i < len(doc) - 1:
                        f.write('\n\f\n')  # form feed entre páginas
            return True
        except DocumentNotFoundError:
            raise
        except Exception:
            logger.exception("export_txt falló (doc %s)", doc_id)
            return False

    def export_html(self, doc_id: str, output_path: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        try:
            parts = ['<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>']
            for i in range(len(doc)):
                parts.append(doc.load_page(i).get_text("html"))
            parts.append('</body></html>')
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(parts))
            return True
        except DocumentNotFoundError:
            raise
        except Exception:
            logger.exception("export_html falló (doc %s)", doc_id)
            return False

    def export_word(self, doc_id: str) -> Optional[dict]:
        doc = self._acquire(doc_id)
        if not doc:
            return None
        try:
            from docx import Document
            from docx.shared import Pt
            import io
            import base64
            document = Document()
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    for line in text.split('\n'):
                        if line.strip():
                            p = document.add_paragraph(line.strip())
                            p.style.font.size = Pt(11)
                if page_num < len(doc) - 1:
                    document.add_page_break()
            buffer = io.BytesIO()
            document.save(buffer)
            buffer.seek(0)
            data = buffer.read()
            return {
                "filename": os.path.basename(self._doc_path(doc_id)).replace('.pdf', '.docx'),
                "data_base64": base64.b64encode(data).decode('utf-8'),
            }
        except DocumentNotFoundError:
            raise
        except Exception:
            logger.exception("export_word falló (doc %s)", doc_id)
            return None
