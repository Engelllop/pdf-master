"""Casillas y botones de opción. El valor de estos campos no es un texto: es el nombre
del estado de apariencia del widget encendido, y cada widget declara el suyo («Yes»,
«1», «Choice2», «Sí»…). El motor escribía por NOMBRE de campo sobre el primer widget y
el visor mandaba «Yes» o la primera opción: elegir cualquier opción de un grupo
encendía la primera, la elegida no se veía tildada y una casilla con estado «1» no se
podía destildar. Las opciones creadas por PDF Master nacían todas con estado «Yes»."""
import fitz
import pytest


def _abrir(client, path):
    r = client.post("/pdf/open", json={"file_path": str(path)})
    assert r.status_code == 200, r.text
    return r.json()["doc_id"]


def _campos(client, doc_id, page=0):
    return client.get(f"/pdf/widgets/{doc_id}/{page}").json()


def _grupo_acrobat(path, elegida="Choice2"):
    """Grupo de opciones como lo arma Acrobat: un campo padre con /V y dos hijos sin
    /T, estados activos «Choice1» y «Choice2»."""
    doc = fitz.open()
    pg = doc.new_page()
    par, k1, k2, on1, on2, off = (doc.get_new_xref() for _ in range(6))
    for x in (on1, on2):
        doc.update_object(x, "<</Type/XObject/Subtype/Form/BBox[0 0 16 16]/Length 0>>")
        doc.update_stream(x, b"0 g 4 4 8 8 re f")
    doc.update_object(off, "<</Type/XObject/Subtype/Form/BBox[0 0 16 16]/Length 0>>")
    doc.update_stream(off, b"")
    doc.update_object(par, f"<</FT/Btn/Ff 49152/T(sexo)/V/{elegida}/Kids[{k1} 0 R {k2} 0 R]>>")
    as1 = "Choice1" if elegida == "Choice1" else "Off"
    as2 = "Choice2" if elegida == "Choice2" else "Off"
    doc.update_object(k1, f"<</Type/Annot/Subtype/Widget/Parent {par} 0 R/Rect[100 700 116 716]"
                          f"/P {pg.xref} 0 R/AS/{as1}/AP<</N<</Choice1 {on1} 0 R/Off {off} 0 R>>>>/F 4>>")
    doc.update_object(k2, f"<</Type/Annot/Subtype/Widget/Parent {par} 0 R/Rect[100 670 116 686]"
                          f"/P {pg.xref} 0 R/AS/{as2}/AP<</N<</Choice2 {on2} 0 R/Off {off} 0 R>>>>/F 4>>")
    doc.xref_set_key(pg.xref, "Annots", f"[{k1} 0 R {k2} 0 R]")
    doc.xref_set_key(doc.pdf_catalog(), "AcroForm", f"<</Fields[{par} 0 R]>>")
    doc.save(str(path))
    doc.close()
    return str(path), par, k1, k2


def _casilla_en_uno(path):
    """Casilla con estado activo «1» en vez de «Yes», como las de Word/LibreOffice."""
    doc = fitz.open()
    pg = doc.new_page()
    w = fitz.Widget()
    w.rect = fitz.Rect(100, 100, 116, 116)
    w.field_name = "acepto"
    w.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
    w.field_value = False
    pg.add_widget(w)
    xref = next(pg.widgets()).xref
    doc.update_object(xref, doc.xref_object(xref).replace("/Yes", "/1"))
    doc.save(str(path))
    doc.close()
    return str(path)


def _estados_en_disco(path):
    with fitz.open(path) as d:
        return [d.xref_get_key(w.xref, "AS")[1] for w in d[0].widgets()]


