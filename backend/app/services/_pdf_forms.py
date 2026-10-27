import fitz  # PyMuPDF
import base64
import logging
import math
import re
import unicodedata
import uuid
import json
import os
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")

# Casillas y botones de opción: su valor no es un texto sino el NOMBRE de un estado de
# apariencia. Cada widget tiene dos: «Off» y su estado activo propio («Yes», «1»,
# «Choice2», «Sí»…), y el campo vale el estado activo del widget encendido.
_TIPOS_BOTON = (fitz.PDF_WIDGET_TYPE_CHECKBOX, fitz.PDF_WIDGET_TYPE_RADIOBUTTON)

# Bandera Radio (bit 16) + NoToggleToOff (bit 15): lo que pone Acrobat a sus grupos.
# Sin NoToggleToOff, un clic sobre la opción ya elegida la apaga y el grupo queda vacío.
_FF_RADIO = 32768 | 16384

# Caracteres que no pueden ir sueltos en un nombre PDF (delimitadores y el propio #).
_DELIM_NOMBRE = set("#()<>[]{}/%")


def _codificar_nombre(texto: str) -> str:
    """Texto del usuario → nombre PDF en su forma serializada (sin la barra), con los
    bytes fuera de lo imprimible como #XX. «Sí» → «S#C3#AD», que es lo que guarda
    Acrobat: así el valor exportado del formulario sigue siendo «Sí»."""
    salida = []
    for b in unicodedata.normalize("NFC", texto).encode("utf-8"):
        c = chr(b)
        if 0x21 <= b <= 0x7E and c not in _DELIM_NOMBRE:
            salida.append(c)
        else:
            salida.append(f"#{b:02X}")
    return "".join(salida)


def _nombre_crudo(doc, xref: int, clave: str) -> Optional[str]:
    """Valor de una clave de tipo nombre (/AS, /V) en su forma SERIALIZADA, la misma
    que devuelve `Widget.on_state()`. `xref_get_key` lo decodifica (y con bytes no
    ASCII lo devuelve mal), así que con un estado como «S#C3#AD» las dos fuentes no
    coincidían nunca y la opción elegida no se reconocía."""
    tipo, valor = doc.xref_get_key(xref, clave)
    if tipo != "name":
        return None
    valor = valor.lstrip("/")
    if re.fullmatch(r"[A-Za-z0-9_.+\-]*", valor):
        return valor
    m = re.search(r"/" + clave + r"(?=[\s/])\s*/([^\s/<>\[\]()%{}]*)",
                  doc.xref_object(xref, compressed=True))
    return m.group(1) if m else valor


def _estado_activo(widget) -> Optional[str]:
    """Estado «encendido» del widget, o None si no es casilla/opción o no lo declara."""
    if widget.field_type not in _TIPOS_BOTON:
        return None
    try:
        estado = widget.on_state()
    except Exception:
        estado = None
    if isinstance(estado, str) and estado and estado != "Off":
        return estado
    # Sin /AP no hay estados declarados: «Yes» es el valor por defecto de la norma.
    return "Yes"


def _campo_de(doc, widget) -> int:
    """xref del objeto CAMPO al que pertenece el widget: él mismo si lleva /T (campo
    y widget fusionados, lo habitual), si no su /Parent (hijo de un grupo de Acrobat).
    El /V vive en el campo; el /AS, en cada widget."""
    if doc.xref_get_key(widget.xref, "T")[0] != "null":
        return widget.xref
    tipo, valor = doc.xref_get_key(widget.xref, "Parent")
    if tipo == "xref":
        try:
            return int(valor.split()[0])
        except (ValueError, IndexError):
            pass
    return widget.xref


