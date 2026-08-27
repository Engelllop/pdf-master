"""Las marcas viajan en el PDF: al reabrir sin sidecar se recuperan id, autor y hilo."""
import os


def _open_path(client, path):
    return client.post("/pdf/open", json={"file_path": path}).json()["doc_id"]


def _ann(id_, type_, **extra):
    base = {"id": id_, "type": type_, "page": 0, "x": 40, "y": 40,
            "color": "#ef4444", "author": "Engell", "status": "open", "layer": "Revisión"}
    base.update(extra)
    return base


class TestMarkupNativo:
    def test_reabrir_sin_sidecar_recupera_revision(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "con-marcas.pdf")
        anns = {"annotations": [
            _ann("h1", "highlight", x=50, y=50, width=120, height=14,
                 replies=[{"id": "r1", "author": "Otro", "text": "Revisar cota", "at": 1785000100000}]),
            _ann("rc1", "rect", x=80, y=80, width=60, height=40),
            _ann("ln1", "line", x=20, y=200, width=100, height=30, lineWidth=2),
            _ann("ar1", "arrow", x=20, y=250, width=80, height=-20),
            _ann("tx1", "text", x=200, y=60, width=140, height=28, text="nota embebida", fontSize=12),
            _ann("nt1", "note", x=300, y=80, text="comentario"),
            _ann("dr1", "draw", points=[{"x": 30, "y": 300}, {"x": 50, "y": 320}, {"x": 70, "y": 310}]),
            _ann("pg1", "polygon", points=[{"x": 200, "y": 200}, {"x": 260, "y": 200}, {"x": 230, "y": 250}]),
            _ann("ct1", "count", x=400, y=120, text="Tomas", symbol="circle"),
            _ann("md1", "measure_distance", x=40, y=400, width=80, height=0,
                 measurement={"value": 2.5, "unit": "m", "label": "2.50 m"}),
        ]}
        assert client.post(f"/pdf/embed/{doc_id}", json=anns).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        assert not os.path.exists(out + ".pdfmaster.json")

        client.post(f"/pdf/close/{doc_id}")
        reopened = client.post("/pdf/open", json={"file_path": out})
        assert reopened.status_code == 200
        new_id = reopened.json()["doc_id"]
        loaded = client.get(f"/pdf/annotations/{new_id}").json()["annotations"]
        client.post(f"/pdf/close/{new_id}")

        by_id = {a["id"]: a for a in loaded}
        assert set(by_id) >= {"h1", "rc1", "ln1", "ar1", "tx1", "nt1", "dr1", "pg1", "ct1", "md1"}
        assert by_id["h1"]["author"] == "Engell"
        assert by_id["h1"]["status"] == "open"
        assert by_id["h1"]["replies"][0]["text"] == "Revisar cota"
        assert by_id["h1"]["replies"][0]["author"] == "Otro"
        assert by_id["rc1"]["type"] == "rect"
        assert by_id["ar1"]["type"] == "arrow"
        assert by_id["tx1"]["text"] == "nota embebida"
        assert by_id["ct1"]["type"] == "count"
        assert by_id["ct1"]["text"] == "Tomas"
        assert by_id["md1"]["measurement"]["label"] == "2.50 m"
        assert by_id["ln1"]["width"] == 100
        assert by_id["dr1"]["type"] == "draw"
        assert len(by_id["dr1"]["points"] or []) >= 2


