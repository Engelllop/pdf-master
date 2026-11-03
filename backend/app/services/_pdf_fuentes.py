"""Fuentes para reescribir texto: la instalada que corresponde a la del documento.

PyMuPDF no reusa una fuente incrustada por nombre (casi siempre es un subconjunto con
los glifos que el documento ya usaba), así que editar escribía con una base14 —Helvetica,
Times o Courier—: un texto en Calibri o Cambria salía en otra letra, y una «→», un «€»
o una «Ñ» fuera de latin-1 desaparecían. Acá se busca entre las fuentes del sistema la
de la misma familia y estilo, que es lo que hace PDFelement. Si no está instalada (o no
es Windows) todo cae a la base14 de siempre: el comportamiento anterior es el piso.

Se descartó reusar la fuente incrustada: sin leer su `cmap` no hay forma de saber si el
glifo que devuelve `has_glyph` es el del carácter o el de otro (pasa con los
subconjuntos «Identity-H» de Word), y escribir un glifo equivocado es peor que cambiar
de fuente.
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import sys
import threading
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

from app.services._pdf_base import _TRANSLITERACIONES, texto_estampable

logger = logging.getLogger("pdfmaster")
# fontTools cuenta cada tabla que recorta («GPOS subsetted», «meta NOT subset…») en INFO:
# decenas de líneas por edición en la salida del motor, y un pipe que nadie vacía se llena.
logging.getLogger("fontTools").setLevel(logging.ERROR)

Clave = Tuple[str, bool, bool]  # (familia normalizada, negrita, cursiva)

# Nombres de las base14 / PostScript que no existen tal cual en el sistema, a su
# equivalente de métricas idénticas.
_ALIAS = {
    "helvetica": "arial",
    "timesroman": "timesnewroman",
    "times": "timesnewroman",
    "courier": "couriernew",
}

# Si la fuente del documento no trae algún carácter del texto nuevo, se prueba con
# estas, que sí cubren símbolos, flechas, cirílico y griego.
_RESPALDO = ("arial", "segoeui", "arialunicodems", "segoeuisymbol")

_RE_SUBCONJUNTO = re.compile(r"^[A-Z]{6}\+")
_RE_NEGRITA = re.compile(r"(?:semi|demi|extra|ultra)?(?:bold|negrita)")
_RE_CURSIVA = re.compile(r"italic|oblique|cursiva|oblicua")
_RE_SOBRANTE = re.compile(r"regular|normal|truetype|opentype")
_RE_SUFIJO_PS = re.compile(r"(?:psmt|mt|ps)$")
_EXTENSIONES = (".ttf", ".otf", ".ttc")

_lock = threading.Lock()
_indice: Optional[Dict[Clave, str]] = None
_fonts: Dict[str, Optional[fitz.Font]] = {}


def analizar_nombre(nombre: Optional[str]) -> Clave:
    """«ABCDEF+TimesNewRomanPS-BoldMT» → ('timesnewroman', True, False).

    La misma normalización se aplica a los nombres del PDF y a los del sistema, así que
    «Arial-BoldMT» y «Arial Bold (TrueType)» llegan a la misma clave."""
    s = re.sub(r"[^a-z0-9]", "", _RE_SUBCONJUNTO.sub("", nombre or "").lower())
    negrita = bool(_RE_NEGRITA.search(s))
    cursiva = bool(_RE_CURSIVA.search(s))
    s = _RE_NEGRITA.sub("", s)
    s = _RE_CURSIVA.sub("", s)
    s = _RE_SOBRANTE.sub("", s)
    s = _RE_SUFIJO_PS.sub("", s)
    return s, negrita, cursiva


def _entradas_del_sistema() -> List[Tuple[str, str]]:
    """(nombre, ruta) de las fuentes instaladas. Vacío fuera de Windows."""
    if sys.platform != "win32":
        return []
    try:
        import winreg
    except ImportError:  # pragma: no cover
        return []
    carpeta = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    salida: List[Tuple[str, str]] = []
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            llave = winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
        except OSError:
            continue
        with llave:
            i = 0
            while True:
                try:
                    nombre, ruta, _ = winreg.EnumValue(llave, i)
                except OSError:
                    break
                i += 1
                if not isinstance(ruta, str) or not ruta.lower().endswith(_EXTENSIONES):
                    continue
                if not os.path.isabs(ruta):
                    ruta = os.path.join(carpeta, ruta)
                if os.path.isfile(ruta):
                    salida.append((nombre, ruta))
    return salida


_RE_ESTILO_VISIBLE = re.compile(
    r"\b(?:semi|demi|extra|ultra)?[ -]?(?:bold|negrita|italic|oblique|cursiva|oblicua|regular|normal)\b",
    re.I)
# Fuentes de símbolos o iconos: elegirlas para escribir texto da basura.
_RE_SIMBOLOS = re.compile(
    r"wingdings|webdings|^symbol$|marlett|mt extra|mdl2|fluent icons|holomdl2|opensymbol|dingbats", re.I)
_nombres: Dict[str, str] = {}  # familia normalizada → nombre para mostrar


def _nombre_visible(nombre: str) -> str:
    """«Arial Narrow Negrita Cursiva» → «Arial Narrow»."""
    return re.sub(r"\s{2,}", " ", _RE_ESTILO_VISIBLE.sub("", nombre)).strip()


def _construir_indice() -> Dict[Clave, str]:
    indice: Dict[Clave, str] = {}
    for nombre, ruta in _entradas_del_sistema():
        nombre = re.sub(r"\s*\((?:TrueType|OpenType)\)\s*$", "", nombre, flags=re.I)
        # «Cambria & Cambria Math»: una colección; la primera es la que va en el .ttc.
        nombre = nombre.split(" & ")[0]
        clave = analizar_nombre(nombre)
        indice.setdefault(clave, ruta)
        _nombres.setdefault(clave[0], _nombre_visible(nombre))
    return indice


def familias_instaladas() -> List[str]:
    """Las familias del sistema con las que se puede escribir texto, para el selector
    de fuente del editor: sin duplicados, sin símbolos, ordenadas."""
    familias = {k[0] for k in indice_del_sistema()}
    vistos: Dict[str, str] = {}
    for fam in familias:
        nombre = _nombres.get(fam)
        if nombre and not _RE_SIMBOLOS.search(nombre):
            vistos.setdefault(nombre.lower(), nombre)
    return sorted(vistos.values(), key=str.lower)


def indice_del_sistema() -> Dict[Clave, str]:
    """Se arma una vez, la primera vez que hace falta."""
    global _indice
    with _lock:
        if _indice is None:
            try:
                _indice = _construir_indice()
            except Exception:  # un registro raro no debe romper la edición
                logger.exception("No se pudieron leer las fuentes del sistema")
                _indice = {}
        return _indice


def _buscar(familia: str, negrita: bool, cursiva: bool) -> Optional[str]:
    """La fuente de `familia` más cercana al estilo pedido: primero exacta, y si falta
    la cursiva o la negrita, la que conserve al menos una de las dos."""
    indice = indice_del_sistema()
    for b, i in ((negrita, cursiva), (negrita, False), (False, cursiva), (False, False)):
        ruta = indice.get((familia, b, i))
        if ruta:
            return ruta
    return None


def _font(ruta: str) -> Optional[fitz.Font]:
    with _lock:
        if ruta not in _fonts:
            try:
                _fonts[ruta] = fitz.Font(fontfile=ruta)
            except Exception:
                logger.warning("No se pudo cargar la fuente %s", ruta)
                _fonts[ruta] = None
        return _fonts[ruta]


# Las dos primeras letras de la base14 de PyMuPDF dicen su clase: helv, tiro, cour…
_CLASE_DE_BASE14 = {"he": "arial", "ti": "timesnewroman", "co": "couriernew"}


def _cabe_en_base14(texto: str) -> bool:
    """True si todo el texto es latin-1: la base14 lo escribe tal cual, sin transliterar
    («—», «→» o «€» sí piden una fuente con glifo propio)."""
    try:
        texto.encode("latin-1")
    except UnicodeEncodeError:
        return False
    return True


def _cubre(font: fitz.Font, texto: str) -> bool:
    return all(ch in "\r\n\t" or font.has_glyph(ord(ch)) for ch in texto)


def _subconjunto(ruta: str, simbolos) -> Optional[bytes]:
    """La fuente reducida a los glifos de `simbolos`, o None si no se pudo.

    PyMuPDF embebe la fuente ENTERA: una palabra editada en Calibri dejaba un PDF de
    828 bytes en 800 KB. Con el subconjunto pesa unos pocos KB. Sin fontTools (o si
    falla con una fuente rara) se devuelve None y el llamador embebe la completa:
    más pesado, pero el texto sale igual."""
    try:
        from fontTools import subset
    except ImportError:
        return None
    try:
        opciones = subset.Options()
        opciones.font_number = 0          # un .ttc trae varias: la primera
        opciones.layout_features = []     # MuPDF no aplica kerning ni ligaduras al escribir
        opciones.name_IDs = ["*"]         # el nombre viaja: así se reconoce al reeditar
        opciones.notdef_outline = True
        opciones.hinting = False
        opciones.drop_tables = list(opciones.drop_tables) + ["DSIG"]
        fuente = subset.load_font(ruta, opciones)
        recortador = subset.Subsetter(opciones)
        recortador.populate(text=" " + "".join(sorted(simbolos)))
        recortador.subset(fuente)
        salida = io.BytesIO()
        subset.save_font(fuente, salida, opciones)
        return salida.getvalue()
    except Exception:
        logger.warning("No se pudo reducir la fuente %s: se embebe completa", ruta, exc_info=True)
        return None


class FuenteEdicion:
    """La fuente elegida para una edición. Sin `ruta` es una base14.

    Orden de uso: `adaptar(texto)` (que además anota qué glifos hacen falta) y después
    `registrar(page)`; el nombre del recurso depende de esos glifos."""

    def __init__(self, base14: str, ruta: Optional[str] = None, font: Optional[fitz.Font] = None):
        self._base14 = base14
        self.ruta = ruta
        self.font = font
        self.simbolos: set = set()
        self._buffer: Optional[bytes] = None
        self._buffer_de: Optional[frozenset] = None

    @property
    def del_sistema(self) -> bool:
        return self.ruta is not None

    @property
    def nombre(self) -> str:
        """Nombre del recurso en la página. Dos ediciones con la misma fuente pero
        distintos glifos son dos recursos: PyMuPDF reusa el que ya existe con ese nombre."""
        if not self.ruta:
            return self._base14
        huella = self.ruta.lower() + "|" + "".join(sorted(self.simbolos))
        return "pm" + hashlib.sha1(huella.encode("utf-8")).hexdigest()[:8]

    def _reducida(self) -> Optional[bytes]:
        clave = frozenset(self.simbolos)
        if not clave:
            return None
        if self._buffer_de != clave:
            self._buffer, self._buffer_de = _subconjunto(self.ruta, clave), clave
        return self._buffer

    def registrar(self, page) -> str:
        """Deja la fuente disponible en `page` y devuelve su nombre de recurso."""
        if not self.ruta:
            return self._base14
        nombre = self.nombre
        reducida = self._reducida()
        if reducida:
            page.insert_font(fontname=nombre, fontbuffer=reducida)
        else:
            page.insert_font(fontname=nombre, fontfile=self.ruta)
        return nombre

    def adaptar(self, texto: Optional[str]) -> str:
        """El texto tal como esta fuente puede escribirlo. Lo que no tiene glifo se
        translitera («→» → «->») y, si tampoco, queda «?» en vez de desaparecer."""
        if not texto:
            return ""
        if self.font is None:
            return texto_estampable(texto)
        salida = []
        for ch in texto:
            if ch in "\r\n\t" or self.font.has_glyph(ord(ch)):
                salida.append(ch)
                continue
            t = _TRANSLITERACIONES.get(ch)
            if t is not None and all(self.font.has_glyph(ord(c)) for c in t):
                salida.append(t)
            else:
                salida.append("?")
        resultado = "".join(salida)
        self.simbolos.update(c for c in resultado if c not in "\r\n\t")
        return resultado


def resolver_fuente(nombre_pdf: Optional[str], texto: Optional[str],
                    negrita: Optional[bool], cursiva: Optional[bool],
                    base14: str) -> FuenteEdicion:
    """La fuente con la que reescribir `texto` donde había una en `nombre_pdf`.

    `negrita` / `cursiva` en None conservan el estilo del original; True/False lo fuerzan.
    Orden: la familia del documento instalada → una de respaldo que cubra todo el texto →
    la misma familia con «?» en lo que no tenga → `base14` (el comportamiento anterior)."""
    familia, b0, i0 = analizar_nombre(nombre_pdf)
    b = b0 if negrita is None else bool(negrita)
    i = i0 if cursiva is None else bool(cursiva)
    texto = texto or ""

    if familia in _ALIAS:
        # «Helvetica», «Times-Roman», «Courier»: el documento ya usa una base14. Si el
        # texto nuevo cabe en latin-1 se escribe con la misma, sin embeber nada y sin
        # mover la caja de la línea (Arial y Helvetica miden igual pero no tienen el
        # mismo alto de línea). Solo con símbolos se pasa a la fuente del sistema.
        if _cabe_en_base14(texto):
            return FuenteEdicion(base14)
        familia = _ALIAS[familia]

    if not _buscar(familia, b, i):
        # La fuente del documento no está instalada. Con texto que una base14 escribe
        # completo no se embebe nada (pesa menos y conserva la pista serif / monoespaciada
        # de `base14`); solo si trae símbolos o alfabetos que perdería se usa una del
        # sistema de la misma clase, para no dejar «?» donde había una letra.
        if _cabe_en_base14(texto):
            return FuenteEdicion(base14)
        familia = _CLASE_DE_BASE14.get(base14[:2], "arial")

    con_huecos: Optional[FuenteEdicion] = None
    vistas = set()
    # Si la fuente del documento no trae algún glifo, el respaldo empieza por la clase
    # del original (una serif cae a Times New Roman, no a Arial) y sigue con las demás.
    for fam in (familia, _CLASE_DE_BASE14.get(base14[:2]), *_RESPALDO):
        if not fam or fam in vistas:
            continue
        vistas.add(fam)
        ruta = _buscar(fam, b, i)
        font = _font(ruta) if ruta else None
        if not ruta or font is None:
            continue
        elegida = FuenteEdicion(base14, ruta, font)
        if _cubre(font, texto):
            return elegida
        if fam == familia:
            con_huecos = elegida
    # Ninguna cubre todo: mejor la del documento con «?» que una base14 que pierde más.
    if con_huecos is not None:
        return con_huecos
    return FuenteEdicion(base14)
