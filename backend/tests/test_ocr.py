"""OCR: Tesseract viaja con la app, la página escaneada queda con una capa de texto que se
puede buscar y EDITAR (fuente, cuerpo y línea base parecidos a los del escaneo), y editar un
párrafo sobre el escaneo borra la tinta de abajo y escribe el texto nuevo."""
import io
import sys

import fitz
import pytest
from PIL import Image, ImageChops, ImageFilter

from app.services import _ocr
from app.services._ocr import LineaOcr, Palabra
from app.services._pdf_ocr import (
    FUENTE_CAPA, agrupar_parrafos, base_de_linea, cuerpo_de, cuerpo_con_fuente, clasificar_fuente,
)

hay_ocr = pytest.mark.skipif(not _ocr.disponible(), reason="no hay Tesseract en este equipo")

PARRAFO = ("CLÁUSULA SEGUNDA. El contratista ejecutará la instalación de las tuberías de agua potable "
           "conforme a los planos aprobados. Las pruebas de presión se harán a 150 psi durante dos horas, "
           "y el pago se hará contra la entrega del acta de recibo, sin perjuicio de las garantías pactadas.")


def _palabra(texto, x0, y0, x1, y1, conf=90.0):
    return Palabra(texto, x0, y0, x1, y1, conf)


def _linea(palabras, bloque=1, parrafo=1):
    return LineaOcr(palabras=palabras, bloque=bloque, parrafo=parrafo)


# ── lógica pura ──────────────────────────────────────────────────────────────

class TestAgruparParrafos:
    def _l(self, y, x=72.0, alto=8.0, bloque=1):
        return _linea([_palabra("palabra", x, y, x + 40, y + alto)], bloque=bloque)

    def test_una_ultima_linea_corta_partida_por_tesseract_se_pega_al_parrafo(self):
        g = agrupar_parrafos([self._l(100), self._l(112), self._l(124, bloque=2)])
        assert [len(x) for x in g] == [3]

    def test_con_un_hueco_grande_son_parrafos_distintos(self):
        g = agrupar_parrafos([self._l(100), self._l(112), self._l(170, bloque=2)])
        assert [len(x) for x in g] == [2, 1]

    def test_otro_margen_izquierdo_es_otro_parrafo(self):
        g = agrupar_parrafos([self._l(100), self._l(112, x=120.0, bloque=2)])
        assert [len(x) for x in g] == [1, 1]

    def test_otro_tamano_de_letra_es_otro_parrafo(self):
        g = agrupar_parrafos([self._l(100), self._l(112, alto=16.0, bloque=2)])
        assert [len(x) for x in g] == [1, 1]


class TestCuerpoYBase:
    def test_el_cuerpo_sale_de_la_altura_de_la_tinta_en_helvetica(self):
        # «Hola» (con mayúscula): 0,72 cuerpos de alto. 8,64 pt de caja − ~1 px de holgura → ~12 pt.
        ln = _linea([_palabra("Hola", 0, 0, 20, 8.64 + 1 * 0.24)] * 3)
        assert cuerpo_de([ln], 0.24) == pytest.approx(12.0, rel=0.02)

    def test_una_palabra_con_cola_mide_mas_alto_para_el_mismo_cuerpo(self):
        sin = _linea([_palabra("Hola", 0, 0, 20, 8.64)])
        con = _linea([_palabra("Hoja", 0, 0, 20, 8.64 + 0.21 * 12)])
        assert cuerpo_de([sin], 0.0001) == pytest.approx(cuerpo_de([con], 0.0001), rel=0.02)

    def test_la_linea_base_es_el_fondo_de_la_caja_salvo_con_cola(self):
        ln = _linea([_palabra("Hola", 0, 0, 20, 50.0), _palabra("mapa", 25, 0, 45, 50.0 + 0.21 * 12)])
        assert base_de_linea(ln, 12.0) == pytest.approx(50.0, abs=0.01)

    def test_el_cuerpo_por_ancho_manda_si_concuerda_con_el_de_altura(self):
        w = fitz.get_text_length("contratista", fontname="helv", fontsize=12) / 1.03
        ln = _linea([_palabra("contratista", 0, 0, w, 9.0)])
        assert cuerpo_con_fuente([ln], "helv", 11.0) == pytest.approx(12.0, rel=0.01)

    def test_si_el_ancho_no_concuerda_con_la_altura_vale_la_altura(self):
        ln = _linea([_palabra("contratista", 0, 0, 5.0, 9.0)])
        assert cuerpo_con_fuente([ln], "helv", 11.0) == 11.0


