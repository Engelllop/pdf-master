"""Editar texto escribía siempre con una base14 (Helvetica, Times o Courier): un texto
en Calibri salía en otra letra y una «→», un «€» o un «—» desaparecían. Ahora se busca
entre las fuentes instaladas la de la misma familia y estilo, y si no hay (o no es
Windows) todo cae a la base14 de antes."""
import fitz
import pytest

from app.services import _pdf_fuentes as pf

TIENE_FUENTES = bool(pf.indice_del_sistema())
necesita_fuentes = pytest.mark.skipif(not TIENE_FUENTES, reason="sin fuentes del sistema (no es Windows)")


def _instalada(familia, negrita=False, cursiva=False):
    return pf.indice_del_sistema().get((familia, negrita, cursiva))


class TestAnalizarNombre:
    @pytest.mark.parametrize("nombre,esperado", [
        ("ArialMT", ("arial", False, False)),
        ("Arial-BoldMT", ("arial", True, False)),
        ("ABCDEF+Arial-BoldItalicMT", ("arial", True, True)),
        ("TimesNewRomanPSMT", ("timesnewroman", False, False)),
        ("TimesNewRomanPS-BoldMT", ("timesnewroman", True, False)),
        ("Helvetica-Oblique", ("helvetica", False, True)),
        ("Calibri,Bold", ("calibri", True, False)),
        ("Arial Narrow Negrita Cursiva (TrueType)", ("arialnarrow", True, True)),
        ("Arial Black", ("arialblack", False, False)),
        ("Calibri Light", ("calibrilight", False, False)),
        (None, ("", False, False)),
    ])
    def test_normaliza_familia_y_estilo(self, nombre, esperado):
        assert pf.analizar_nombre(nombre) == esperado


@necesita_fuentes
class TestResolver:
    def test_encuentra_la_familia_y_el_estilo_del_documento(self):
        arial_bd = _instalada("arial", True, False)
        if not arial_bd:
            pytest.skip("sin Arial negrita")
        f = pf.resolver_fuente("Arial-BoldMT", "Hola", None, None, base14="hebo")
        assert f.del_sistema and f.ruta == arial_bd

    def test_negrita_explicita_pisa_la_del_original(self):
        if not _instalada("arial", True, False):
            pytest.skip("sin Arial negrita")
        f = pf.resolver_fuente("ArialMT", "Hola", True, None, base14="hebo")
        assert f.ruta == _instalada("arial", True, False)
        f = pf.resolver_fuente("Arial-BoldMT", "Hola", False, None, base14="helv")
        assert f.ruta == _instalada("arial", False, False)

    def test_helvetica_con_texto_latin1_sigue_en_base14(self):
        # Sin embeber nada y sin mover la caja de la línea: es lo que había.
        f = pf.resolver_fuente("Helvetica", "Hola ñandú", None, None, base14="helv")
        assert not f.del_sistema and f.nombre == "helv"

    def test_helvetica_con_simbolos_usa_arial_que_mide_igual(self):
        f = pf.resolver_fuente("Helvetica", "Total → 5 €", None, None, base14="helv")
        assert f.del_sistema and f.ruta == _instalada("arial")

    def test_familia_no_instalada_y_texto_latin1_queda_en_base14(self):
        f = pf.resolver_fuente("FuenteQueNoExiste-Book", "Año 2026 ñandú", None, None, base14="tiro")
        assert not f.del_sistema and f.nombre == "tiro"

    def test_familia_no_instalada_con_simbolos_usa_una_del_sistema_de_su_clase(self):
        serif = _instalada("timesnewroman")
        if not serif:
            pytest.skip("sin Times New Roman")
        f = pf.resolver_fuente("FuenteQueNoExiste", "Total → 5 €", None, None, base14="tiro")
        assert f.ruta == serif
        assert f.adaptar("Total → 5 €") == "Total → 5 €"

    def test_respaldo_cuando_la_familia_no_trae_el_glifo(self):
        # La flecha no está en todas las fuentes; si no está en la del documento se
        # escribe con una que sí la tenga en vez de perderla.
        f = pf.resolver_fuente("Arial-BoldMT", "→", None, None, base14="hebo")
        assert f.del_sistema
        assert f.adaptar("→") in ("→", "->")

    def test_el_respaldo_de_una_serif_es_otra_serif(self):
        """Georgia no tiene «→»: el texto cae a Times New Roman, no a Arial."""
        times = _instalada("timesnewroman")
        georgia = _instalada("georgia")
        if not (times and georgia):
            pytest.skip("sin Georgia / Times New Roman")
        f = pf.resolver_fuente("Georgia", "Total → 5", None, None, base14="tiro")
        assert f.ruta in (georgia, times)
        if f.ruta == times:  # Georgia sin flecha en esta instalación
            assert not pf._cubre(pf._font(georgia), "→")

    def test_adaptar_no_pierde_lo_que_tiene_glifo(self):
        f = pf.resolver_fuente("ArialMT", "—", None, None, base14="helv")
        assert f.adaptar("a — b") == "a — b"

    def test_adaptar_de_una_base14_translitera_como_antes(self):
        f = pf.FuenteEdicion("helv")
        assert f.adaptar("a → b") == "a -> b"
        assert f.adaptar("") == ""


