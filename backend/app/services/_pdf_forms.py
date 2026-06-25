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


class FormsMixin:
    def get_form_fields(self, doc_id: str, page_num: int) -> List[dict]:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return []
        page = doc.load_page(page_num)
        widgets = page.widgets()
        results = []
        for widget in widgets:
            results.append({
                "field_name": widget.field_name,
                "field_type": widget.field_type_string,
                "field_flags": widget.field_flags,
                "rect": {
                    "x": widget.rect.x0,
                    "y": widget.rect.y0,
                    "width": widget.rect.width,
                    "height": widget.rect.height,
                },
                "value": widget.field_value or "",
                "options": widget.choice_values or [],
            })
        return results

    def set_form_field(self, doc_id: str, page_num: int, field_name: str, value: str) -> bool:
        doc = self._acquire(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        widgets = page.widgets()
        for widget in widgets:
            if widget.field_name == field_name:
                widget.field_value = value
                widget.update()
                self._dirty[doc_id] = True
                return True
        return False
