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
                "xref": widget.xref,
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

    def set_form_field(self, doc_id: str, page_num: int, field_name: str, value: str, stash: bool = True):
        """None = no existe. Si ok, (previous, stash_id). PyMuPDF no limpia un
        texto ya escrito con ''; el undo restaura la página stasheada."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            for widget in page.widgets():
                if widget.field_name != field_name:
                    continue
                previous = widget.field_value or ""
                stash_id = self._stash_pages(doc, [page_num]) if stash else ""
                widget.field_value = value
                widget.update()
                self._dirty[doc_id] = True
                return previous, stash_id
            return None

    @staticmethod
    def _used_field_names(doc) -> set:
        names = set()
        for i in range(len(doc)):
            for widget in doc.load_page(i).widgets() or []:
                if widget.field_name:
                    names.add(widget.field_name)
        return names

    @staticmethod
    def _unique_field_name(used: set, base: str) -> str:
        name = base
        n = 2
        while name in used:
            name = f"{base}_{n}"
            n += 1
        return name

    def add_form_field(
        self,
        doc_id: str,
        page_num: int,
        field_type: str,
        field_name: str,
        x: float,
        y: float,
        width: float,
        height: float,
        options: Optional[List[str]] = None,
        radio_value: Optional[str] = None,
        stash: bool = True,
    ):
        """None = falló. Si ok, (field_name, stash_id)."""
        kind = (field_type or "").strip().lower()
        if kind not in ("text", "checkbox", "radio", "combo"):
            return None
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            w = max(4.0, float(width))
            h = max(4.0, float(height))
            if kind in ("checkbox", "radio"):
                w = max(10.0, w)
                h = max(10.0, h)
            rect = fitz.Rect(x, y, x + w, y + h)
            used = self._used_field_names(doc)
            base = (field_name or "").strip() or {
                "text": "texto",
                "checkbox": "casilla",
                "radio": "grupo",
                "combo": "lista",
            }[kind]
            name = base if kind == "radio" else self._unique_field_name(used, base)
            stash_id = self._stash_pages(doc, [page_num]) if stash else ""
            widget = fitz.Widget()
            widget.rect = rect
            widget.field_name = name
            widget.border_color = (0.2, 0.45, 0.85)
            widget.border_width = 0.8
            widget.fill_color = (0.95, 0.97, 1)
            widget.text_color = (0, 0, 0)
            widget.text_font = "helv"
            if kind == "text":
                widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                widget.text_fontsize = min(11, max(8, h * 0.65))
                widget.field_value = ""
            elif kind == "checkbox":
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_value = False
            elif kind == "radio":
                # PyMuPDF 1.28: PDF_WIDGET_TYPE_RADIOBUTTON + update() explota
                # (Parent/Kids xref). Un checkbox con flag Radio sí queda RadioButton.
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_flags = 32768
                widget.field_value = False
                if radio_value:
                    widget.button_caption = radio_value.strip()
            else:
                widget.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX
                choices = [o.strip() for o in (options or []) if o and o.strip()]
                if not choices:
                    choices = ["Opción 1", "Opción 2", "Opción 3"]
                widget.choice_values = choices
                widget.field_value = choices[0]
                widget.text_fontsize = min(11, max(8, h * 0.55))
            try:
                page = doc.load_page(page_num)
                page.add_widget(widget)
            except Exception:
                logger.exception("add_form_field falló (doc %s, página %s, tipo %s)", doc_id, page_num, kind)
                return None
            try:
                doc.set_need_appearances(True)
            except Exception:
                pass
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return name, stash_id

    def transform_form_field(
        self,
        doc_id: str,
        page_num: int,
        xref: int,
        x: Optional[float] = None,
        y: Optional[float] = None,
        width: Optional[float] = None,
        height: Optional[float] = None,
        delete: bool = False,
        stash: bool = True,
    ) -> Optional[str]:
        """None = no existe. Si ok, stash_id ('' si stash=False)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            target = None
            for widget in page.widgets() or []:
                if widget.xref == xref:
                    target = widget
                    break
            if target is None:
                return None
            stash_id = self._stash_pages(doc, [page_num]) if stash else ""
            try:
                if delete:
                    page.delete_widget(target)
                else:
                    rect = target.rect
                    nx = rect.x0 if x is None else float(x)
                    ny = rect.y0 if y is None else float(y)
                    nw = max(4.0, rect.width if width is None else float(width))
                    nh = max(4.0, rect.height if height is None else float(height))
                    target.rect = fitz.Rect(nx, ny, nx + nw, ny + nh)
                    target.update()
            except Exception:
                logger.exception("transform_form_field falló (doc %s, xref %s)", doc_id, xref)
                return None
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id