class TestBuscarTesseract:
    def teardown_method(self):
        _ocr.reiniciar()

    def test_la_variable_de_entorno_manda(self, tmp_path, monkeypatch):
        exe = tmp_path / ("tesseract.exe" if sys.platform == "win32" else "tesseract")
        exe.write_text("x")
        (tmp_path / "tessdata").mkdir()
        monkeypatch.setenv("PDFMASTER_TESSERACT", str(exe))
        _ocr.reiniciar()
        m = _ocr.motor()
        assert m is not None and m.exe == str(exe) and m.tessdata == str(tmp_path / "tessdata")

    def test_sin_ninguno_no_hay_motor_ni_ocr(self, monkeypatch):
        monkeypatch.delenv("PDFMASTER_TESSERACT", raising=False)
        monkeypatch.setattr(_ocr, "_carpetas_candidatas", lambda: [])
        monkeypatch.setattr(_ocr.shutil, "which", lambda _: None)
        monkeypatch.delenv("ProgramFiles", raising=False)
        monkeypatch.delenv("ProgramFiles(x86)", raising=False)
        _ocr.reiniciar()
        assert _ocr.motor() is None and _ocr.disponible() is False

    def test_el_idioma_de_trabajo_prefiere_espanol_e_ingles_y_si_no_hay_usa_lo_que_haya(self, monkeypatch):
        monkeypatch.setattr(_ocr, "idiomas_instalados", lambda: ["eng", "spa", "fra"])
        assert _ocr.idioma_de_trabajo() == "spa+eng"
        monkeypatch.setattr(_ocr, "idiomas_instalados", lambda: ["fra"])
        assert _ocr.idioma_de_trabajo() == "fra"
        monkeypatch.setattr(_ocr, "idiomas_instalados", lambda: [])
        assert _ocr.idioma_de_trabajo() == "eng"

    def test_en_un_motor_empaquetado_busca_junto_al_ejecutable(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
        assert tmp_path / "tesseract" in _ocr._carpetas_candidatas()


# ── con Tesseract de verdad ──────────────────────────────────────────────────

def _pagina_de_texto():
    """Una hoja con tres bloques: un párrafo serif justificado, una nota sans y un total en negrita."""
    d = fitz.open()
    pg = d.new_page(width=612, height=792)
    pg.insert_textbox(fitz.Rect(72, 90, 540, 200), PARRAFO, fontsize=11, fontname="tiro", align=fitz.TEXT_ALIGN_JUSTIFY)
    pg.insert_textbox(fitz.Rect(72, 220, 540, 300), "NOTA GENERAL: Tubería PVC SDR-26 de 110 mm; profundidad mínima 0,80 m. "
                      "Cotas en metros, diámetros en milímetros.", fontsize=10, fontname="helv")
    pg.insert_text((72, 330), "Pago total: $ 12.450.000 - Fecha: 15/03/2026", fontsize=12, fontname="hebo")
    return d, pg


def _escaneo(tmp_path, nombre="escaneo.pdf", giro_pagina=0, inclinacion=0.5):
    """El «escaneo»: la hoja rasterizada a 200 dpi sobre papel crema, algo inclinada y borrosa,
    guardada como un PDF que solo tiene la imagen (sin una letra de texto)."""
    d, pg = _pagina_de_texto()
    pix = pg.get_pixmap(dpi=200)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    crema = (246, 240, 224)
    im = ImageChops.multiply(im, Image.new("RGB", im.size, crema))
    im = im.rotate(inclinacion, resample=Image.BICUBIC, fillcolor=crema).filter(ImageFilter.GaussianBlur(0.7))
    out = fitz.open()
    if giro_pagina:
        # La imagen va de lado y /Rotate la endereza: así vienen muchos escaneos reales.
        im = im.rotate(90, expand=True)
        p = out.new_page(width=792, height=612)
    else:
        p = out.new_page(width=612, height=792)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    p.insert_image(p.rect, stream=buf.getvalue())
    if giro_pagina:
        p.set_rotation(giro_pagina)
    ruta = str(tmp_path / nombre)
    out.save(ruta)
    out.close()
    return ruta


@pytest.fixture
def escaneo(tmp_path):
    return _escaneo(tmp_path)


def _abrir(client, ruta):
    return client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]


def _spans(doc, n=0):
    return [s for b in doc[n].get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]


def _guardar(client, doc_id, tmp_path, nombre="salida.pdf"):
    salida = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}", params={"output_path": salida}).status_code == 200
    return fitz.open(salida)


