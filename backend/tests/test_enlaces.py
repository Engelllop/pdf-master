"""Enlaces del documento: antes no había forma de crearlos ni de corregirlos. Se leen, se
crean (a una dirección web o a una página), se editan y se quitan, y todo se puede deshacer."""
import fitz
import pytest

from app.services._pdf_links import normalizar_uri


class TestNormalizarUri:
    @pytest.mark.parametrize("texto,esperado", [
        ("https://ejemplo.com/ruta?x=1", "https://ejemplo.com/ruta?x=1"),
        ("http://ejemplo.com", "http://ejemplo.com"),
        ("HTTPS://Ejemplo.com", "HTTPS://Ejemplo.com"),
        ("www.ejemplo.com/x", "https://www.ejemplo.com/x"),
        ("ejemplo.com", "https://ejemplo.com"),
        ("ana@correo.com", "mailto:ana@correo.com"),
        ("mailto:ana@correo.com", "mailto:ana@correo.com"),
        ("tel:+5491155550000", "tel:+5491155550000"),
        ("ftp://archivos.ejemplo.com/a.zip", "ftp://archivos.ejemplo.com/a.zip"),
        ("  https://ejemplo.com  ", "https://ejemplo.com"),
    ])
    def test_acepta_y_completa(self, texto, esperado):
        assert normalizar_uri(texto) == esperado

    @pytest.mark.parametrize("texto", [
        "", "   ", None, "javascript:alert(1)", "JaVaScRiPt:alert(1)", "file:///C:/Windows/System32/calc.exe",
        "data:text/html;base64,AAAA", "C:\\Users\\x\\archivo.pdf", "launch:cmd", "vbscript:x",
        "https://", "http:", "dos palabras", "https://a.com/con espacio", "https://a.com/\x00", "palabra", "a@b",
    ])
    def test_rechaza(self, texto):
        """Nada que abra archivos locales, ejecute algo o no sea una dirección."""
        assert normalizar_uri(texto) is None


@pytest.fixture
def pdf_tres_paginas(tmp_path):
    ruta = str(tmp_path / "doc.pdf")
    d = fitz.open()
    for i in range(3):
        d.new_page(width=300, height=400).insert_text((40, 60), f"Pagina {i + 1}", fontsize=14)
    d.save(ruta)
    d.close()
    return ruta


def _abrir(client, ruta):
    return client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]


def _zona(x0=40, y0=40, x1=140, y1=70):
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def _crear(client, doc_id, pagina=0, zona=None, **destino):
    return client.post(f"/pdf/links/{doc_id}", json={"page_num": pagina, "zona": zona or _zona(), **destino})


def _listar(client, doc_id, pagina=0):
    r = client.get(f"/pdf/links/{doc_id}/{pagina}")
    assert r.status_code == 200, r.text
    return r.json()["links"]


def _guardar(client, doc_id, tmp_path, nombre="salida.pdf"):
    salida = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}", params={"output_path": salida}).status_code == 200
    return salida


class TestLeer:
    def test_un_documento_sin_enlaces_devuelve_lista_vacia(self, client, pdf_tres_paginas):
        assert _listar(client, _abrir(client, pdf_tres_paginas)) == []

    def test_pagina_inexistente_es_404(self, client, pdf_tres_paginas):
        assert client.get(f"/pdf/links/{_abrir(client, pdf_tres_paginas)}/9").status_code == 404

    def test_lee_los_enlaces_que_ya_traia_el_pdf(self, client, tmp_path):
        ruta = str(tmp_path / "con-enlaces.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400)
        d.new_page(width=300, height=400)
        p = d[0]  # después de crear las dos: una referencia anterior queda inválida
        p.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(10, 10, 110, 40), "uri": "https://a.com"})
        p.insert_link({"kind": fitz.LINK_GOTO, "from": fitz.Rect(10, 60, 110, 90), "page": 1, "to": fitz.Point(0, 0)})
        d.save(ruta)
        d.close()
        ls = _listar(client, _abrir(client, ruta))
        assert [(l["kind"], l["uri"], l["page"]) for l in ls] == [("uri", "https://a.com", None), ("goto", None, 1)]
        assert ls[0]["x0"] == pytest.approx(10) and ls[0]["y1"] == pytest.approx(40)


