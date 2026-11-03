"""OCR de páginas escaneadas: les pone una capa de texto invisible que se puede buscar, copiar
y, sobre todo, EDITAR como cualquier texto del PDF.

Para que la edición salga bien no basta con pegar las palabras: la capa lleva, por línea, la
fuente que más se parece (sans o serif), el cuerpo que hace coincidir el ancho de cada palabra
con la que se ve en la imagen, la línea base real y el color de la tinta. Con eso el
párrafo que se abre al editar tiene el cuerpo, la posición y el color del escaneo, y el texto
nuevo queda como el de al lado.
"""
import logging
import re
from io import BytesIO
from statistics import median
from typing import List, Optional, Tuple

import fitz  # PyMuPDF

from app.services import _ocr
from app.services._ocr import LineaOcr, Palabra

logger = logging.getLogger(__name__)

DPI_OCR = 300
# Una hoja grande (un plano A0) a 300 dpi son 14 000 px por lado: se baja la resolución para
# que quepa en memoria y no tarde minutos. 7 000 px mantiene legible el texto de plano.
LADO_MAXIMO_PX = 7000

# Altura de las letras de Helvetica, en cuerpos: mayúscula y cifra, minúscula sin asta
# («x») y cola (g, p, y…). El cuerpo se saca de la ALTURA de lo reconocido y no de su ancho:
# la altura no depende de la fuente (la ancha de una Times y una Helvetica del mismo cuerpo
# difieren un 10 %, tanto como el ruido de medir una caja), así que no hay forma fiable de
# adivinar si el original es serif ni negrita; el cuerpo, en cambio, sale bien. Se escribe
# siempre con Helvetica y la fuente se cambia en el editor.
_MAYUS, _X, _COLA = 0.72, 0.52, 0.21
_ALTAS = set("bdfhklt") | set("áéíóúñüÁÉÍÓÚÑÜ")  # con asta o acento: llegan a la altura de la mayúscula
_CON_COLA = set("gjpqy,;Q()[]{}/|")
FUENTE_CAPA = "helv"
# La caja que da Tesseract rodea la tinta con ~1 px de holgura (más con un escaneo borroso).
HOLGURA_PX = 1.0


def _altura_esperada(palabra: str) -> Optional[float]:
    """Alto de la tinta de la palabra en cuerpos de Helvetica; None si no tiene letras ni cifras."""
    if not any(c.isalnum() for c in palabra):
        return None
    alta = any(c.isupper() or c.isdigit() or c in _ALTAS for c in palabra)
    return (_MAYUS if alta else _X) + (_COLA if any(c in _CON_COLA for c in palabra) else 0.0)


def cuerpo_de(lineas: List[LineaOcr], escala: float) -> float:
    """El cuerpo (en puntos) de un párrafo reconocido: la mediana de lo que mide cada
    palabra respecto de lo que mediría en Helvetica."""
    medidas = []
    for ln in lineas:
        for p in ln.palabras:
            esperado = _altura_esperada(p.texto)
            if esperado:
                medidas.append(max(escala, (p.y1 - p.y0) - HOLGURA_PX * escala) / esperado)
    if not medidas:
        p = lineas[0].palabras[0]
        return max(4.0, (p.y1 - p.y0) * 0.8)
    return max(3.0, min(median(medidas), 300.0))


def base_de_linea(linea: LineaOcr, cuerpo: float) -> float:
    """La línea base: la caja de una palabra termina en ella salvo que tenga cola (g, p, y…)."""
    bases = [p.y1 - (_COLA * cuerpo if any(c in _CON_COLA for c in p.texto) else 0.0)
             for p in linea.palabras if any(c.isalnum() for c in p.texto)]
    return median(bases) if bases else linea.palabras[0].y1