@hay_ocr
class TestHacerBuscable:
    def test_el_escaneo_no_tiene_texto_y_el_ocr_lo_encuentra(self, client, escaneo, tmp_path):
        assert fitz.open(escaneo)[0].get_text().strip() == ""
        doc_id = _abrir(client, escaneo)
        assert client.get(f"/pdf/ocr-pending/{doc_id}").json()["pages"] == [0]
        r = client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        assert r.status_code == 200 and r.json()["words"] > 40
        texto = " ".join(_guardar(client, doc_id, tmp_path)[0].get_text().split())
        assert "CLÁUSULA SEGUNDA" in texto and "tuberías" in texto and "presión" in texto
        assert "12.450.000" in texto and "15/03/2026" in texto
        assert client.get(f"/pdf/ocr-pending/{doc_id}").json()["pages"] == []

    def test_la_capa_es_invisible_la_pagina_se_ve_igual(self, client, escaneo, tmp_path):
        antes = fitz.open(escaneo)[0].get_pixmap(dpi=72).samples
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        despues = _guardar(client, doc_id, tmp_path)[0].get_pixmap(dpi=72).samples
        assert antes == despues

    def test_cada_parrafo_sale_con_la_fuente_y_el_cuerpo_del_escaneo(self, client, escaneo, tmp_path):
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        spans = _spans(_guardar(client, doc_id, tmp_path))
        serif = next(s for s in spans if "contratista" in s["text"])
        sans = next(s for s in spans if "NOTA" in s["text"])
        total = next(s for s in spans if "Pago total" in s["text"])
        assert "Times" in serif["font"] and serif["size"] == pytest.approx(11, rel=0.07)
        assert sans["font"] == "Helvetica" and sans["size"] == pytest.approx(10, rel=0.07)
        assert "Bold" in total["font"] and total["size"] == pytest.approx(12, rel=0.07)

    def test_la_linea_base_cae_donde_estaba_el_texto(self, client, tmp_path):
        ruta = _escaneo(tmp_path, inclinacion=0.0)
        doc_id = _abrir(client, ruta)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        total = next(s for s in _spans(_guardar(client, doc_id, tmp_path)) if "Pago total" in s["text"])
        assert total["origin"][1] == pytest.approx(330, abs=1.5)
        assert total["origin"][0] == pytest.approx(72, abs=1.5)

    def test_una_pagina_con_texto_se_salta(self, client, tmp_path):
        d, _ = _pagina_de_texto()
        ruta = str(tmp_path / "con_texto.pdf")
        d.save(ruta)
        doc_id = _abrir(client, ruta)
        assert client.post(f"/pdf/make-searchable/{doc_id}?page=0").json()["words"] == 0

    def test_se_puede_deshacer_con_el_stash(self, client, escaneo, tmp_path):
        doc_id = _abrir(client, escaneo)
        r = client.post(f"/pdf/make-searchable/{doc_id}?page=0").json()
        assert r["stash_id"] and r["stash_page"] == 0

    def test_en_una_pagina_girada_el_texto_queda_derecho(self, client, tmp_path):
        ruta = _escaneo(tmp_path, nombre="girado.pdf", giro_pagina=90)
        doc_id = _abrir(client, ruta)
        assert client.post(f"/pdf/make-searchable/{doc_id}?page=0").json()["words"] > 40
        doc = _guardar(client, doc_id, tmp_path)
        assert doc[0].rotation == 90
        assert "CLÁUSULA SEGUNDA" in " ".join(doc[0].get_text().split())
        # Y en el visor (la página con su giro) cada palabra está donde se ve: la «CLÁUSULA»
        # empieza arriba a la izquierda, no girada.
        w = next(w for w in doc[0].get_text("words") if w[4].startswith("CL"))
        visto = fitz.Rect(w[:4]) * doc[0].rotation_matrix  # get_text da las de la hoja sin girar
        assert visto.x0 == pytest.approx(72, abs=6) and visto.y0 == pytest.approx(90, abs=12)
        assert visto.width > visto.height * 3, "la palabra está de pie, no girada"

    def test_ocr_de_pagina_devuelve_el_texto(self, client, escaneo):
        doc_id = _abrir(client, escaneo)
        texto = client.get(f"/pdf/ocr/{doc_id}/0").json()["text"]
        assert "contratista" in texto and "presión" in texto