class TestGrupoDeAcrobat:
    def test_el_motor_da_por_widget_su_estado_y_su_estado_activo(self, client, tmp_path):
        path, *_ = _grupo_acrobat(tmp_path / "g.pdf")
        doc_id = _abrir(client, path)
        try:
            campos = _campos(client, doc_id)
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert [(c["on_state"], c["value"]) for c in campos] == [("Choice1", "Off"), ("Choice2", "Choice2")]

    def test_elegir_la_primera_enciende_la_primera_y_apaga_la_segunda(self, client, tmp_path):
        path, par, k1, k2 = _grupo_acrobat(tmp_path / "g.pdf")
        doc_id = _abrir(client, path)
        out = str(tmp_path / "g-out.pdf")
        try:
            primera = _campos(client, doc_id)[0]
            r = client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "sexo", "value": primera["on_state"], "xref": primera["xref"]})
            assert r.status_code == 200, r.text
            assert r.json()["previous"] == "Off"
            assert [c["value"] for c in _campos(client, doc_id)] == ["Choice1", "Off"]
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert _estados_en_disco(out) == ["/Choice1", "/Off"]
        with fitz.open(out) as d:
            # /V del padre como NOMBRE (PyMuPDF lo escribía como cadena «(Choice1)»).
            assert d.xref_get_key(par, "V") == ("name", "/Choice1")

    def test_elegir_la_segunda_no_enciende_la_primera(self, client, tmp_path):
        path, *_ = _grupo_acrobat(tmp_path / "g.pdf", elegida="Choice1")
        doc_id = _abrir(client, path)
        try:
            segunda = _campos(client, doc_id)[1]
            assert client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "sexo", "value": segunda["on_state"], "xref": segunda["xref"],
            }).status_code == 200
            assert [c["value"] for c in _campos(client, doc_id)] == ["Off", "Choice2"]
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_sin_xref_se_elige_por_estado_activo(self, client, tmp_path):
        """Rehacer manda solo nombre y valor: el valor ya identifica la opción."""
        path, *_ = _grupo_acrobat(tmp_path / "g.pdf")
        doc_id = _abrir(client, path)
        try:
            assert client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "sexo", "value": "Choice1"}).status_code == 200
            assert [c["value"] for c in _campos(client, doc_id)] == ["Choice1", "Off"]
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_deshacer_no_renombra_el_grupo(self, client, tmp_path):
        """Con padre, el stash es del documento: `replace_page` duplicaba el padre y
        MuPDF renombraba el grupo a «sexo [N]»."""
        path, *_ = _grupo_acrobat(tmp_path / "g.pdf")
        doc_id = _abrir(client, path)
        try:
            primera = _campos(client, doc_id)[0]
            data = client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "sexo", "value": "Choice1", "xref": primera["xref"]}).json()
            assert data["stash_scope"] == "document"
            assert client.post(f"/pdf/restore-document/{doc_id}",
                               json={"stash_id": data["stash_id"]}).status_code == 200
            campos = _campos(client, doc_id)
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert [c["field_name"] for c in campos] == ["sexo", "sexo"]
        assert [c["value"] for c in campos] == ["Off", "Choice2"]

    def test_mover_una_opcion_no_la_enciende_ni_le_cambia_el_estado(self, client, tmp_path):
        path, *_ = _grupo_acrobat(tmp_path / "g.pdf")
        doc_id = _abrir(client, path)
        try:
            primera = _campos(client, doc_id)[0]
            assert client.post(f"/pdf/widgets/{doc_id}/0/transform", json={
                "xref": primera["xref"], "x": 200, "y": 300, "width": 20, "height": 20,
            }).status_code == 200
            movida = _campos(client, doc_id)[0]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert (movida["on_state"], movida["value"]) == ("Choice1", "Off")
        r = movida["rect"]
        assert (round(r["x"]), round(r["y"]), round(r["width"]), round(r["height"])) == (200, 300, 20, 20)


class TestCasillaConEstadoPropio:
    def test_tildar_y_destildar_una_casilla_en_1(self, client, tmp_path):
        doc_id = _abrir(client, _casilla_en_uno(tmp_path / "c.pdf"))
        try:
            c = _campos(client, doc_id)[0]
            assert (c["on_state"], c["value"]) == ("1", "Off")
            client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "acepto", "value": c["on_state"], "xref": c["xref"]})
            assert _campos(client, doc_id)[0]["value"] == "1"
            client.post(f"/pdf/widgets/{doc_id}/0", json={
                "field_name": "acepto", "value": "Off", "xref": c["xref"]})
            assert _campos(client, doc_id)[0]["value"] == "Off"
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_un_cliente_viejo_que_manda_yes_la_enciende_igual(self, client, tmp_path):
        doc_id = _abrir(client, _casilla_en_uno(tmp_path / "c.pdf"))
        try:
            client.post(f"/pdf/widgets/{doc_id}/0", json={"field_name": "acepto", "value": "Yes"})
            assert _campos(client, doc_id)[0]["value"] == "1"
        finally:
            client.post(f"/pdf/close/{doc_id}")