def _estado_actual(doc, widget) -> str:
    """Estado en que se VE este widget: su /AS. Antes se leía `field_value`, que es el
    valor del CAMPO (o lo que PyMuPDF deduce de él): en un grupo todas las opciones
    traían el mismo valor y el visor no sabía cuál estaba elegida."""
    estado = _nombre_crudo(doc, widget.xref, "AS")
    if estado is not None:
        return estado or "Off"
    # Sin /AS (algunos generadores): se deduce del /V del campo.
    valor = _nombre_crudo(doc, _campo_de(doc, widget), "V")
    activo = _estado_activo(widget)
    return activo if valor and valor == activo else "Off"


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
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return []
            page = doc.load_page(page_num)
            widgets = page.widgets()
            results = []
            for widget in widgets:
                # El visor trabaja en la página girada; widget.rect viene sin girar.
                rect = self._a_vista(page, widget.rect)
                es_boton = widget.field_type in _TIPOS_BOTON
                caption = None
                if widget.field_type == fitz.PDF_WIDGET_TYPE_BUTTON:
                    caption = widget.button_caption or None
                results.append({
                    "xref": widget.xref,
                    "field_name": widget.field_name,
                    "field_type": widget.field_type_string,
                    # Banderas (solo lectura, multilínea, contraseña…) y largo máximo:
                    # el visor las respeta en vez de dejar escribir en cualquier campo.
                    "field_flags": widget.field_flags or 0,
                    "text_maxlen": widget.text_maxlen or 0,
                    "rect": {
                        "x": rect.x0,
                        "y": rect.y0,
                        "width": rect.width,
                        "height": rect.height,
                    },
                    # En casillas y opciones, el estado de ESTE widget y su estado
                    # activo: el visor tilda si coinciden y, al hacer clic, manda ese
                    # estado activo (no «Yes» ni la primera opción, que no existen en
                    # un PDF de Acrobat con «Choice1», «Choice2»… o una casilla en «1»).
                    "value": _estado_actual(doc, widget) if es_boton else (widget.field_value or ""),
                    "on_state": _estado_activo(widget) if es_boton else None,
                    "caption": caption,
                    "options": widget.choice_values or [],
                })
            return results

    def set_form_field(self, doc_id: str, page_num: int, field_name: str, value: str,
                       stash: bool = True, xref: Optional[int] = None):
        """None = no existe. Si ok, (previous, stash_id, stash_page). PyMuPDF no limpia
        un texto ya escrito con ''; el undo restaura lo stasheado.

        `xref` = el widget concreto que tocó el usuario. Hace falta en los grupos de
        opciones: todas comparten nombre y, buscando por nombre, se escribía siempre
        sobre la primera — elegir cualquier opción encendía la primera.

        `stash_page` es la página a restaurar, o None si se stasheó el documento entero
        (cuando el campo tiene widgets en varias páginas)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            objetivo = None
            for widget in page.widgets():
                if xref is not None:
                    if widget.xref == xref and (not field_name or widget.field_name == field_name):
                        objetivo = widget
                        break
                elif widget.field_name == field_name:
                    objetivo = widget
                    break
            if objetivo is None:
                return None
            if objetivo.field_type in _TIPOS_BOTON:
                return self._marcar_boton(doc_id, doc, page_num, page, objetivo,
                                          value, stash, por_xref=xref is not None)
            previous = objetivo.field_value or ""

            # Un mismo campo puede tener widget en varias páginas (un «Nombre» repetido
            # en el pie de cada hoja): el VALOR del campo es compartido, pero la
            # apariencia se dibuja por widget. Al actualizar solo el de esta página, las
            # otras hojas seguían mostrando el valor viejo — y la apariencia es lo que
            # sale impreso. (Las casillas y opciones van por `_marcar_boton`: ahí cada
            # widget es una opción distinta y copiarles el valor los encendería todos.)
            otras = []
            for i in range(len(doc)):
                if i == page_num:
                    continue
                if any(w.field_name == field_name for w in doc.load_page(i).widgets()):
                    otras.append(i)

            stash_id = ""
            stash_page = page_num
            if stash:
                # Un campo hijo (con /Parent, el «form.nombre» de Acrobat) tampoco se
                # deshace bien por página: `replace_page` reinserta la hoja con
                # `insert_pdf`, que trae una copia del padre y, como el viejo sigue en
                # el /AcroForm, la renombra a «form [N]».
                if otras or _campo_de(doc, objetivo) != objetivo.xref:
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

    def _marcar_boton(self, doc_id, doc, page_num, page, objetivo, value: str,
                      stash: bool, por_xref: bool):
        """Enciende/apaga una casilla o elige una opción de un grupo.

        No pasa por `widget.field_value` + `update()`: PyMuPDF regenera la apariencia
        con el estado «Yes» fijo (una casilla en «1» o un «Choice2» de Acrobat dejaban
        de existir), escribe el /V del padre como cadena en vez de nombre y, en un hijo
        de grupo, encendía el widget equivocado. Se escriben a mano /AS en cada widget y
        /V en cada campo, que es todo lo que el estado es en el PDF."""
        nombre = objetivo.field_name
        es_radio = objetivo.field_type == fitz.PDF_WIDGET_TYPE_RADIOBUTTON
        campo_obj = _campo_de(doc, objetivo)

        # Grupo afectado. Opciones: todas las del mismo nombre, sean hijas de un padre
        # (Acrobat) o campos sueltos homónimos (los que creaba PDF Master antes): elegir
        # una apaga las demás. Casillas: solo el mismo campo — dos casillas homónimas
        # pero independientes no se apagan entre sí.
        paginas = {page_num: page}
        grupo = []
        for i in range(len(doc)):
            pg = paginas.get(i) or doc.load_page(i)
            for w in pg.widgets() or []:
                if w.field_name != nombre or w.field_type not in _TIPOS_BOTON:
                    continue
                if not es_radio and _campo_de(doc, w) != campo_obj:
                    continue
                paginas[i] = pg  # cada Widget guarda solo una referencia débil a su página
                grupo.append((i, w))

        valor = (value or "").strip()
        encendido = None
        if valor and valor != "Off":
            if por_xref:
                encendido = objetivo
            else:
                # Sin xref (rehacer, clientes viejos): la opción cuyo estado activo es el
                # valor, prefiriendo la de esta página. Si ninguna coincide —el visor
                # viejo mandaba «Yes» a ciegas— vale el widget de esta página.
                candidatos = [w for _, w in grupo if _estado_activo(w) == valor]
                encendido = next((w for w in candidatos if w.xref == objetivo.xref), None) \
                    or (candidatos[0] if candidatos else objetivo)
        activo = _estado_activo(encendido) if encendido is not None else None
        campo_encendido = _campo_de(doc, encendido) if encendido is not None else None

        def enciende(w) -> bool:
            if encendido is None:
                return False
            if w.xref == encendido.xref:
                return True
            # Widgets del MISMO campo con el mismo estado activo son espejos (la misma
            # casilla repetida en cada hoja): van juntos.
            return _campo_de(doc, w) == campo_encendido and _estado_activo(w) == activo

        previous = _estado_actual(doc, objetivo)
        cambios = []
        campos: Dict[int, Optional[str]] = {}
        for i, w in grupo:
            nuevo = activo if enciende(w) else "Off"
            if _estado_actual(doc, w) != nuevo:
                cambios.append((i, w, nuevo))
            c = _campo_de(doc, w)
            campos[c] = campos.get(c) or (activo if enciende(w) else None)

        stash_id = ""
        stash_page = page_num
        if stash:
            hojas = {i for i, _, _ in cambios} | {page_num}
            con_padre = any(_campo_de(doc, w) != w.xref for _, w in grupo)
            # Varias hojas, o un grupo con padre (ver `set_form_field`): la página sola
            # no alcanza para deshacer.
            if len(hojas) > 1 or con_padre:
                stash_id = self._stash_document(doc)
                stash_page = None
            else:
                stash_id = self._stash_pages(doc, [page_num])

        for _, w, nuevo in cambios:
            doc.xref_set_key(w.xref, "AS", "/" + nuevo)
        for c, estado in campos.items():
            doc.xref_set_key(c, "V", "/" + (estado or "Off"))
        for _, w in grupo:
            # Un /V en el hijo tapa el del padre (lo deja ahí el `update()` de PyMuPDF).
            if _campo_de(doc, w) != w.xref and doc.xref_get_key(w.xref, "V")[0] != "null":
                doc.xref_set_key(w.xref, "V", "null")
        self._dirty[doc_id] = True
        return previous, stash_id, stash_page

    @staticmethod
    def _estado_para_opcion(doc, nombre: str, texto: Optional[str]) -> str:
        """Nombre del estado activo de una opción nueva del grupo `nombre`: el valor
        que escribió el usuario, distinto del de las opciones que ya existen.

        Antes todas las opciones nacían con el estado «Yes»: el grupo no podía
        distinguir cuál estaba elegida y el valor exportado era siempre «Yes».

        Las opciones quedan como campos sueltos homónimos y no como hijos de un padre
        (lo que hace Acrobat): el deshacer por página (`replace_page` → `insert_pdf`)
        trae una copia del padre y, como el viejo sigue en el /AcroForm, MuPDF renombra
        el grupo a «grupo [N]». Mientras ese deshacer no sepa de padres, armar el grupo
        de verdad rompería el Ctrl+Z. El motor y el visor tratan como un solo grupo
        todas las opciones con el mismo nombre."""
        usados = set()
        for i in range(len(doc)):
            for w in doc.load_page(i).widgets() or []:
                if w.field_name == nombre and w.field_type in _TIPOS_BOTON:
                    usados.add(_estado_activo(w))
        base = _codificar_nombre((texto or "").strip())[:60]
        if not base or base.lower() == "off":
            n = len(usados) + 1
            base = f"Opcion{n}"
            while base in usados:
                n += 1
                base = f"Opcion{n}"
        estado = base
        n = 2
        while estado in usados:
            estado = f"{base}_{n}"
            n += 1
        return estado

    @staticmethod
    def _renombrar_estado_activo(doc, xref: int, estado: str) -> None:
        """Cambia el estado activo «Yes» que dibuja PyMuPDF por `estado` en /AP /N y
        /AP /D. Se reescribe el diccionario entero: `xref_set_key` con una clave que
        lleva «#» la escapa otra vez («S#23C3#23AD») y el estado dejaba de existir."""
        if estado == "Yes":
            return
        for sub in ("AP/N", "AP/D"):
            tipo, valor = doc.xref_get_key(xref, sub)
            if tipo != "dict":
                continue
            nuevo = re.sub(r"/Yes(?=[\s/<>\[\]()]|$)", "/" + estado, valor)
            if nuevo != valor:
                doc.xref_set_key(xref, sub, nuevo)

    @staticmethod
    def _mover_sin_regenerar(doc, widget, nuevo: "fitz.Rect") -> bool:
        """Mueve una casilla u opción reescribiendo solo su /Rect. Con `update()`,
        PyMuPDF le regeneraba la apariencia con el estado «Yes» fijo (perdía su estado
        activo propio, «1» o «Choice2»), la dejaba encendida y le cambiaba el dibujo
        que traía de Acrobat. La apariencia se ajusta sola al /Rect nuevo (su BBox se
        escala al rectángulo), así que no hace falta regenerarla.

        `nuevo` viene en coordenadas de PyMuPDF sin girar; el paso a las del PDF se
        saca del propio widget (su /Rect actual contra `widget.rect`) porque
        `page.transformation_matrix` sale mal en páginas giradas con cropbox propio.
        False = no se pudo (se cae al `update()`)."""
        tipo, valor = doc.xref_get_key(widget.xref, "Rect")
        if tipo != "array":
            return False
        try:
            x0, y0, x1, y1 = (float(v) for v in valor.strip("[] ").split())
        except ValueError:
            return False
        actual = widget.rect
        dx = min(x0, x1) - actual.x0  # x_pdf = x + dx
        top = max(y0, y1) + actual.y0  # y_pdf = top - y
        doc.xref_set_key(widget.xref, "Rect",
                         f"[{nuevo.x0 + dx:.4f} {top - nuevo.y1:.4f} {nuevo.x1 + dx:.4f} {top - nuevo.y0:.4f}]")
        return True

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
            used = self._used_field_names(doc)
            base = (field_name or "").strip() or {
                "text": "texto",
                "checkbox": "casilla",
                "radio": "grupo",
                "combo": "lista",
            }[kind]
            name = base if kind == "radio" else self._unique_field_name(used, base)
            stash_id = self._stash_pages(doc, [page_num]) if stash else ""
            page = doc.load_page(page_num)
            widget = fitz.Widget()
            widget.rect = self._desde_vista(page, fitz.Rect(x, y, x + w, y + h))
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
                # El «valor de esta opción» NO va a /MK /CA (eso es el carácter que se
                # dibuja al tildar): va al nombre del estado activo, más abajo.
                widget.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
                widget.field_flags = _FF_RADIO
                widget.field_value = False
                estado_opcion = self._estado_para_opcion(doc, name, radio_value)
            else:
                widget.field_type = fitz.PDF_WIDGET_TYPE_COMBOBOX
                choices = [o.strip() for o in (options or []) if o and o.strip()]
                if not choices:
                    choices = ["Opción 1", "Opción 2", "Opción 3"]
                widget.choice_values = choices
                widget.field_value = choices[0]
                widget.text_fontsize = min(11, max(8, h * 0.55))
            try:
                annot = page.add_widget(widget)
                if page.rotation:
                    # /MK /R gira la apariencia con la página: sin él, en una página con
                    # /Rotate el texto del campo se veía de lado o cabeza abajo.
                    doc.xref_set_key(annot.xref, "MK/R", str(page.rotation))
                    widget.update()
                if kind == "radio":
                    # Después del último `update()`, que regenera la apariencia con «Yes».
                    self._renombrar_estado_activo(doc, annot.xref, estado_opcion)
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
                    # Todo en el espacio del visor; el /MK /R del widget no se toca.
                    rect = self._a_vista(page, target.rect)
                    nx = rect.x0 if x is None else float(x)
                    ny = rect.y0 if y is None else float(y)
                    nw = max(4.0, rect.width if width is None else float(width))
                    nh = max(4.0, rect.height if height is None else float(height))
                    nuevo = self._desde_vista(page, fitz.Rect(nx, ny, nx + nw, ny + nh))
                    if not (target.field_type in _TIPOS_BOTON
                            and self._mover_sin_regenerar(doc, target, nuevo)):
                        target.rect = nuevo
                        target.update()
            except Exception:
                logger.exception("transform_form_field falló (doc %s, xref %s)", doc_id, xref)
                return None
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id