class TestCrear:
    def test_a_una_direccion_web(self, client, pdf_tres_paginas, tmp_path):
        doc_id = _abrir(client, pdf_tres_paginas)
        r = _crear(client, doc_id, uri="www.ejemplo.com")
        assert r.status_code == 200 and r.json()["index"] == 0 and r.json()["stash_id"]
        assert _listar(client, doc_id)[0]["uri"] == "https://www.ejemplo.com"
        salida = _guardar(client, doc_id, tmp_path)
        with fitz.open(salida) as d:
            ls = d[0].get_links()
            assert len(ls) == 1 and ls[0]["kind"] == fitz.LINK_URI and ls[0]["uri"] == "https://www.ejemplo.com"
            assert fitz.Rect(ls[0]["from"]) == fitz.Rect(40, 40, 140, 70)

    def test_a_una_pagina_del_documento(self, client, pdf_tres_paginas, tmp_path):
        doc_id = _abrir(client, pdf_tres_paginas)
        assert _crear(client, doc_id, target_page=2).status_code == 200
        ls = _listar(client, doc_id)
        assert ls[0]["kind"] == "goto" and ls[0]["page"] == 2
        with fitz.open(_guardar(client, doc_id, tmp_path)) as d:
            assert d[0].get_links()[0]["kind"] == fitz.LINK_GOTO and d[0].get_links()[0]["page"] == 2

    def test_varios_enlaces_conservan_el_orden(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        for i, u in enumerate(("a.com", "b.com", "c.com")):
            assert _crear(client, doc_id, zona=_zona(y0=40 + 40 * i, y1=70 + 40 * i), uri=u).json()["index"] == i
        assert [l["uri"] for l in _listar(client, doc_id)] == ["https://a.com", "https://b.com", "https://c.com"]

    @pytest.mark.parametrize("cuerpo,motivo", [
        ({"uri": "javascript:alert(1)"}, "esquema peligroso"),
        ({"uri": "file:///C:/x.exe"}, "archivo local"),
        ({"uri": "no es un enlace"}, "no es dirección"),
        ({}, "sin destino"),
        ({"uri": "a.com", "target_page": 1}, "dos destinos"),
        ({"target_page": 7}, "página que no existe"),
    ])
    def test_lo_invalido_es_422_con_motivo_y_no_toca_nada(self, client, pdf_tres_paginas, cuerpo, motivo):
        doc_id = _abrir(client, pdf_tres_paginas)
        r = _crear(client, doc_id, **cuerpo)
        assert r.status_code == 422, motivo
        assert r.json()["detail"]
        assert _listar(client, doc_id) == []

    def test_una_zona_diminuta_o_fuera_de_la_hoja_es_422(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        assert _crear(client, doc_id, zona=_zona(40, 40, 41, 41), uri="a.com").status_code == 422
        assert _crear(client, doc_id, zona=_zona(500, 500, 600, 600), uri="a.com").status_code == 422
        assert _listar(client, doc_id) == []

    def test_una_zona_que_se_sale_se_recorta_a_la_hoja(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        assert _crear(client, doc_id, zona=_zona(250, 350, 400, 500), uri="a.com").status_code == 200
        l = _listar(client, doc_id)[0]
        assert l["x1"] == pytest.approx(300) and l["y1"] == pytest.approx(400)

    def test_un_error_no_deja_un_respaldo_de_mas(self, client, pdf_tres_paginas):
        from app.services.pdf_service import pdf_service
        doc_id = _abrir(client, pdf_tres_paginas)
        antes = len(pdf_service._page_stash)
        _crear(client, doc_id, uri="javascript:x")
        assert len(pdf_service._page_stash) == antes

    def test_marca_el_documento_como_modificado(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        _crear(client, doc_id, uri="a.com")
        from app.services.pdf_service import pdf_service
        assert pdf_service._dirty.get(doc_id) is True


class TestEditar:
    def _con_un_enlace(self, client, pdf):
        doc_id = _abrir(client, pdf)
        _crear(client, doc_id, uri="a.com")
        return doc_id

    def _editar(self, client, doc_id, **cuerpo):
        return client.post(f"/pdf/links/update/{doc_id}", json={"page_num": 0, "index": 0, **cuerpo})

    def test_cambia_la_direccion(self, client, pdf_tres_paginas, tmp_path):
        doc_id = self._con_un_enlace(client, pdf_tres_paginas)
        assert self._editar(client, doc_id, uri="https://nuevo.com").status_code == 200
        assert _listar(client, doc_id)[0]["uri"] == "https://nuevo.com"
        with fitz.open(_guardar(client, doc_id, tmp_path)) as d:
            assert [l["uri"] for l in d[0].get_links()] == ["https://nuevo.com"]

    def test_de_direccion_a_pagina_y_de_vuelta(self, client, pdf_tres_paginas):
        doc_id = self._con_un_enlace(client, pdf_tres_paginas)
        assert self._editar(client, doc_id, target_page=1).status_code == 200
        l = _listar(client, doc_id)[0]
        assert l["kind"] == "goto" and l["page"] == 1 and l["uri"] is None
        assert self._editar(client, doc_id, uri="otra.com").status_code == 200
        l = _listar(client, doc_id)[0]
        assert l["kind"] == "uri" and l["uri"] == "https://otra.com" and l["page"] is None

    def test_mueve_la_zona(self, client, pdf_tres_paginas):
        doc_id = self._con_un_enlace(client, pdf_tres_paginas)
        assert self._editar(client, doc_id, uri="a.com", zona=_zona(100, 100, 200, 160)).status_code == 200
        l = _listar(client, doc_id)[0]
        assert (l["x0"], l["y0"], l["x1"], l["y1"]) == pytest.approx((100, 100, 200, 160))

    def test_solo_toca_el_pedido(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        for u in ("a.com", "b.com", "c.com"):
            _crear(client, doc_id, uri=u)
        assert client.post(f"/pdf/links/update/{doc_id}", json={"page_num": 0, "index": 1, "uri": "z.com"}).status_code == 200
        assert [l["uri"] for l in _listar(client, doc_id)] == ["https://a.com", "https://z.com", "https://c.com"]

    def test_lo_invalido_es_422_y_el_enlace_queda_como_estaba(self, client, pdf_tres_paginas):
        doc_id = self._con_un_enlace(client, pdf_tres_paginas)
        assert self._editar(client, doc_id, uri="javascript:x").status_code == 422
        assert self._editar(client, doc_id, target_page=9).status_code == 422
        assert _listar(client, doc_id)[0]["uri"] == "https://a.com"

    def test_un_enlace_que_no_existe_es_404(self, client, pdf_tres_paginas):
        doc_id = self._con_un_enlace(client, pdf_tres_paginas)
        r = client.post(f"/pdf/links/update/{doc_id}", json={"page_num": 0, "index": 5, "uri": "a.com"})
        assert r.status_code == 404


class TestQuitar:
    def test_quita_solo_ese_y_conserva_los_otros(self, client, pdf_tres_paginas, tmp_path):
        doc_id = _abrir(client, pdf_tres_paginas)
        for u in ("a.com", "b.com", "c.com"):
            _crear(client, doc_id, uri=u)
        r = client.post(f"/pdf/links/remove/{doc_id}", json={"page_num": 0, "index": 1})
        assert r.status_code == 200 and r.json()["stash_id"]
        assert [l["uri"] for l in _listar(client, doc_id)] == ["https://a.com", "https://c.com"]
        with fitz.open(_guardar(client, doc_id, tmp_path)) as d:
            assert [l["uri"] for l in d[0].get_links()] == ["https://a.com", "https://c.com"]

    def test_un_enlace_que_no_existe_es_404(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        assert client.post(f"/pdf/links/remove/{doc_id}", json={"page_num": 0, "index": 0}).status_code == 404


class TestDeshacer:
    """Se restaura el documento ENTERO: la copia de una sola página perdía los enlaces
    internos que apuntan a otras páginas."""

    def _restaurar(self, client, doc_id, stash_id):
        assert client.post(f"/pdf/restore-document/{doc_id}", json={"stash_id": stash_id}).status_code == 200

    def test_deshacer_crear(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        r = _crear(client, doc_id, uri="a.com")
        self._restaurar(client, doc_id, r.json()["stash_id"])
        assert _listar(client, doc_id) == []

    def test_deshacer_quitar_vuelve_con_su_destino(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        _crear(client, doc_id, uri="a.com")
        _crear(client, doc_id, zona=_zona(y0=100, y1=130), target_page=2)
        r = client.post(f"/pdf/links/remove/{doc_id}", json={"page_num": 0, "index": 1})
        self._restaurar(client, doc_id, r.json()["stash_id"])
        ls = _listar(client, doc_id)
        assert [(l["kind"], l["uri"], l["page"]) for l in ls] == [("uri", "https://a.com", None), ("goto", None, 2)]

    def test_deshacer_editar(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        _crear(client, doc_id, uri="a.com")
        r = client.post(f"/pdf/links/update/{doc_id}", json={"page_num": 0, "index": 0, "uri": "z.com"})
        self._restaurar(client, doc_id, r.json()["stash_id"])
        assert _listar(client, doc_id)[0]["uri"] == "https://a.com"

    def test_los_enlaces_a_otras_paginas_sobreviven_a_deshacer_un_enlace_de_otra_pagina(self, client, pdf_tres_paginas):
        doc_id = _abrir(client, pdf_tres_paginas)
        _crear(client, doc_id, pagina=0, target_page=2)
        r = _crear(client, doc_id, pagina=1, uri="a.com")
        self._restaurar(client, doc_id, r.json()["stash_id"])
        assert [l["page"] for l in _listar(client, doc_id, 0)] == [2]


class TestPaginaGirada:
    @pytest.mark.parametrize("giro", [90, 180, 270])
    def test_la_zona_del_visor_cae_donde_se_dibujo(self, client, tmp_path, giro):
        """Los enlaces van en las coordenadas de la página sin girar: sin convertirlas,
        la zona quedaba en otro lado de la hoja."""
        ruta = str(tmp_path / f"g{giro}.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400).set_rotation(giro)
        d.save(ruta)
        d.close()
        doc_id = _abrir(client, ruta)
        zona = _zona(30, 50, 130, 90)  # en el visor (la hoja girada)
        assert _crear(client, doc_id, zona=zona, uri="a.com").status_code == 200
        l = _listar(client, doc_id)[0]
        assert (l["x0"], l["y0"], l["x1"], l["y1"]) == pytest.approx((30, 50, 130, 90))
        # Y en el archivo, vista por quien lo abra: la misma zona.
        with fitz.open(_guardar(client, doc_id, tmp_path)) as docu:
            assert tuple(fitz.Rect(docu[0].get_links()[0]["from"]).normalize()) == pytest.approx((30, 50, 130, 90))

    @pytest.mark.parametrize("giro", [90, 180, 270])
    def test_editar_solo_el_destino_no_mueve_la_zona(self, client, tmp_path, giro):
        """`get_links()` devuelve la zona del visor y `update_link` espera la de la página
        sin girar: devuelta tal cual, el enlace se corría al cambiarle solo la dirección."""
        ruta = str(tmp_path / f"e{giro}.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400).set_rotation(giro)
        d.save(ruta)
        d.close()
        doc_id = _abrir(client, ruta)
        _crear(client, doc_id, zona=_zona(30, 50, 130, 90), uri="a.com")
        r = client.post(f"/pdf/links/update/{doc_id}", json={"page_num": 0, "index": 0, "uri": "b.com"})
        assert r.status_code == 200
        l = _listar(client, doc_id)[0]
        assert l["uri"] == "https://b.com"
        assert (l["x0"], l["y0"], l["x1"], l["y1"]) == pytest.approx((30, 50, 130, 90))

    @pytest.mark.parametrize("giro", [90, 270])
    def test_editar_la_zona_en_pagina_girada(self, client, tmp_path, giro):
        ruta = str(tmp_path / f"z{giro}.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400).set_rotation(giro)
        d.save(ruta)
        d.close()
        doc_id = _abrir(client, ruta)
        _crear(client, doc_id, zona=_zona(30, 50, 130, 90), uri="a.com")
        client.post(f"/pdf/links/update/{doc_id}", json={
            "page_num": 0, "index": 0, "uri": "a.com", "zona": _zona(60, 100, 160, 140)})
        l = _listar(client, doc_id)[0]
        assert (l["x0"], l["y0"], l["x1"], l["y1"]) == pytest.approx((60, 100, 160, 140))
