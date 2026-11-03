"""Reconocimiento de texto (OCR) con Tesseract.

Tesseract viaja DENTRO de la app (carpeta `tesseract/` junto al motor: ejecutable, DLL y los
idiomas), así que el OCR funciona sin instalar nada. Si no está, se busca uno instalado
(variable `PDFMASTER_TESSERACT`, el PATH o `Program Files`). Este módulo solo sabe llamarlo y
devolver lo reconocido ordenado en palabras → líneas → párrafos; qué se hace con eso (capa de
texto invisible, edición) lo deciden los demás.
"""
from __future__ import annotations

import logging
import os
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

IDIOMAS_PREFERIDOS = ("spa", "eng")
# Por debajo de esta confianza (0–100) una palabra se considera ruido (manchas, bordes).
CONFIANZA_MINIMA = 30.0


@dataclass
class Palabra:
    texto: str
    x0: float
    y0: float
    x1: float
    y1: float
    confianza: float


@dataclass
class LineaOcr:
    palabras: List[Palabra] = field(default_factory=list)
    bloque: int = 0
    parrafo: int = 0

    @property
    def texto(self) -> str:
        return " ".join(p.texto for p in self.palabras)

    @property
    def caja(self) -> Tuple[float, float, float, float]:
        return (min(p.x0 for p in self.palabras), min(p.y0 for p in self.palabras),
                max(p.x1 for p in self.palabras), max(p.y1 for p in self.palabras))


@dataclass(frozen=True)
class Motor:
    exe: str
    tessdata: Optional[str]  # None: el que trae Tesseract por defecto


def _carpetas_candidatas() -> List[Path]:
    """Dónde puede estar la carpeta `tesseract/` que viaja con la app."""
    res: List[Path] = []
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        res += [base / "tesseract", Path(sys.executable).parent / "tesseract"]
    # En desarrollo: backend/ocr/tesseract (lo deja scripts/preparar_ocr.py).
    res.append(Path(__file__).resolve().parents[2] / "ocr" / "tesseract")
    return res


def _buscar() -> Optional[Motor]:
    explicito = os.environ.get("PDFMASTER_TESSERACT")
    if explicito and Path(explicito).is_file():
        return Motor(explicito, _tessdata_de(Path(explicito).parent))
    nombre = "tesseract.exe" if sys.platform == "win32" else "tesseract"
    for carpeta in _carpetas_candidatas():
        exe = carpeta / nombre
        if exe.is_file():
            return Motor(str(exe), _tessdata_de(carpeta))
    en_path = shutil.which("tesseract")
    if en_path:
        return Motor(en_path, _tessdata_de(Path(en_path).parent))
    if sys.platform == "win32":
        for raiz in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if raiz and (Path(raiz) / "Tesseract-OCR" / nombre).is_file():
                carpeta = Path(raiz) / "Tesseract-OCR"
                return Motor(str(carpeta / nombre), _tessdata_de(carpeta))
    return None


def _tessdata_de(carpeta: Path) -> Optional[str]:
    td = carpeta / "tessdata"
    return str(td) if td.is_dir() else None


_motor: Optional[Motor] = None
_buscado = False
_idiomas: Optional[List[str]] = None


def motor() -> Optional[Motor]:
    """El Tesseract que se usa, o None si no hay ninguno. La búsqueda se hace una vez."""
    global _motor, _buscado
    if not _buscado:
        _motor, _buscado = _buscar(), True
    return _motor


def reiniciar() -> None:
    """Olvida lo buscado (pruebas)."""
    global _motor, _buscado, _idiomas
    _motor, _buscado, _idiomas = None, False, None


def _preparar_pytesseract(m: Motor):
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = m.exe
    # Los idiomas se indican por variable de entorno: `--tessdata-dir "ruta"` pasa por un
    # separador de argumentos que en Windows se come las barras de la ruta.
    if m.tessdata:
        os.environ["TESSDATA_PREFIX"] = m.tessdata
    return pytesseract


def disponible() -> bool:
    m = motor()
    if not m:
        return False
    try:
        _preparar_pytesseract(m).get_tesseract_version()
        return True
    except Exception:
        logger.warning("Tesseract no responde (%s)", m.exe, exc_info=True)
        return False


def idiomas_instalados() -> List[str]:
    global _idiomas
    if _idiomas is None:
        m = motor()
        try:
            pt = _preparar_pytesseract(m) if m else None
            langs = pt.get_languages() if pt and m else []
        except Exception:
            langs = []
        _idiomas = [l for l in langs if l != "osd"]
    return _idiomas


def idioma_de_trabajo() -> str:
    """«spa+eng» si están los dos; si no, los que haya (mejor reconocer mal que nada)."""
    elegidos = [l for l in IDIOMAS_PREFERIDOS if l in idiomas_instalados()]
    if not elegidos:
        elegidos = idiomas_instalados()[:1]
    return "+".join(elegidos) or "eng"


def reconocer(imagen, escala: float, psm: int = 3, confianza_minima: float = CONFIANZA_MINIMA) -> List[LineaOcr]:
    """Reconoce `imagen` (PIL) y devuelve las líneas con sus palabras. `escala` pasa los
    píxeles de la imagen a las unidades de salida (puntos PDF: 72 / dpi). Lanza si Tesseract
    no está."""
    m = motor()
    if not m:
        raise RuntimeError("Tesseract no está disponible")
    pt = _preparar_pytesseract(m)
    from pytesseract import Output
    datos = pt.image_to_data(imagen, lang=idioma_de_trabajo(), config=f"--psm {psm}",
                             output_type=Output.DICT)
    lineas: Dict[Tuple[int, int, int], LineaOcr] = {}
    for i, txt in enumerate(datos["text"]):
        if not txt or not txt.strip():
            continue
        try:
            conf = float(datos["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        if conf < confianza_minima:
            continue
        clave = (datos["block_num"][i], datos["par_num"][i], datos["line_num"][i])
        ln = lineas.setdefault(clave, LineaOcr(bloque=clave[0], parrafo=clave[1]))
        x, y, w, h = datos["left"][i], datos["top"][i], datos["width"][i], datos["height"][i]
        ln.palabras.append(Palabra(txt.strip(), x * escala, y * escala, (x + w) * escala, (y + h) * escala, conf))
    return [l for _, l in sorted(lineas.items()) if l.palabras]


def texto_de(imagen, psm: int = 3) -> str:
    m = motor()
    if not m:
        raise RuntimeError("Tesseract no está disponible")
    pt = _preparar_pytesseract(m)
    return pt.image_to_string(imagen, lang=idioma_de_trabajo(), config=f"--psm {psm}")