def _pdf_con_fuente(tmp_path, ruta_fuente, texto="Cantidad total", size=14):
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    pg.insert_text((72, 100), texto, fontsize=size, fontname="Orig", fontfile=ruta_fuente)
    ruta = tmp_path / "doc.pdf"
    doc.save(str(ruta))
    doc.close()
    return str(ruta)


def _span(path, buscado):
    doc = fitz.open(path)
    try:
        for b in doc[0].get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for sp in l["spans"]:
                    if buscado in sp["text"]:
                        return sp
    finally:
        doc.close()
    return None


def _editar(client, ruta, tmp_path, texto, font, **extra):
    sp = _span(ruta, "Cantidad")
    assert sp is not None
    doc_id = client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]
    x0, y0, x1, y1 = sp["bbox"]
    r = client.post(f"/pdf/edit-text/{doc_id}", json={
        "page_num": 0, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": texto,
        "size": sp["size"], "font": font, **extra})
    assert r.status_code == 200, r.text
    salida = str(tmp_path / "salida.pdf")
    assert client.post(f"/pdf/save/{doc_id}?output_path={salida}").status_code == 200
    client.post(f"/pdf/close/{doc_id}")
    return salida


@necesita_fuentes
class TestEditarConLaFuenteDelDocumento:
    def test_el_texto_editado_conserva_la_familia(self, client, tmp_path):
        arial = _instalada("arial")
        if not arial:
            pytest.skip("sin Arial")
        ruta = _pdf_con_fuente(tmp_path, arial)
        salida = _editar(client, ruta, tmp_path, "Importe neto", "ArialMT")
        sp = _span(salida, "Importe")
        assert sp is not None
        assert "arial" in sp["font"].lower(), sp["font"]

    def test_los_simbolos_fuera_de_latin1_sobreviven(self, client, tmp_path):
        arial = _instalada("arial")
        if not arial:
            pytest.skip("sin Arial")
        ruta = _pdf_con_fuente(tmp_path, arial)
        salida = _editar(client, ruta, tmp_path, "Total → 5 € — ok", "ArialMT")
        doc = fitz.open(salida)
        try:
            texto = doc[0].get_text()
        finally:
            doc.close()
        assert "→" in texto and "€" in texto and "—" in texto

    def test_calibri_ya_no_sale_en_helvetica(self, client, tmp_path):
        calibri = _instalada("calibri")
        if not calibri:
            pytest.skip("sin Calibri")
        ruta = _pdf_con_fuente(tmp_path, calibri)
        salida = _editar(client, ruta, tmp_path, "Importe neto", "Calibri")
        sp = _span(salida, "Importe")
        assert sp is not None
        assert "calibri" in sp["font"].lower(), sp["font"]

    def test_negrita_usa_la_fuente_negrita_real(self, client, tmp_path):
        if not (_instalada("arial") and _instalada("arial", True, False)):
            pytest.skip("sin Arial / Arial negrita")
        ruta = _pdf_con_fuente(tmp_path, _instalada("arial"))
        salida = _editar(client, ruta, tmp_path, "Importe neto", "ArialMT", bold=True)
        sp = _span(salida, "Importe")
        assert sp is not None and "bold" in sp["font"].lower(), sp["font"]

    def test_en_caja_por_parrafo_tambien(self, client, tmp_path):
        arial = _instalada("arial")
        if not arial:
            pytest.skip("sin Arial")
        ruta = _pdf_con_fuente(tmp_path, arial)
        salida = _editar(client, ruta, tmp_path, "Importe neto\nIVA incluido €", "ArialMT", wrap=True)
        sp = _span(salida, "Importe")
        assert sp is not None and "arial" in sp["font"].lower(), sp["font"]
        doc = fitz.open(salida)
        try:
            assert "€" in doc[0].get_text()
        finally:
            doc.close()

    def test_solo_se_embeben_los_glifos_usados(self, client, tmp_path):
        """PyMuPDF embebe la fuente ENTERA: una palabra editada en Calibri dejaba un
        PDF de 1 KB en 800 KB. Con subconjunto son unos pocos KB."""
        import os
        if not _instalada("calibri"):
            pytest.skip("sin Calibri")
        doc = fitz.open()
        doc.new_page(width=595, height=842).insert_text((72, 100), "Cantidad total", fontsize=14)
        ruta = str(tmp_path / "base.pdf")
        doc.save(ruta)
        doc.close()
        salida = _editar(client, ruta, tmp_path, "Importe neto → 5 €", "Calibri")
        assert os.path.getsize(salida) < 60_000, os.path.getsize(salida)

    def test_dos_ediciones_con_distintos_glifos_no_se_pisan(self, client, tmp_path):
        """Mismo recurso de fuente por nombre en la página: el segundo subconjunto
        se perdía y las letras que solo traía ese salían vacías."""
        arial = _instalada("arial")
        if not arial:
            pytest.skip("sin Arial")
        doc = fitz.open()
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((72, 100), "Cantidad", fontsize=14, fontname="Orig", fontfile=arial)
        pg.insert_text((72, 200), "Precio", fontsize=14, fontname="Orig", fontfile=arial)
        ruta = str(tmp_path / "dos.pdf")
        doc.save(ruta)
        doc.close()
        doc_id = client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]
        for buscado, nuevo in (("Cantidad", "Zeta"), ("Precio", "Quijote")):
            sp = _span(ruta, buscado)
            x0, y0, x1, y1 = sp["bbox"]
            r = client.post(f"/pdf/edit-text/{doc_id}", json={
                "page_num": 0, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": nuevo,
                "size": sp["size"], "font": "ArialMT"})
            assert r.status_code == 200, r.text
        salida = str(tmp_path / "dos-salida.pdf")
        assert client.post(f"/pdf/save/{doc_id}?output_path={salida}").status_code == 200
        client.post(f"/pdf/close/{doc_id}")
        d = fitz.open(salida)
        try:
            texto = d[0].get_text()
        finally:
            d.close()
        assert "Zeta" in texto and "Quijote" in texto

    def test_sin_fonttools_se_embebe_la_fuente_completa_y_el_texto_sale(self, client, tmp_path, monkeypatch):
        arial = _instalada("arial")
        if not arial:
            pytest.skip("sin Arial")
        monkeypatch.setattr(pf, "_subconjunto", lambda ruta, simbolos: None)
        ruta = _pdf_con_fuente(tmp_path, arial)
        salida = _editar(client, ruta, tmp_path, "Importe neto → 5 €", "ArialMT")
        d = fitz.open(salida)
        try:
            texto = d[0].get_text()
        finally:
            d.close()
        assert "Importe" in texto and "→" in texto


