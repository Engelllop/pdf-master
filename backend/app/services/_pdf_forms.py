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


class FormsMixin:
    @staticmethod
    def _es_de_texto(field_type) -> bool:
        """Tipos donde «vacío» significa cadena vacía. En casillas y radio, en cambio,
        el valor es una opción del grupo ('Off', 'Yes'…) y no hay nada que vaciar."""
        return field_type in (
            fitz.PDF_WIDGET_TYPE_TEXT,
            fitz.PDF_WIDGET_TYPE_COMBOBOX,
            fitz.PDF_WIDGET_TYPE_LISTBOX,
        )

    @staticmethod
    def _vaciar_widget(doc, widget) -> None:
        """PyMuPDF IGNORA `field_value = ''`: el `update()` no borra nada y el campo se
        queda con el texto anterior. O sea que borrar el contenido de un campo no lo
        borraba —ni el valor ni lo que se ve— y al guardar el PDF salía con el dato
        viejo. Se vacía el /V a mano y se tira la apariencia para que se regenere."""
        doc.xref_set_key(widget.xref, "V", "()")
        doc.xref_set_key(widget.xref, "AP", "null")
        try:
            # `set_need_appearances` no existe en PyMuPDF 1.28 (el nombre es sin `set_`);
            # la llamada vieja vivía dentro de un except que se lo tragaba.
            doc.need_appearances(True)
        except Exception:
            logger.exception("No se pudo marcar need_appearances")

    @classmethod
    def _escribir_widget(cls, doc, widget, value: str) -> None:
        if value == "" and cls._es_de_texto(widget.field_type):
            cls._vaciar_widget(doc, widget)
            return
        widget.field_value = value
        widget.update()

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
        """None = no existe. Si ok, (previous, stash_id, stash_page). PyMuPDF no limpia
        un texto ya escrito con ''; el undo restaura lo stasheado.

        `stash_page` es la página a restaurar, o None si se stasheó el documento entero
        (cuando el campo tiene widgets en varias páginas)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            objetivo = None
            for widget in page.widgets():
                if widget.field_name == field_name:
                    objetivo = widget
                    break
            if objetivo is None:
                return None
            previous = objetivo.field_value or ""

            # Un mismo campo puede tener widget en varias páginas (un «Nombre» repetido
            # en el pie de cada hoja): el VALOR del campo es compartido, pero la
            # apariencia se dibuja por widget. Al actualizar solo el de esta página, las
            # otras hojas seguían mostrando el valor viejo — y la apariencia es lo que
            # sale impreso. Los radio y las casillas quedan fuera: ahí cada widget es una
            # opción distinta del grupo y copiarles el valor los encendería todos.
            propagar = objetivo.field_type not in (
                fitz.PDF_WIDGET_TYPE_RADIOBUTTON, fitz.PDF_WIDGET_TYPE_CHECKBOX)
            otras = []
            if propagar:
                for i in range(len(doc)):
                    if i == page_num:
                        continue
                    if any(w.field_name == field_name for w in doc.load_page(i).widgets()):
                        otras.append(i)

            stash_id = ""
            stash_page = page_num
            if stash:
                if otras:
                    # Varias páginas afectadas: el undo por página no alcanza.
                    stash_id = self._stash_document(doc)
                    stash_page = None
                else:
                    stash_id = self._stash_pages(doc, [page_num])

            self._escribir_widget(doc, objetivo, value)
            for i in otras:
                for w in doc.load_page(i).widgets():
                    if w.field_name != field_name:
                        continue
                    self._escribir_widget(doc, w, value)
            self._dirty[doc_id] = True
            # Sin invalidar el cache de render, aunque `add_form_field` y
            # `transform_form_field` sí lo hagan: esos mueven o crean el widget (y con él
            # el contenido de la página), mientras que rellenar un campo solo cambia su
            # apariencia — y `get_page_image_bytes` renderiza con `annots=False`, así que
            # la apariencia de un widget no entra en ese bitmap. Vaciar el cache en cada
            # campo confirmado forzaría re-renderizar todas las páginas para nada.
            return previous, stash_id, stash_page

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
                # Sin `set_`: `set_need_appearances` no existe en PyMuPDF 1.28, así que
                # esta línea nunca hacía nada (el except se lo tragaba).
                doc.need_appearances(True)
            except Exception:
                logger.exception("No se pudo marcar need_appearances")
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