@hay_ocr
class TestEditarSobreElEscaneo:
    def _bloque(self, client, doc_id, x=150, y=99):
        r = client.get(f"/pdf/text-block/{doc_id}/0", params={"x": x, "y": y})
        assert r.status_code == 200, r.text
        return r.json()

    def _editar(self, client, doc_id, b, nuevo):
        r = client.post(f"/pdf/edit-text/{doc_id}", json={
            "page_num": 0, "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"], "text": nuevo,
            "size": b["size"], "color": b["color"], "font": b["font"], "wrap": True, "bold": b["bold"],
            "italic": b["italic"], "align": b["align"], "line_height": b["lineHeight"], "runs": b["runs"],
            "base_text": b["text"], "origin_y": b["originY"], "x_first": b["xFirst"], "x_rest": b["xRest"]})
        assert r.status_code == 200, r.text

    def test_el_parrafo_reconocido_se_abre_entero_para_editar(self, client, escaneo):
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        b = self._bloque(client, doc_id)
        assert b["mode"] == "block" and b["runs"] and b["originY"] is not None
        assert "contratista" in b["text"] and "garantías pactadas" in b["text"]
        assert "Times" in b["font"]

    def test_la_nota_con_su_ultima_linea_corta_tambien_es_un_solo_parrafo(self, client, escaneo):
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        b = self._bloque(client, doc_id, x=120, y=228)
        assert b["mode"] == "block" and "NOTA GENERAL" in b["text"] and "milímetros" in b["text"]

    def test_editar_borra_la_tinta_vieja_y_escribe_la_nueva(self, client, escaneo, tmp_path):
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        b = self._bloque(client, doc_id)
        self._editar(client, doc_id, b, b["text"].replace("150 psi", "200 psi y 14 bar").replace("dos horas", "cuatro horas"))
        doc = _guardar(client, doc_id, tmp_path)
        texto = " ".join(doc[0].get_text().split())
        assert "200 psi y 14 bar" in texto and "cuatro horas" in texto
        assert "150 psi" not in texto and "dos horas" not in texto
        # Lo que se VE (no solo el texto): se vuelve a leer la página con OCR.
        pix = doc[0].get_pixmap(dpi=300, colorspace=fitz.csRGB, alpha=False)
        visto = " ".join(_ocr.texto_de(Image.frombytes("RGB", (pix.width, pix.height), pix.samples)).split())
        assert "200 psi" in visto and "cuatro horas" in visto
        assert "150 psi" not in visto and "dos horas" not in visto, "la tinta vieja del escaneo sigue a la vista"
        # Lo de al lado no se tocó.
        assert "NOTA GENERAL" in visto and "12.450.000" in visto

    def test_el_texto_nuevo_tiene_el_cuerpo_y_la_fuente_del_escaneo(self, client, escaneo, tmp_path):
        doc_id = _abrir(client, escaneo)
        client.post(f"/pdf/make-searchable/{doc_id}?page=0")
        b = self._bloque(client, doc_id)
        self._editar(client, doc_id, b, b["text"].replace("150 psi", "200 psi"))
        s = next(s for s in _spans(_guardar(client, doc_id, tmp_path)) if "200 psi" in s["text"] or "psi" in s["text"])
        assert "Times" in s["font"] and s["size"] == pytest.approx(11, rel=0.07)


class TestSinMotor:
    def test_sin_tesseract_el_ocr_avisa_y_no_toca_nada(self, client, escaneo, monkeypatch):
        monkeypatch.setattr(_ocr, "disponible", lambda: False)
        doc_id = _abrir(client, escaneo)
        assert client.get("/pdf/ocr-available").json() == {"available": False, "languages": []}
        assert client.post(f"/pdf/make-searchable/{doc_id}?page=0").status_code == 503
        assert client.get(f"/pdf/ocr-pending/{doc_id}").json()["pages"] == [0]

    @hay_ocr
    def test_ocr_available_dice_que_idiomas_hay(self, client):
        d = client.get("/pdf/ocr-available").json()
        assert d["available"] is True and "spa" in d["languages"] and "eng" in d["languages"]

    def test_una_pagina_sin_letras_no_inventa_texto(self, client, tmp_path):
        if not _ocr.disponible():
            pytest.skip("no hay Tesseract en este equipo")
        d = fitz.open()
        d.new_page(width=300, height=300)
        ruta = str(tmp_path / "blanca.pdf")
        d.save(ruta)
        doc_id = _abrir(client, ruta)
        assert client.post(f"/pdf/make-searchable/{doc_id}?page=0").json()["words"] == 0
