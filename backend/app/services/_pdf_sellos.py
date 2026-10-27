"""Sellos de página: encabezado y pie, numeración y marca de agua.

Antes cada uno escribía texto suelto en el contenido de la página: no había forma de
encontrarlo después, así que no se podía quitar ni corregir, aplicarlo dos veces lo
apilaba, y el encabezado y los números caían en el mismo sitio. Ahora cada tipo vive
en su propia CAPA del PDF (un OCG): aplicar reemplaza lo que había en esa capa, se
puede quitar, y la capa guarda su configuración (`/PMSpec`) para que el diálogo se
abra con lo que ya está aplicado. Otros visores muestran el texto igual; los que
listan capas (Acrobat) además dejan ocultarlo.
"""
import json
import logging
import os
import re
from datetime import date
from typing import Dict, List, Optional

import fitz  # PyMuPDF

from app.services._pdf_base import texto_estampable

logger = logging.getLogger("pdfmaster")

CAPAS = {
    "encabezado": "PDF Master - Encabezado y pie",
    "numeracion": "PDF Master - Numeracion",
    "marca": "PDF Master - Marca de agua",
}

ZONAS = ("tl", "tc", "tr", "bl", "bc", "br")

# Tope de repeticiones del mosaico por página (ver EditMixin.MAX_WATERMARK_TILES).
MAX_MOSAICO = 400


def _rgb(color: Optional[str], defecto=(0.0, 0.0, 0.0)):
    c = (color or "").lstrip("#")
    if len(c) != 6:
        return defecto
    try:
        return tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError:
        return defecto


def _fuente(familia: Optional[str], negrita: bool) -> str:
    f = (familia or "").lower()
    if "times" in f or "serif" in f and "sans" not in f:
        nombre = "tibo" if negrita else "tiro"
    elif "courier" in f or "mono" in f:
        nombre = "cobo" if negrita else "cour"
    else:
        nombre = "hebo" if negrita else "helv"
    return nombre


_VAR = re.compile(r"\{(n|total|fecha|archivo)(?::(\d{1,2}))?\}")


def expandir(plantilla: str, n: int, total: int, archivo: str, hoy: Optional[date] = None) -> str:
    """Las variables del sello: {n} número de página, {n:6} con ceros (Bates),
    {total}, {fecha} (dd/mm/aaaa) y {archivo} (nombre sin extensión)."""
    hoy = hoy or date.today()

    def sustituir(m: re.Match) -> str:
        var, ancho = m.group(1), m.group(2)
        if var == "n":
            return str(n).zfill(int(ancho)) if ancho else str(n)
        if var == "total":
            return str(total)
        if var == "fecha":
            return hoy.strftime("%d/%m/%Y")
        return archivo

    return _VAR.sub(sustituir, plantilla or "")