def agrupar_parrafos(lineas: List[LineaOcr]) -> List[List[LineaOcr]]:
    """Los párrafos de la página. Tesseract numera (bloque, párrafo), pero parte de más: una
    última línea corta suele quedar como bloque aparte. Se pegan al anterior las líneas que
    siguen casi sin hueco, con el mismo margen izquierdo y el mismo tamaño de letra."""
    grupos: dict = {}
    for ln in lineas:
        grupos.setdefault((ln.bloque, ln.parrafo), []).append(ln)
    res: List[List[LineaOcr]] = []
    for _, g in sorted(grupos.items()):
        if res:
            previo = res[-1]
            a, b = previo[-1], g[0]
            alto_a = median(p.y1 - p.y0 for p in a.palabras)
            alto_b = median(p.y1 - p.y0 for p in b.palabras)
            hueco = b.caja[1] - a.caja[3]
            if (hueco < 0.8 * max(alto_a, alto_b) and abs(a.caja[0] - b.caja[0]) < 5.0
                    and 0.8 < alto_b / alto_a < 1.25):
                previo.extend(g)
                continue
        res.append(list(g))
    return res


# Las cuatro fuentes entre las que se elige: sans y serif, normal y negrita.
CANDIDATAS = ("helv", "hebo", "tiro", "tibo")
_NEGRITAS = {"hebo", "tibo"}
_REJILLA = (64, 28)
MAX_PALABRAS_MUESTRA = 6
MAX_PARRAFOS_A_CLASIFICAR = 120  # un plano con cientos de rótulos no merece segundos de más


def _tinta(im):
    """La imagen en grises, con el contraste al máximo y recortada a la caja de tinta."""
    from PIL import ImageOps
    g = ImageOps.autocontrast(im.convert("L"), cutoff=2)
    caja = g.point(lambda v: 255 if v < 140 else 0).getbbox()
    return g.crop(caja) if caja else g


def _dibujar_palabra(scratch: "fitz.Document", palabra: str, fuente: str, cuerpo: float):
    from PIL import Image
    page = scratch.new_page(width=max(60.0, len(palabra) * cuerpo * 3 + 20), height=cuerpo * 6 + 20)
    try:
        page.insert_text((10, cuerpo * 3 + 6), palabra, fontname=fuente, fontsize=cuerpo * 3)
        px = page.get_pixmap(dpi=72, colorspace=fitz.csGRAY, alpha=False)
        return _tinta(Image.frombytes("L", (px.width, px.height), px.samples))
    finally:
        scratch.delete_page(-1)


def _distancia(a, b) -> float:
    """Cuánto difieren dos recortes de la misma palabra (0 = iguales, 255 = opuestos): los dos
    a una rejilla común y algo borrosos, porque lo que distingue una fuente de otra son los
    trazos (remates, grosor) y no el ancho exacto."""
    from PIL import ImageChops, ImageFilter, ImageOps, ImageStat
    from PIL import Image
    a = ImageOps.autocontrast(a.resize(_REJILLA, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8)))
    b = ImageOps.autocontrast(b.resize(_REJILLA, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8)))
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def clasificar_fuente(imagen, parrafo: List[LineaOcr], escala: float, cuerpo: float,
                      scratch: "fitz.Document") -> str:
    """Cuál de las cuatro fuentes se parece más al texto escaneado del párrafo: se dibujan las
    palabras más largas con cada una y se comparan con lo que hay en la imagen. Con menos de
    dos palabras para comparar (un rótulo suelto, una cifra) no se arriesga: Helvetica."""
    palabras = sorted(
        (p for ln in parrafo for p in ln.palabras
         if len(p.texto) >= 4 and p.confianza >= 60 and all(c.isalnum() or c in ".,:;-/%" for c in p.texto)),
        key=lambda p: -(p.x1 - p.x0))[:MAX_PALABRAS_MUESTRA]
    if len(palabras) < 2:
        return FUENTE_CAPA
    puntos = {f: 0.0 for f in CANDIDATAS}
    try:
        for p in palabras:
            recorte = _tinta(imagen.crop((int(p.x0 / escala) - 1, int(p.y0 / escala) - 1,
                                          int(p.x1 / escala) + 1, int(p.y1 / escala) + 1)))
            for f in CANDIDATAS:
                puntos[f] += _distancia(recorte, _dibujar_palabra(scratch, p.texto, f, cuerpo))
    except Exception:
        logger.debug("no se pudo clasificar la fuente", exc_info=True)
        return FUENTE_CAPA
    # Una negrita solo gana si mejora claramente a su versión normal (la tinta gruesa de un
    # escaneo borroso se parece a una negrita).
    return min(CANDIDATAS, key=lambda f: puntos[f] * (1.08 if f in _NEGRITAS else 1.0))


