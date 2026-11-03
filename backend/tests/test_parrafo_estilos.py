"""Editar un párrafo con estilos mezclados: antes caía a un tramo suelto (y una palabra
más larga se encimaba con la siguiente) o, si solo cambiaba el color, aplanaba todo al
estilo del tramo más largo. Ahora el párrafo se edita entero, cada tramo conserva el suyo,
y la sangría y el justificado se detectan y se respetan."""
import fitz
import pytest

from app.services._pdf_parrafo import componer, estilos_por_caracter, tokenizar

ROJO = (1, 0, 0)
NEGRO = (0, 0, 0)


# ── lógica pura ──────────────────────────────────────────────────────────────

# «Pago: » normal, «ABCDE» (tramo 1) y « de le» normal.
BASE = "Pago: ABCDE de le"
RUNS = [{"start": 0, "end": 6, "font": "A"}, {"start": 6, "end": 11, "font": "B"},
        {"start": 11, "end": 17, "font": "A"}]


class TestEstilosPorCaracter:
    def test_sin_cambios_cada_caracter_conserva_su_tramo(self):
        assert estilos_por_caracter(BASE, RUNS, BASE) == [0] * 6 + [1] * 5 + [2] * 6

    def test_lo_que_se_escribe_toma_el_estilo_del_caracter_anterior(self):
        # Al final de una palabra en tramo 1: sigue en el tramo 1 (como Word).
        nuevo = BASE[:11] + "XY" + BASE[11:]
        est = estilos_por_caracter(BASE, RUNS, nuevo)
        assert est[11:13] == [1, 1] and est[13:] == [2] * 6

    def test_un_reemplazo_conserva_el_estilo_de_lo_reemplazado(self):
        nuevo = BASE[:6] + "QRSTUVWX" + BASE[11:]  # reemplaza las 5 del tramo 1 por 8 (sin letras en común)
        est = estilos_por_caracter(BASE, RUNS, nuevo)
        assert est[6:14] == [1] * 8

    def test_borrar_no_deja_huecos(self):
        est = estilos_por_caracter(BASE, RUNS, BASE[:6] + BASE[11:])
        assert est == [0] * 6 + [2] * 6

    def test_escribir_al_principio_toma_el_primer_tramo(self):
        assert estilos_por_caracter(BASE, RUNS, "ZZ" + BASE)[:2] == [0, 0]

    def test_tramos_que_no_describen_el_texto_no_sirven(self):
        assert estilos_por_caracter(BASE, [{"start": 0, "end": 99}], BASE) is None
        assert estilos_por_caracter(BASE, [], BASE) is None
        assert estilos_por_caracter("", RUNS, "algo") is None


class TestComponer:
    @staticmethod
    def _medir(texto, estilo):
        return len(texto) * 10.0  # 10 por carácter, el estilo no cambia el ancho

    def _lineas(self, texto, ancho_primera, ancho_resto=None):
        toks = tokenizar(texto, [0] * len(texto))
        return componer(toks, self._medir, ancho_primera, ancho_primera if ancho_resto is None else ancho_resto)

    @staticmethod
    def _texto(linea):
        return "".join(t for t, _ in linea.piezas)

    def test_corta_en_el_espacio_cuando_no_cabe(self):
        ls = self._lineas("uno dos tres cuatro", 80)
        assert [self._texto(l) for l in ls] == ["uno dos", "tres", "cuatro"]
        assert [l.dura for l in ls] == [False, False, True]

    def test_el_salto_del_autor_es_duro_y_no_se_justifica(self):
        ls = self._lineas("uno\ndos", 500)
        assert [self._texto(l) for l in ls] == ["uno", "dos"] and ls[0].dura

    def test_los_espacios_del_final_no_cuentan(self):
        assert self._lineas("uno   ", 500)[0].ancho == 30.0

    def test_la_primera_linea_puede_tener_otro_ancho_la_sangria(self):
        ls = self._lineas("aaa bbb ccc ddd", 60, 100)
        assert self._texto(ls[0]) == "aaa" and self._texto(ls[1]) == "bbb ccc"

    def test_una_palabra_mas_larga_que_el_renglon_desborda_entera(self):
        assert [self._texto(l) for l in self._lineas("abcdefghij kk", 50)] == ["abcdefghij", "kk"]

    def test_espacios_iniciales_del_autor_se_conservan_pero_los_del_ajuste_no(self):
        ls = self._lineas("  uno dos tres", 60)
        assert self._texto(ls[0]).startswith("  ")
        assert not self._texto(ls[1]).startswith(" ")

    def test_texto_vacio_es_un_renglon_vacio(self):
        assert [self._texto(l) for l in self._lineas("", 100)] == [""]