class SellosMixin:
    # ---- capas -------------------------------------------------------------

    @staticmethod
    def _ocg_de(doc, capa: str, crear: bool) -> int:
        nombre = CAPAS[capa]
        for xref, info in (doc.get_ocgs() or {}).items():
            if info.get("name") == nombre:
                return xref
        return doc.add_ocg(nombre, on=True) if crear else 0

    @staticmethod
    def _propiedades_de_capa(doc, page, ocg_xref: int) -> List[str]:
        """Los nombres de recurso con que la página se refiere a la capa (`/MC0`…)."""
        tipo, valor = doc.xref_get_key(page.xref, "Resources/Properties")
        if tipo == "xref":
            valor = doc.xref_object(int(valor.split()[0]))
        if not valor or tipo == "null":
            return []
        return [nombre for nombre, x in re.findall(r"/([^\s/<>\[\]()]+)\s+(\d+)\s+0\s+R", valor)
                if int(x) == ocg_xref]

    def _vaciar_capa(self, doc, page, ocg_xref: int, solo_mirar: bool = False) -> bool:
        """Quita de la página todo lo marcado con la capa. True si había algo.

        Ojo: al guardar, PyMuPDF fusiona flujos idénticos, así que la misma marca de
        agua en todas las hojas es UN flujo compartido. Vaciarlo en una página lo vacía
        en todas — que es lo correcto: es el mismo bloque de la misma capa."""
        nombres = self._propiedades_de_capa(doc, page, ocg_xref)
        if not nombres:
            return False
        patron = re.compile(rb"/OC\s*/(?:" + b"|".join(re.escape(n.encode()) for n in nombres)
                            + rb")\s*BDC.*?EMC", re.S)
        hubo = False
        for c in page.get_contents():
            datos = doc.xref_stream(c) or b""
            if solo_mirar:
                if patron.search(datos):
                    return True
                continue
            nuevo, cuantos = patron.subn(b"", datos)
            if cuantos:
                doc.update_stream(c, nuevo)
                hubo = True
        return hubo

    @staticmethod
    def _guardar_spec(doc, ocg_xref: int, spec: Optional[dict]):
        valor = fitz.get_pdf_str(json.dumps(spec, ensure_ascii=True)) if spec else "null"
        doc.xref_set_key(ocg_xref, "PMSpec", valor)

    @staticmethod
    def _leer_spec(doc, ocg_xref: int) -> Optional[dict]:
        tipo, valor = doc.xref_get_key(ocg_xref, "PMSpec")
        if tipo != "string":
            return None
        try:
            return json.loads(valor)
        except (ValueError, TypeError):
            return None

    # ---- dibujo ------------------------------------------------------------
    # Con `insert_text` vía `_texto_en_vista` (EditMixin): las coordenadas van en las
    # de PANTALLA y en una página con /Rotate el texto se gira con ella. Se probó
    # `TextWriter` (un flujo por página) y en hojas giradas 90/270° caía corrido.

    def _dibujar_textos(self, doc, page, i: int, spec: dict, ocg: int):
        """Encabezado y pie o numeración: hasta seis zonas con variables."""
        total = len(doc) + int(spec.get("start", 1)) - 1
        archivo = os.path.splitext(os.path.basename(doc.name or ""))[0]
        n = int(spec.get("start", 1)) + i
        fs = float(spec.get("fontsize", 10) or 10)
        fuente = _fuente(spec.get("font"), bool(spec.get("bold")))
        mx = float(spec.get("margin_x", 36))
        mt = float(spec.get("margin_top", 28))
        mb = float(spec.get("margin_bottom", 28))
        color = _rgb(spec.get("color"))
        opacidad = float(spec.get("opacity", 1) or 1)
        vista = page.rect  # en coordenadas de pantalla (ya girada)
        for zona in ZONAS:
            texto = texto_estampable(expandir((spec.get("zones") or {}).get(zona, ""), n, total, archivo))
            if not texto.strip():
                continue
            ancho = fitz.get_text_length(texto, fontname=fuente, fontsize=fs)
            if zona[1] == "l":
                x = mx
            elif zona[1] == "c":
                x = vista.width / 2 - ancho / 2
            else:
                x = vista.width - mx - ancho
            # Sin salirse por la izquierda: un texto más ancho que la hoja empieza en el
            # margen en vez de en x negativa.
            x = max(min(mx, 18.0), x)
            # La línea base: arriba, el margen más el cuerpo; abajo, el margen.
            y = mt + fs * 0.8 if zona[0] == "t" else vista.height - mb
            self._texto_en_vista(page, fitz.Point(x, y), texto, fontname=fuente, fontsize=fs,
                                 color=color, fill_opacity=opacidad, overlay=True, oc=ocg)

    def _dibujar_marca(self, page, spec: dict, ocg: int):
        texto = texto_estampable(spec.get("text") or "")
        if not texto.strip():
            return
        vista = page.rect
        fuente = _fuente(spec.get("font"), bool(spec.get("bold", True)))
        angulo = float(spec.get("angle", 45) or 0)
        mosaico = spec.get("mode", "center") == "tile"
        fs = float(spec.get("fontsize", 0) or 0)
        if fs <= 0:
            # Tamaño relativo a la hoja: centrada ocupa ~62 % de la diagonal (o del
            # lado, si va derecha); en mosaico, una repetición mide ~1/3 del lado
            # corto. Así una carta y un plano de 36×24 in quedan proporcionados.
            unidad = fitz.get_text_length(texto, fontname=fuente, fontsize=1) or 1
            if mosaico:
                fs = min(vista.width, vista.height) / 3 / unidad
            else:
                recto = abs(angulo) % 180
                largo = vista.width if recto == 0 else vista.height if recto == 90 else \
                    (vista.width ** 2 + vista.height ** 2) ** 0.5
                fs = 0.62 * largo / unidad
            fs = max(8.0, min(fs, 400.0))
        ancho = fitz.get_text_length(texto, fontname=fuente, fontsize=fs)
        color = _rgb(spec.get("color"), (0.5, 0.5, 0.5))
        opciones = dict(fontname=fuente, fontsize=fs, color=color,
                        fill_opacity=float(spec.get("opacity", 0.3)),
                        overlay=not spec.get("behind"), oc=ocg)
        # Positivo = sube hacia la derecha, como se espera de una marca de agua.
        giro = fitz.Matrix(angulo)
        if not mosaico:
            centro = fitz.Point(vista.width / 2, vista.height / 2)
            inicio = fitz.Point(centro.x - ancho / 2, centro.y + fs * 0.35)
            self._texto_en_vista(page, inicio, texto, morph=(centro, giro) if angulo else None, **opciones)
            return
        # Mosaico al tresbolillo que cubre la hoja (con margen: al girar, las filas se
        # salen y hay que cubrir las esquinas).
        paso_x = ancho + fs * 2.0
        paso_y = fs * 3.2
        margen = max(vista.width, vista.height) * 0.5
        cols = int((vista.width + 2 * margen) / paso_x) + 1
        filas = int((vista.height + 2 * margen) / paso_y) + 1
        if cols * filas > MAX_MOSAICO:
            f = (cols * filas / MAX_MOSAICO) ** 0.5
            paso_x, paso_y = paso_x * f, paso_y * f
        hechas, fila = 0, 0
        y = -margen
        while y < vista.height + margen and hechas < MAX_MOSAICO:
            x = -margen + (paso_x / 2 if fila % 2 else 0)
            while x < vista.width + margen and hechas < MAX_MOSAICO:
                pivote = fitz.Point(x + ancho / 2, y)
                self._texto_en_vista(page, fitz.Point(x, y), texto,
                                     morph=(pivote, giro) if angulo else None, **opciones)
                hechas += 1
                x += paso_x
            y += paso_y
            fila += 1

    def _sellar_pagina(self, doc, page, i: int, capa: str, spec: dict, ocg: int):
        self._vaciar_capa(doc, page, ocg)
        if capa == "marca":
            self._dibujar_marca(page, spec, ocg)
        else:
            self._dibujar_textos(doc, page, i, spec, ocg)

    # ---- API ---------------------------------------------------------------

    def aplicar_sello(self, doc_id: str, capa: str, spec: dict, pages: Optional[List[int]] = None,
                      stash: bool = True) -> Optional[str]:
        """Aplica (o reemplaza) la capa en las páginas pedidas. Las páginas que no
        entran en el rango y tenían la capa la pierden: el rango nuevo manda."""
        if capa not in CAPAS:
            return None
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            stash_id = self._stash_document(doc) if stash else ''
            ocg = self._ocg_de(doc, capa, crear=True)
            objetivo = set(pages) if pages else set(range(len(doc)))
            for i in range(len(doc)):
                page = doc.load_page(i)
                if i in objetivo:
                    self._sellar_pagina(doc, page, i, capa, spec, ocg)
                else:
                    self._vaciar_capa(doc, page, ocg)
            self._guardar_spec(doc, ocg, {**spec, "pages": sorted(objetivo) if pages else None})
            self._dirty[doc_id] = True
            self._invalidate_render_cache(doc_id)
            return stash_id

    def quitar_sello(self, doc_id: str, capa: str, stash: bool = True) -> Optional[dict]:
        if capa not in CAPAS:
            return None
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            ocg = self._ocg_de(doc, capa, crear=False)
            if not ocg:
                return {"stash_id": "", "removed": 0}
            stash_id = self._stash_document(doc) if stash else ''
            paginas = [doc.load_page(i) for i in range(len(doc))]
            quitadas = sum(1 for pg in paginas if self._vaciar_capa(doc, pg, ocg, solo_mirar=True))
            for pg in paginas:
                self._vaciar_capa(doc, pg, ocg)
            self._guardar_spec(doc, ocg, None)
            if quitadas:
                self._dirty[doc_id] = True
                self._invalidate_render_cache(doc_id)
            return {"stash_id": stash_id, "removed": quitadas}

    def estado_sellos(self, doc_id: str) -> Optional[Dict[str, Optional[dict]]]:
        """La configuración aplicada de cada capa (None si no está)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            salida: Dict[str, Optional[dict]] = {}
            for capa in CAPAS:
                ocg = self._ocg_de(doc, capa, crear=False)
                salida[capa] = self._leer_spec(doc, ocg) if ocg else None
            return salida

    def vista_previa_sello(self, doc_id: str, page_num: int, capa: str, spec: dict,
                           ancho_px: int = 640, area: str = "full") -> Optional[bytes]:
        """PNG de la página con el sello aplicado sobre una COPIA: el documento no se
        toca. Es el mismo código que el de aplicar, así que la vista previa no miente."""
        if capa not in CAPAS:
            return None
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            copia = fitz.open()
            try:
                copia.insert_pdf(doc, from_page=page_num, to_page=page_num)
                pagina = copia.load_page(0)
                # Numeración y total como en el documento real, no los de la copia.
                total_real = len(doc)
                ocg = self._ocg_de(copia, capa, crear=True)
                # La capa vieja viene copiada con otro xref: se vacía por nombre.
                for xref, info in (copia.get_ocgs() or {}).items():
                    if info.get("name") == CAPAS[capa]:
                        self._vaciar_capa(copia, pagina, xref)
                if capa == "marca":
                    self._dibujar_marca(pagina, spec, ocg)
                else:
                    falso = _DocConTotal(copia, total_real, doc.name)
                    self._dibujar_textos(falso, pagina, page_num, spec, ocg)
                escala = ancho_px / max(pagina.rect.width, 1)
                pix = pagina.get_pixmap(matrix=fitz.Matrix(escala, escala), alpha=False)
                if area in ("top", "bottom"):
                    # La franja de arriba o de abajo, para leer un encabezado de 9 pt en
                    # un plano de 36 in (en la hoja entera mide 2 px). Se recorta del
                    # pixmap ya girado, así vale igual en hojas con /Rotate.
                    alto = max(1, min(pix.height, int(pix.height * 0.16), int(pix.width * 0.25)))
                    y0 = 0 if area == "top" else pix.height - alto
                    # `copy` copia en las MISMAS coordenadas: la franja nace ubicada
                    # donde está el recorte (si no, la de abajo salía negra).
                    caja = fitz.IRect(0, y0, pix.width, y0 + alto)
                    franja = fitz.Pixmap(pix.colorspace, caja, False)
                    franja.copy(pix, caja)
                    franja.set_origin(0, 0)
                    pix = franja
                return pix.tobytes("png")
            finally:
                copia.close()


class _DocConTotal:
    """Lo único que `_dibujar_textos` le pide al documento: cuántas páginas tiene y
    cómo se llama. En la vista previa son las del documento real, no las de la copia."""

    def __init__(self, copia, total: int, nombre: str):
        self._total = total
        self.name = nombre

    def __len__(self):
        return self._total