def cuerpo_con_fuente(parrafo: List[LineaOcr], fuente: str, por_alto: float) -> float:
    """El cuerpo medido por el ANCHO de las palabras, ya sabida la fuente: es más exacto que
    el de la altura (error de un 3 % contra un 7 %). Si no concuerda con el de la altura (±20 %)
    algo falló al medir y vale el de la altura."""
    razones = []
    for ln in parrafo:
        for p in ln.palabras:
            if len(p.texto) >= 3:
                try:
                    largo = fitz.get_text_length(p.texto, fontname=fuente, fontsize=1)
                except Exception:
                    continue
                if largo > 0:
                    razones.append((p.x1 - p.x0) / largo)
    if not razones:
        return por_alto
    por_ancho = median(razones) * 1.03  # la caja de tinta es algo más angosta que el avance
    return por_ancho if 0.8 < por_ancho / por_alto < 1.2 else por_alto


def color_de_tinta(imagen, caja_px: Tuple[float, float, float, float]) -> Tuple[float, float, float]:
    """El color de la tinta en `caja_px`: la media del 12 % más oscuro. El negro de un
    escaneo sale casi negro y se deja negro; la tinta azul o roja conserva su tono."""
    try:
        x0, y0, x1, y1 = (int(round(v)) for v in caja_px)
        recorte = imagen.crop((max(0, x0), max(0, y0), min(imagen.width, x1), min(imagen.height, y1))).convert("RGB")
        crudo = recorte.tobytes()
        px = list(zip(crudo[0::3], crudo[1::3], crudo[2::3]))
        if len(px) < 20:
            return (0.0, 0.0, 0.0)
        px.sort(key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
        tinta = px[: max(8, len(px) // 8)]
        r, g, b = (sum(c[i] for c in tinta) / len(tinta) for i in range(3))
        luz = 0.299 * r + 0.587 * g + 0.114 * b
        if luz > 150 or max(r, g, b) - min(r, g, b) < 45:  # sin tinta clara, o gris/negro
            return (0.0, 0.0, 0.0) if luz < 120 else (0.2, 0.2, 0.2)
        return (r / 255, g / 255, b / 255)
    except Exception:
        return (0.0, 0.0, 0.0)


class OcrMixin:
    def ocr_available(self) -> bool:
        return _ocr.disponible()

    def ocr_languages(self) -> List[str]:
        return _ocr.idiomas_instalados() if _ocr.disponible() else []

    def pages_without_text(self, doc_id: str) -> Optional[List[int]]:
        """Índices de las páginas sin capa de texto, o sea las que el OCR tendría que
        procesar. Barato (no rasteriza nada) y sirve para poder decirle al usuario
        cuánto va a tardar ANTES de arrancar: el OCR de un documento entero son
        minutos con la app tomada y no se puede cancelar."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            return [i for i in range(len(doc)) if not doc.load_page(i).get_text().strip()]

    @staticmethod
    def _rasterizar_para_ocr(page):
        """La página como la ve el usuario (con su giro), a la resolución del OCR. Devuelve la
        imagen PIL y los puntos PDF por píxel."""
        from PIL import Image
        dpi = min(DPI_OCR, LADO_MAXIMO_PX / max(page.rect.width, page.rect.height) * 72)
        pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False, annots=False)
        return Image.open(BytesIO(pix.tobytes("png"))), 72.0 / dpi

    def _escribir_capa_ocr(self, page, lineas: List[LineaOcr], imagen, escala: float) -> int:
        """Escribe las líneas reconocidas como texto invisible. Devuelve cuántas palabras."""
        total = 0
        giro = page.rotation
        # Un párrafo = un cuerpo: si no, cada línea saldría con el suyo y no se podría editar entera.
        grupos = agrupar_parrafos(lineas)
        scratch = fitz.open()
        pares = []
        try:
            for g in grupos:
                por_alto = cuerpo_de(g, escala)
                if len(grupos) <= MAX_PARRAFOS_A_CLASIFICAR:
                    fuente = clasificar_fuente(imagen, g, escala, por_alto, scratch)
                    cuerpo = cuerpo_con_fuente(g, fuente, por_alto)
                else:
                    fuente, cuerpo = FUENTE_CAPA, por_alto
                pares += [(ln, fuente, cuerpo) for ln in g]
        finally:
            scratch.close()
        for ln, fuente, cuerpo in pares:
            base = base_de_linea(ln, cuerpo)
            x0, y0, x1, y1 = ln.caja
            color = color_de_tinta(imagen, (x0 / escala, y0 / escala, x1 / escala, y1 / escala))
            for p in ln.palabras:
                punto = fitz.Point(p.x0, base)
                if giro:
                    punto = punto * page.derotation_matrix  # el visor → la página sin girar
                try:
                    # Con un espacio detrás: el texto extraído y copiado sale «una dos», no «unados».
                    page.insert_text(punto, p.texto + " ", fontname=fuente, fontsize=cuerpo, color=color,
                                     render_mode=3, rotate=giro)
                    total += 1
                except Exception:
                    try:
                        page.insert_text(punto, p.texto.encode("latin-1", "replace").decode("latin-1") + " ",
                                         fontname=fuente, fontsize=cuerpo, color=color, render_mode=3, rotate=giro)
                        total += 1
                    except Exception:
                        continue
        return total

    def make_searchable(self, doc_id: str, pages: Optional[List[int]] = None, stash: bool = True):
        """OCR de páginas escaneadas y capa de texto invisible: quedan buscables, copiables y
        editables. Devuelve (palabras, stash_id, página_del_stash); palabras = -1 si no hay
        motor de OCR."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return 0, '', None
            indices = pages if pages is not None else list(range(len(doc)))
            a_reconocer = [i for i in indices if 0 <= i < len(doc) and not doc.load_page(i).get_text().strip()]
            if not a_reconocer:
                return 0, '', None
            if not _ocr.disponible():
                return -1, '', None
            stash_id = ''
            stash_page = None
            if stash:
                if len(a_reconocer) == 1:
                    stash_id = self._stash_pages(doc, a_reconocer)
                    stash_page = a_reconocer[0]
                else:
                    stash_id = self._stash_document(doc)
            total = 0
            for i in a_reconocer:
                page = doc.load_page(i)
                try:
                    imagen, escala = self._rasterizar_para_ocr(page)
                    lineas = _ocr.reconocer(imagen, escala)
                    total += self._escribir_capa_ocr(page, lineas, imagen, escala)
                except Exception:
                    logger.exception("OCR de la página %s falló (doc %s)", i, doc_id)
            if total:
                self._dirty[doc_id] = True
                self._invalidate_render_cache(doc_id)
            return total, stash_id, stash_page

    def ocr_page(self, doc_id: str, page_num: int) -> Optional[str]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            try:
                imagen, _ = self._rasterizar_para_ocr(doc.load_page(page_num))
                return _ocr.texto_de(imagen)
            except Exception:
                logger.exception("ocr_page falló (doc %s, página %s)", doc_id, page_num)
                return None