# ── de punta a punta, con el motor ───────────────────────────────────────────

def _escribir(page, y, tramos, x=72, size=10):
    """Una línea con tramos (texto, fuente, color) uno detrás de otro."""
    for texto, fuente, color in tramos:
        page.insert_text((x, y), texto, fontsize=size, fontname=fuente, color=color)
        x += fitz.get_text_length(texto, fontname=fuente, fontsize=size)


@pytest.fixture
def pdf_mixto(tmp_path):
    """Dos renglones con «PVC SDR-26» en negrita y «150 psi» en rojo."""
    ruta = str(tmp_path / "mixto.pdf")
    doc = fitz.open()
    pg = doc.new_page(width=612, height=792)
    _escribir(pg, 100, [("Todas las tuberias de agua potable seran de ", "helv", NEGRO),
                        ("PVC SDR-26", "hebo", NEGRO), (" salvo indicacion", "helv", NEGRO)])
    _escribir(pg, 115, [("contraria. Las pruebas se haran a ", "helv", NEGRO),
                        ("150 psi", "helv", ROJO), (" durante dos horas.", "helv", NEGRO)])
    pg.insert_text((72, 160), "Linea de abajo", fontsize=10)
    doc.save(ruta)
    doc.close()
    return ruta


def _abrir(client, ruta):
    return client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]


def _bloque(client, doc_id, x=120, y=97):
    r = client.get(f"/pdf/text-block/{doc_id}/0", params={"x": x, "y": y})
    assert r.status_code == 200, r.text
    return r.json()


def _editar(client, doc_id, b, nuevo, tmp_path, nombre="salida.pdf", **extra):
    cuerpo = {
        "page_num": 0, "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"], "text": nuevo,
        "size": b["size"], "color": b["color"], "font": b["font"], "wrap": True,
        "bold": b["bold"], "italic": b["italic"], "align": b["align"], "line_height": b["lineHeight"],
        "runs": b["runs"], "base_text": b["text"], "origin_y": b["originY"],
        "x_first": b["xFirst"], "x_rest": b["xRest"], **extra,
    }
    r = client.post(f"/pdf/edit-text/{doc_id}", json=cuerpo)
    assert r.status_code == 200, r.text
    salida = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}", params={"output_path": salida}).status_code == 200
    return r.json(), fitz.open(salida)


def _spans(doc):
    return [s for b in doc[0].get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]


def _span_con(doc, texto):
    return next((s for s in _spans(doc) if texto in s["text"]), None)