class TestListadoDeFuentes:
    """El selector del editor ofrecía tres fuentes: ahora lista las instaladas."""

    @necesita_fuentes
    def test_lista_las_familias_instaladas_ordenadas_y_sin_duplicados(self, client):
        r = client.get("/pdf/fonts")
        assert r.status_code == 200
        familias = r.json()["families"]
        assert familias == sorted(set(familias), key=str.lower)
        assert len(familias) == len({f.lower() for f in familias})
        assert "Arial" in familias

    @necesita_fuentes
    def test_sin_estilos_en_el_nombre_ni_fuentes_de_simbolos(self, client):
        familias = client.get("/pdf/fonts").json()["families"]
        assert not any(f.lower().endswith((" bold", " italic", " negrita", " cursiva")) for f in familias)
        assert not any("wingdings" in f.lower() or "webdings" in f.lower() for f in familias)

    def test_sin_fuentes_del_sistema_devuelve_lista_vacia(self, client, monkeypatch):
        monkeypatch.setattr(pf, "_indice", {})
        assert client.get("/pdf/fonts").json() == {"families": []}

    @necesita_fuentes
    def test_cada_familia_listada_se_puede_resolver_y_escribir(self):
        """Lo que el selector ofrece, el motor lo encuentra: si no, elegirla no haría nada."""
        for nombre in pf.familias_instaladas():
            f = pf.resolver_fuente(nombre, "Total → 5 €", None, None, base14="helv")
            assert f.ruta or f.nombre == "helv", nombre


class TestSinFuentesDelSistema:
    def test_sin_fuentes_instaladas_cae_a_la_base14(self, client, tmp_path, monkeypatch):
        """El piso: si no hay fuentes (o no es Windows) la edición funciona como antes."""
        monkeypatch.setattr(pf, "_indice", {})
        doc = fitz.open()
        doc.new_page(width=595, height=842).insert_text((72, 100), "Cantidad total", fontsize=14)
        ruta = str(tmp_path / "base.pdf")
        doc.save(ruta)
        doc.close()
        salida = _editar(client, ruta, tmp_path, "Importe neto", "Helvetica")
        sp = _span(salida, "Importe")
        assert sp is not None
        assert "helvetica" in sp["font"].lower(), sp["font"]