class TestOpcionesCreadasPorPdfMaster:
    def _crear(self, client, doc_id, y, valor, nombre="grupo"):
        r = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "radio", "field_name": nombre,
            "x": 100, "y": y, "width": 16, "height": 16, "radio_value": valor})
        assert r.status_code == 200, r.text

    def test_cada_opcion_tiene_como_estado_activo_su_valor(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        self._crear(client, doc_id, 100, "Sí")
        self._crear(client, doc_id, 130, "No")
        self._crear(client, doc_id, 160, "No")
        self._crear(client, doc_id, 190, "")
        campos = [c for c in _campos(client, doc_id) if c["field_name"] == "grupo"]
        # «Sí» va codificado como lo guarda Acrobat (el valor exportado sigue siendo
        # «Sí»); un valor repetido se desambigua y uno vacío recibe un nombre propio.
        assert [c["on_state"] for c in campos] == ["S#C3#AD", "No", "No_2", "Opcion4"]
        assert all(c["value"] == "Off" for c in campos)
        assert all(c["field_type"] == "RadioButton" for c in campos)

    def test_el_valor_no_va_al_caption(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        self._crear(client, doc_id, 100, "Si")
        xref = _campos(client, doc_id)[0]["xref"]
        from app.services.pdf_service import pdf_service
        doc = pdf_service._acquire(doc_id)
        assert doc.xref_get_key(xref, "MK/CA")[0] == "null"

    def test_elegir_una_opcion_apaga_las_otras(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        self._crear(client, doc_id, 100, "Si")
        self._crear(client, doc_id, 130, "No")
        si, no = _campos(client, doc_id)
        client.post(f"/pdf/widgets/{doc_id}/0", json={
            "field_name": "grupo", "value": no["on_state"], "xref": no["xref"]})
        assert [c["value"] for c in _campos(client, doc_id)] == ["Off", "No"]
        client.post(f"/pdf/widgets/{doc_id}/0", json={
            "field_name": "grupo", "value": si["on_state"], "xref": si["xref"]})
        assert [c["value"] for c in _campos(client, doc_id)] == ["Si", "Off"]

    def test_moverla_conserva_el_estado_activo(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        self._crear(client, doc_id, 100, "Norte")
        c = _campos(client, doc_id)[0]
        assert client.post(f"/pdf/widgets/{doc_id}/0/transform", json={
            "xref": c["xref"], "x": 40, "y": 50}).status_code == 200
        movida = _campos(client, doc_id)[0]
        assert (movida["on_state"], movida["value"]) == ("Norte", "Off")
        assert (round(movida["rect"]["x"]), round(movida["rect"]["y"])) == (40, 50)

    @pytest.mark.parametrize("rot", [90, 180, 270])
    def test_moverla_en_pagina_girada_cae_donde_se_pide(self, client, tmp_path, rot):
        path = str(tmp_path / f"r{rot}.pdf")
        doc = fitz.open()
        doc.new_page(width=600, height=400)
        doc.xref_set_key(doc[0].xref, "MediaBox", "[50 60 650 460]")
        doc.xref_set_key(doc[0].xref, "CropBox", "[80 70 620 440]")
        doc.xref_set_key(doc[0].xref, "Rotate", str(rot))
        doc.save(path)
        doc.close()
        doc_id = _abrir(client, path)
        try:
            self._crear(client, doc_id, 100, "A")
            c = _campos(client, doc_id)[0]
            assert client.post(f"/pdf/widgets/{doc_id}/0/transform", json={
                "xref": c["xref"], "x": 70, "y": 40, "width": 24, "height": 18}).status_code == 200
            r = _campos(client, doc_id)[0]["rect"]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert [round(v, 2) for v in (r["x"], r["y"], r["width"], r["height"])] == [70, 40, 24, 18]


class TestBanderasYLargo:
    def test_el_motor_manda_banderas_y_largo_maximo(self, client, tmp_path):
        path = str(tmp_path / "t.pdf")
        doc = fitz.open()
        pg = doc.new_page()
        w = fitz.Widget()
        w.rect = fitz.Rect(50, 50, 300, 120)
        w.field_name = "notas"
        w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        w.field_flags = 4096 | 1
        w.text_maxlen = 12
        pg.add_widget(w)
        doc.save(path)
        doc.close()
        doc_id = _abrir(client, path)
        try:
            c = _campos(client, doc_id)[0]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert c["field_flags"] & 4096 and c["field_flags"] & 1
        assert c["text_maxlen"] == 12
        assert c["on_state"] is None