class TestSidecarYMarcasAjenas:
    """«El PDF trae anotaciones» no es lo mismo que «el PDF trae las marcas de la app».
    Si el plano llega con un comentario de Acrobat del arquitecto y las marcas del
    usuario están solo en un sidecar de una versión vieja, cortar en la primera
    anotación nativa las hacía DESAPARECER al abrir."""

    def _con_sidecar(self, path, anns):
        import json
        with open(path + ".pdfmaster.json", "w", encoding="utf-8") as f:
            json.dump({"version": 1, "annotations": anns}, f)

    def test_marca_ajena_en_el_pdf_no_esconde_el_sidecar(self, client, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        # Comentario de otro programa: sin payload de PDF Master ni nombre pdfmaster:
        doc[0].add_highlight_annot(fitz.Rect(10, 10, 90, 24))
        doc.saveIncr()
        doc.close()
        self._con_sidecar(path, [_ann("ct1", "count", x=400, y=120, text="Tomas")])

        resp = client.post("/pdf/open", json={"file_path": path})
        assert resp.status_code == 200
        doc_id = resp.json()["doc_id"]
        try:
            ids = {a["id"] for a in client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]}
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert "ct1" in ids, "el conteo del sidecar se perdía al abrir"
        assert len(ids) == 2, "y la marca ajena tiene que seguir estando"

    def test_si_el_pdf_trae_marcas_propias_el_sidecar_no_duplica(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "propias.pdf")
        anns = [_ann("rc1", "rect", width=60, height=40)]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        client.post(f"/pdf/close/{doc_id}")
        # Sidecar viejo con LA MISMA marca: no puede aparecer dos veces.
        self._con_sidecar(out, anns)

        resp = client.post("/pdf/open", json={"file_path": out})
        nuevo = resp.json()["doc_id"]
        try:
            cargadas = client.get(f"/pdf/annotations/{nuevo}").json()["annotations"]
        finally:
            client.post(f"/pdf/close/{nuevo}")
        assert [a["id"] for a in cargadas] == ["rc1"]

    def test_pdf_sin_anotaciones_sigue_leyendo_el_sidecar(self, client, pdf_factory):
        path = pdf_factory(pages=1)
        self._con_sidecar(path, [_ann("nt1", "note", text="pendiente")])
        resp = client.post("/pdf/open", json={"file_path": path})
        doc_id = resp.json()["doc_id"]
        try:
            ids = [a["id"] for a in client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert ids == ["nt1"]


class TestNoDuplicarMarcasAjenas:
    """Al abrir, una marca ajena (Acrobat/Bluebeam) se importa a la lista de la app. El
    guardado dibujaba esa lista sobre una copia que TODAVÍA tenía la original, así que
    cada guardado duplicaba la marca: 1 → 2 → 3. Y borrarla en la app no la sacaba del
    archivo, porque la original seguía ahí."""

    def _con_resaltado_ajeno(self, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        doc[0].add_highlight_annot(fitz.Rect(38, 50, 150, 66))
        doc.saveIncr()
        doc.close()
        return path

    def _guardar(self, client, doc_id, anns, out):
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200

    def _cuantas(self, ruta):
        import fitz
        with fitz.open(ruta) as d:
            return sum(len(list(p.annots() or [])) for p in d)

    def test_guardar_no_duplica(self, client, pdf_factory, tmp_path):
        path = self._con_resaltado_ajeno(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            assert len(anns) == 1
            out = str(tmp_path / "una-vez.pdf")
            self._guardar(client, doc_id, anns, out)
            assert self._cuantas(out) == 1
            # Y guardar otra vez tampoco: es el mismo fallo que v1.14.2 arregló para las
            # marcas propias.
            out2 = str(tmp_path / "dos-veces.pdf")
            self._guardar(client, doc_id, anns, out2)
            assert self._cuantas(out2) == 1
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_borrar_una_marca_importada_la_saca_del_archivo(self, client, pdf_factory, tmp_path):
        path = self._con_resaltado_ajeno(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            out = str(tmp_path / "sin-marca.pdf")
            # Lista vacía = el usuario las borró todas.
            self._guardar(client, doc_id, [], out)
            assert self._cuantas(out) == 0
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_los_campos_de_formulario_y_enlaces_no_se_tocan(self, client, pdf_factory, tmp_path):
        """Solo se quitan los tipos que el importador lee; lo que la app no gestiona
        (formularios, enlaces) tiene que sobrevivir al guardado."""
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        w = fitz.Widget()
        w.field_name = "Nombre"
        w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        w.rect = fitz.Rect(20, 120, 200, 140)
        w.field_value = "dato"
        doc[0].add_widget(w)
        doc[0].insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(10, 10, 60, 30), "uri": "https://example.com"})
        doc[0].add_highlight_annot(fitz.Rect(38, 50, 150, 66))
        doc.saveIncr()
        doc.close()

        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            out = str(tmp_path / "con-formulario.pdf")
            self._guardar(client, doc_id, anns, out)
        finally:
            client.post(f"/pdf/close/{doc_id}")
        with fitz.open(out) as d:
            assert [w.field_value for w in (d[0].widgets() or [])] == ["dato"]
            assert len(d[0].get_links()) == 1


class TestSellosAjenos:
    """El aspecto de un sello vive en su appearance stream (una imagen, un logo, un cuño
    con fecha) y `_embed_into` no sabe reproducirlo. Así que la app NO lo gestiona: no lo
    importa a su lista (no se duplicaría) y no lo borra al guardar (no se degrada un
    documento entregado). Como el visor tampoco lo dibuja, al abrir se avisa."""

    def _con_sello_y_resaltado(self, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        doc[0].add_stamp_annot(fitz.Rect(40, 100, 180, 140), stamp=0)
        doc[0].add_highlight_annot(fitz.Rect(38, 50, 120, 66))
        doc.saveIncr()
        doc.close()
        return path

    def test_el_sello_no_entra_en_la_lista_pero_se_reporta(self, client, pdf_factory):
        path = self._con_sello_y_resaltado(pdf_factory)
        resp = client.post("/pdf/open", json={"file_path": path})
        info = resp.json()
        doc_id = info["doc_id"]
        try:
            tipos = [a["type"] for a in client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert tipos == ["highlight"]
        assert info["unmanaged_annots"] == 1

    def test_el_sello_sobrevive_al_guardado_sin_tocarse(self, client, pdf_factory, tmp_path):
        import fitz
        path = self._con_sello_y_resaltado(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            out = str(tmp_path / "con-sello.pdf")
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        with fitz.open(out) as d:
            tipos = sorted((a.type[1] for a in (d[0].annots() or [])))
        # El sello sigue ahí y el resaltado no se duplicó.
        assert tipos == ["Highlight", "Stamp"]

    def test_un_pdf_normal_no_reporta_nada(self, client, pdf_factory):
        path = pdf_factory(pages=1)
        info = client.post("/pdf/open", json={"file_path": path}).json()
        try:
            assert info["unmanaged_annots"] == 0
        finally:
            client.post(f"/pdf/close/{info['doc_id']}")


class TestTintaAjenaDeVariosTrazos:
    """El modelo de la app tiene UNA lista de puntos por marca, así que al importar una
    tinta de varios trazos se concatenan: `[[A,B],[C,D]]` → `[[A,B,C,D]]`, con una línea
    espuria uniendo los trazos. Al guardar, eso reemplazaba la marca original por la
    versión corrompida. La ajena se deja como está; la propia sí se gestiona, porque su
    payload trae el tipo y la geometría reales (una cruz son dos trazos)."""

    def _con_tinta_de_dos_trazos(self, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        doc[0].add_ink_annot([[(20.0, 20.0), (60.0, 60.0)], [(60.0, 20.0), (20.0, 60.0)]])
        doc.saveIncr()
        doc.close()
        return path

    def test_no_se_importa_y_sobrevive_intacta(self, client, pdf_factory, tmp_path):
        import fitz
        path = self._con_tinta_de_dos_trazos(pdf_factory)
        info = client.post("/pdf/open", json={"file_path": path}).json()
        doc_id = info["doc_id"]
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            assert anns == []
            assert info["unmanaged_annots"] == 1
            out = str(tmp_path / "tinta.pdf")
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        d = fitz.open(out)
        try:
            trazos = [a.vertices for a in d[0].annots()]
        finally:
            d.close()
        assert len(trazos) == 1
        # Dos trazos separados, no uno concatenado.
        assert len(trazos[0]) == 2

    def test_una_cruz_propia_si_se_gestiona(self, client, open_doc, tmp_path):
        """Se dibuja como tinta de dos trazos, pero lleva payload: tiene que volver."""
        import fitz
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "cruz.pdf")
        anns = {"annotations": [_ann("x1", "cross", width=30, height=30)]}
        assert client.post(f"/pdf/embed/{doc_id}", json=anns).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        client.post(f"/pdf/close/{doc_id}")

        nuevo = _open_path(client, out)
        try:
            tipos = [a["type"] for a in client.get(f"/pdf/annotations/{nuevo}").json()["annotations"]]
        finally:
            client.post(f"/pdf/close/{nuevo}")
        assert tipos == ["cross"]


class TestPropiedadesDeMarcasAjenas:
    """Las marcas ajenas no traen payload, así que relleno, opacidad, grosor y estilo de
    línea hay que leerlos del propio PDF. Desde que el guardado borra la original y
    redibuja desde la lista de la app, lo que no se importe se pierde: un recuadro azul
    semitransparente de Bluebeam volvía sin relleno, opaco y con el borde por defecto."""

    def _con_recuadro_ajeno(self, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        a = doc[0].add_rect_annot(fitz.Rect(20, 20, 160, 100))
        a.set_colors(stroke=(1, 0, 0), fill=(0, 0, 1))
        a.set_opacity(0.35)
        a.set_border(width=4, dashes=[6, 3])
        a.update()
        doc.saveIncr()
        doc.close()
        return path

    def test_se_importan_relleno_opacidad_grosor_y_estilo(self, client, pdf_factory):
        path = self._con_recuadro_ajeno(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            a = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"][0]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert a["type"] == "rect"
        assert a["color"].lower() == "#ff0000"
        assert a["fillColor"].lower() == "#0000ff"
        assert abs(a["opacity"] - 0.35) < 0.01
        assert a["lineWidth"] == 4
        assert a["lineStyle"] == "dashed"

    def test_sobreviven_al_guardado(self, client, pdf_factory, tmp_path):
        import fitz
        path = self._con_recuadro_ajeno(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            out = str(tmp_path / "recuadro.pdf")
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        nuevo = _open_path(client, out)
        try:
            a = client.get(f"/pdf/annotations/{nuevo}").json()["annotations"][0]
        finally:
            client.post(f"/pdf/close/{nuevo}")
        assert a["fillColor"] is not None
        assert abs(a["opacity"] - 0.35) < 0.05
        assert a["lineWidth"] == 4

    def test_un_recuadro_sin_relleno_no_inventa_uno(self, client, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        a = doc[0].add_rect_annot(fitz.Rect(20, 20, 160, 100))
        a.set_colors(stroke=(1, 0, 0))
        a.update()
        doc.saveIncr()
        doc.close()
        doc_id = _open_path(client, path)
        try:
            a = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"][0]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert a["fillColor"] is None
        assert a["lineStyle"] is None


class TestFlechasAjenas:
    """Un `Line` con punta de flecha se importaba como línea pelada, así que al guardar
    (que redibuja desde la lista de la app) las flechas de referencia de un plano ajeno
    perdían la punta. El modelo tiene la punta al final: si la ajena apunta al principio,
    se invierten los extremos."""

    def _con_flechas(self, pdf_factory):
        import fitz
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        a = doc[0].add_line_annot(fitz.Point(20, 20), fitz.Point(160, 100))
        a.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_OPEN_ARROW)
        a.update()
        b = doc[0].add_line_annot(fitz.Point(20, 150), fitz.Point(160, 150))
        b.set_line_ends(fitz.PDF_ANNOT_LE_CLOSED_ARROW, fitz.PDF_ANNOT_LE_NONE)
        b.update()
        c = doc[0].add_line_annot(fitz.Point(20, 180), fitz.Point(160, 180))
        c.update()
        doc.saveIncr()
        doc.close()
        return path

    def test_la_punta_decide_el_tipo_y_el_sentido(self, client, pdf_factory):
        path = self._con_flechas(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
        finally:
            client.post(f"/pdf/close/{doc_id}")
        tipos = sorted(a["type"] for a in anns)
        assert tipos == ["arrow", "arrow", "line"]

        # La que apuntaba al principio se invierte para que la punta quede al final:
        # arranca en el extremo sin punta (160, 150) y avanza hacia atrás.
        invertida = next(a for a in anns if a["type"] == "arrow" and abs(a["y"] - 150) < 1)
        assert abs(invertida["x"] - 160) < 1
        assert invertida["width"] < 0

    def test_la_flecha_sobrevive_al_guardado(self, client, pdf_factory, tmp_path):
        path = self._con_flechas(pdf_factory)
        doc_id = _open_path(client, path)
        try:
            anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
            out = str(tmp_path / "flechas.pdf")
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        nuevo = _open_path(client, out)
        try:
            tipos = sorted(a["type"] for a in client.get(f"/pdf/annotations/{nuevo}").json()["annotations"])
        finally:
            client.post(f"/pdf/close/{nuevo}")
        assert tipos == ["arrow", "arrow", "line"]