class TestLeerParrafoMixto:
    def test_un_parrafo_con_negrita_y_rojo_ya_no_cae_a_un_tramo(self, client, pdf_mixto):
        b = _bloque(client, _abrir(client, pdf_mixto))
        assert b["mode"] == "block"
        assert "PVC SDR-26" in b["text"] and "150 psi" in b["text"]
        assert "Linea de abajo" not in b["text"]
        assert b["runs"] and len({(r["font"], r["color"]) for r in b["runs"]}) >= 3

    def test_los_tramos_describen_el_texto_entero(self, client, pdf_mixto):
        b = _bloque(client, _abrir(client, pdf_mixto))
        runs = b["runs"]
        assert runs[0]["start"] == 0 and runs[-1]["end"] == len(b["text"])
        assert all(a["end"] == c["start"] for a, c in zip(runs, runs[1:])), "sin huecos ni solapes"
        negrita = next(r for r in runs if r["bold"])
        assert b["text"][negrita["start"]:negrita["end"]].strip() == "PVC SDR-26"
        roja = next(r for r in runs if r["color"] == "#ff0000")
        assert b["text"][roja["start"]:roja["end"]].strip() == "150 psi"

    def test_trae_donde_empieza_cada_renglon_y_la_linea_base(self, client, pdf_mixto):
        b = _bloque(client, _abrir(client, pdf_mixto))
        assert b["originY"] == pytest.approx(100, abs=0.5)
        assert b["xFirst"] == pytest.approx(72, abs=0.5) and b["xRest"] == pytest.approx(72, abs=0.5)

    def test_solo_el_color_ya_no_aplana(self, client, tmp_path):
        """Una palabra roja en un párrafo del mismo tipo de letra: se devolvía como
        párrafo de un solo estilo y la palabra roja salía negra al reescribir."""
        ruta = str(tmp_path / "color.pdf")
        doc = fitz.open()
        pg = doc.new_page(width=612, height=792)
        _escribir(pg, 100, [("El valor ", "helv", NEGRO), ("critico", "helv", ROJO), (" es este", "helv", NEGRO)])
        doc.save(ruta)
        doc.close()
        b = _bloque(client, _abrir(client, ruta), x=80, y=97)
        assert b["runs"] and any(r["color"] == "#ff0000" for r in b["runs"])

    def test_un_parrafo_de_un_solo_estilo_trae_un_unico_tramo(self, client, tmp_path):
        """Con un solo estilo también viaja con posiciones y un tramo: se reescribe
        renglón a renglón, en su línea base y hasta su borde."""
        ruta = str(tmp_path / "uno.pdf")
        doc = fitz.open()
        doc.new_page(width=612, height=792).insert_text((72, 100), "Todo igual", fontsize=10)
        doc.save(ruta)
        doc.close()
        b = _bloque(client, _abrir(client, ruta), x=80, y=97)
        assert len(b["runs"]) == 1 and b["runs"][0]["end"] == len(b["text"])
        assert b["originY"] == pytest.approx(100, abs=0.5)


class TestEditarConEstilos:
    def test_cambiar_una_palabra_conserva_negrita_y_rojo_de_las_demas(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, b["text"].replace("PVC SDR-26", "PEAD SDR-17"), tmp_path)
        nueva = _span_con(doc, "PEAD")
        assert nueva is not None and "bold" in nueva["font"].lower(), "la palabra editada sigue en negrita"
        psi = _span_con(doc, "150 psi")
        assert psi is not None and psi["color"] == 0xFF0000, "lo rojo sigue rojo"
        normal = _span_con(doc, "Todas las tuberias")
        assert normal is not None and "bold" not in normal["font"].lower()
        assert "PVC" not in doc[0].get_text()

    def test_una_palabra_mas_larga_se_reacomoda_sin_encimarse(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        largo = "PVC hidraulico de presion SDR-26 certificado"
        _, doc = _editar(client, doc_id, b, b["text"].replace("PVC SDR-26", largo), tmp_path)
        lineas = [fitz.Rect(l["bbox"]) for blq in doc[0].get_text("dict")["blocks"] for l in blq.get("lines", [])
                  if fitz.Rect(l["bbox"]).y1 < 150]
        for i, a in enumerate(lineas):
            for c in lineas[i + 1:]:
                inter = a & c
                assert inter.is_empty or inter.height < 1.5, f"{a} se encima con {c}"
        texto = " ".join(doc[0].get_text().split())  # el ajuste puede cortar entre «150» y «psi»
        assert "hidraulico" in texto and "certificado" in texto and "150 psi" in texto
        assert max(r.x1 for r in lineas) <= b["x1"] + 10, "respeta el ancho del párrafo"

    def test_la_primera_linea_queda_en_la_misma_linea_base(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, b["text"].replace("tuberias", "tuberias"), tmp_path)
        assert _span_con(doc, "Todas")["origin"][1] == pytest.approx(100, abs=0.5)

    def test_no_pisa_lo_de_abajo_ni_avisa_si_entra(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        res, doc = _editar(client, doc_id, b, b["text"], tmp_path)
        assert res["overflow"] is False
        assert "Linea de abajo" in doc[0].get_text()

    def test_avisa_si_crecio(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        res, _ = _editar(client, doc_id, b, b["text"] + "\nuna\nlinea\nmas\ny\notra\nmas", tmp_path)
        assert res["overflow"] is True

    def test_los_simbolos_de_la_fuente_del_sistema_tambien_en_runs(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, b["text"].replace("150 psi", "150 psi → 10 bar"), tmp_path)
        assert "→" in doc[0].get_text()

    def test_una_flecha_en_un_tramo_no_cambia_la_fuente_de_los_demas(self, client, pdf_mixto, tmp_path):
        """La cobertura de glifos se decide por estilo: antes una «→» en el tramo rojo
        pasaba TODO el párrafo de Helvetica a Arial incrustada."""
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, b["text"].replace("150 psi", "150 psi → 10 bar"), tmp_path)
        assert "Helvetica" in _span_con(doc, "Todas las tuberias")["font"]
        assert "→" in doc[0].get_text()

    def test_los_espacios_se_escriben_y_el_texto_extraido_no_se_pega(self, client, pdf_mixto, tmp_path):
        """Sin espacios reales, buscar o copiar «psi → 10 bar» desde otro visor fallaba."""
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, b["text"].replace("150 psi", "150 psi → 10 bar"), tmp_path)
        assert "psi → 10 bar" in doc[0].get_text().replace("\n", " ")
        assert "Todas las tuberias de agua potable" in doc[0].get_text().replace("\n", " ")

    def test_con_tramos_que_no_describen_el_texto_escribe_con_un_solo_estilo(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, "Texto nuevo del parrafo", tmp_path,
                         runs=[{"start": 0, "end": 99999, "font": "x", "size": 10}])
        assert "Texto nuevo del parrafo" in doc[0].get_text()

    def test_sin_runs_sigue_igual_que_antes(self, client, pdf_mixto, tmp_path):
        doc_id = _abrir(client, pdf_mixto)
        b = _bloque(client, doc_id)
        _, doc = _editar(client, doc_id, b, "Sin tramos", tmp_path, runs=None, base_text=None)
        assert "Sin tramos" in doc[0].get_text() and "Todas las tuberias" not in doc[0].get_text()


class TestSangriaYJustificado:
    @pytest.fixture
    def pdf_con_sangria(self, tmp_path):
        ruta = str(tmp_path / "sangria.pdf")
        doc = fitz.open()
        pg = doc.new_page(width=612, height=792)
        _escribir(pg, 100, [("La obra se ejecutara conforme a los planos y a las", "helv", NEGRO)], x=92)
        _escribir(pg, 115, [("especificaciones tecnicas vigentes del proyecto y", "helv", NEGRO)], x=72)
        _escribir(pg, 130, [("las normas aplicables en la jurisdiccion.", "helv", NEGRO)], x=72)
        doc.save(ruta)
        doc.close()
        return ruta

    def test_detecta_la_sangria_de_primera_linea(self, client, pdf_con_sangria):
        b = _bloque(client, _abrir(client, pdf_con_sangria), x=100, y=97)
        assert b["xFirst"] - b["xRest"] == pytest.approx(20, abs=1)
        assert b["runs"], "con sangría el párrafo viaja con tramos para poder reescribirse"

    def test_reescribir_conserva_la_sangria(self, client, pdf_con_sangria, tmp_path):
        doc_id = _abrir(client, pdf_con_sangria)
        b = _bloque(client, doc_id, x=100, y=97)
        _, doc = _editar(client, doc_id, b, b["text"].replace("obra", "construccion"), tmp_path)
        primera = _span_con(doc, "La construccion")
        resto = _span_con(doc, "especificaciones")
        assert primera["origin"][0] == pytest.approx(92, abs=1)
        assert resto["origin"][0] == pytest.approx(72, abs=1)

    @pytest.fixture
    def pdf_justificado(self, tmp_path):
        ruta = str(tmp_path / "just.pdf")
        doc = fitz.open()
        pg = doc.new_page(width=612, height=792)
        pg.insert_textbox(fitz.Rect(72, 80, 400, 200),
                          "Todas las tuberias de agua potable seran de PVC SDR-26 salvo indicacion contraria "
                          "en los planos. Las pruebas hidrostaticas se haran a 150 psi durante dos horas sin "
                          "perdida alguna y con el visto bueno de la supervision.",
                          fontsize=10, fontname="helv", align=fitz.TEXT_ALIGN_JUSTIFY)
        doc.save(ruta)
        doc.close()
        return ruta

    def test_detecta_el_justificado(self, client, pdf_justificado):
        b = _bloque(client, _abrir(client, pdf_justificado), x=120, y=88)
        assert b["align"] == "justify"

    def test_un_parrafo_a_la_izquierda_no_se_toma_por_justificado(self, client, tmp_path):
        ruta = str(tmp_path / "izq.pdf")
        doc = fitz.open()
        pg = doc.new_page(width=612, height=792)
        pg.insert_textbox(fitz.Rect(72, 80, 400, 200),
                          "Todas las tuberias de agua potable seran de PVC SDR-26 salvo indicacion contraria "
                          "en los planos. Las pruebas hidrostaticas se haran a 150 psi durante dos horas sin "
                          "perdida alguna y con el visto bueno de la supervision.",
                          fontsize=10, fontname="helv")
        doc.save(ruta)
        doc.close()
        assert _bloque(client, _abrir(client, ruta), x=120, y=88)["align"] == "left"

    def test_reescribir_justificado_alinea_el_borde_derecho(self, client, pdf_justificado, tmp_path):
        doc_id = _abrir(client, pdf_justificado)
        b = _bloque(client, doc_id, x=120, y=88)
        # Con un tramo en negrita para que vaya por el camino de tramos (que justifica a mano).
        runs = b["runs"] or [{"start": 0, "end": len(b["text"]), "font": b["font"], "size": b["size"],
                              "color": b["color"], "bold": False, "italic": False}]
        _, doc = _editar(client, doc_id, b, b["text"].replace("tuberias", "tuberias metalicas"), tmp_path,
                         runs=runs, origin_y=b["originY"] or 90, x_first=b["xFirst"] or 72, x_rest=b["xRest"] or 72)
        renglones = sorted((fitz.Rect(l["bbox"]).y0, round(fitz.Rect(l["bbox"]).x1, 0))
                           for blq in doc[0].get_text("dict")["blocks"] for l in blq.get("lines", []))
        assert len(renglones) >= 3
        derechos = [x1 for _, x1 in renglones[:-1]]  # el último renglón no se justifica
        assert max(derechos) - min(derechos) <= 3, derechos


class TestPaginaGirada:
    def test_en_pagina_girada_los_tramos_se_ignoran_y_el_texto_sale(self, client, pdf_mixto, tmp_path):
        doc = fitz.open(pdf_mixto)
        doc[0].set_rotation(90)
        girado = str(tmp_path / "girado.pdf")
        doc.save(girado)
        doc.close()
        doc_id = _abrir(client, girado)
        with fitz.open(girado) as d:
            p = fitz.Point(120, 97) * d[0].rotation_matrix
        r = client.get(f"/pdf/text-block/{doc_id}/0", params={"x": p.x, "y": p.y})
        assert r.status_code == 200
        b = r.json()
        assert b["runs"] is None, "en una página girada no se ofrecen tramos"
        r2 = client.post(f"/pdf/edit-text/{doc_id}", json={
            "page_num": 0, "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"], "text": "Girado ok",
            "size": b["size"], "color": b["color"], "font": b["font"], "wrap": True})
        assert r2.status_code == 200, r2.text
