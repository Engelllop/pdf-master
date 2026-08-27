"""Cobertura de las features de edición in-situ añadidas en v1.4.x y sin tests:
spans, edit-text, list images, transform-image, redact (área y por coincidencias)."""
import fitz


def _open(client, path):
    return client.post("/pdf/open", json={"file_path": path}).json()["doc_id"]


def _pdf_with_image(client, tmp_path):
    path = str(tmp_path / "con_imagen.pdf")
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 20))
    pix.clear_with(120)
    page.insert_image(fitz.Rect(100, 100, 200, 200), pixmap=pix)
    doc.save(path)
    doc.close()
    return _open(client, path)


class TestSpansAndEditText:
    def test_spans_return_text_positions(self, client, open_doc):
        info = open_doc(pages=1, text="EditarEsto")
        spans = client.get(f"/pdf/spans/{info['doc_id']}/0").json()["spans"]
        assert len(spans) > 0
        assert {"x0", "y0", "x1", "y1", "text", "size"} <= set(spans[0])

    def test_edit_text_span_marks_dirty(self, client, open_doc):
        info = open_doc(pages=1, text="ReemplazarMe")
        doc_id = info["doc_id"]
        spans = client.get(f"/pdf/spans/{doc_id}/0").json()["spans"]
        s = next(sp for sp in spans if sp["text"].strip())
        resp = client.post(f"/pdf/edit-text/{doc_id}", json={
            "page_num": 0, "x0": s["x0"], "y0": s["y0"], "x1": s["x1"], "y1": s["y1"],
            "text": "TextoNuevo", "size": s.get("size"), "color": "#000000", "font": s.get("font"),
        })
        assert resp.status_code == 200, resp.text
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/replace-page/{doc_id}", json={"page_num": 0, "stash_id": stash_id}).status_code == 200

    def test_edit_text_unknown_doc_is_404(self, client):
        resp = client.post("/pdf/edit-text/no-such", json={
            "page_num": 0, "x0": 0, "y0": 0, "x1": 10, "y1": 10, "text": "x",
        })
        assert resp.status_code == 404


class TestImages:
    def test_list_images_finds_inserted_image(self, client, tmp_path):
        doc_id = _pdf_with_image(client, tmp_path)
        images = client.get(f"/pdf/images/{doc_id}/0").json()["images"]
        assert len(images) >= 1
        assert "xref" in images[0]
        client.post(f"/pdf/close/{doc_id}")

    def test_transform_image_delete_marks_dirty(self, client, tmp_path):
        doc_id = _pdf_with_image(client, tmp_path)
        im = client.get(f"/pdf/images/{doc_id}/0").json()["images"][0]
        resp = client.post(f"/pdf/transform-image/{doc_id}", json={
            "page_num": 0, "xref": im["xref"],
            "old": [im["x0"], im["y0"], im["x1"], im["y1"]], "delete": True,
        })
        assert resp.status_code == 200, resp.text
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True
        assert resp.json()["stash_id"]
        client.post(f"/pdf/close/{doc_id}")

    def test_transform_image_delete_samples_background(self, client, tmp_path):
        """Al borrar, el hueco debe tomar el color de fondo (rojo), no blanco."""
        path = str(tmp_path / "fondo_rojo.pdf")
        doc = fitz.open()
        page = doc.new_page(width=300, height=300)
        page.draw_rect(page.rect, color=(0.85, 0.15, 0.15), fill=(0.85, 0.15, 0.15))
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 20))
        pix.clear_with(20)  # imagen oscura encima del fondo rojo
        page.insert_image(fitz.Rect(100, 100, 200, 200), pixmap=pix)
        doc.save(path)
        doc.close()
        doc_id = _open(client, path)
        im = client.get(f"/pdf/images/{doc_id}/0").json()["images"][0]
        resp = client.post(f"/pdf/transform-image/{doc_id}", json={
            "page_num": 0, "xref": im["xref"],
            "old": [im["x0"], im["y0"], im["x1"], im["y1"]], "delete": True,
        })
        assert resp.status_code == 200, resp.text
        live = client.get(f"/pdf/raw/{doc_id}")
        with fitz.open(stream=live.content, filetype="pdf") as d:
            center = d.load_page(0).get_pixmap(clip=fitz.Rect(140, 140, 160, 160), alpha=False)
            r, g, b = center.pixel(center.width // 2, center.height // 2)
            assert r > 150 and g < 120 and b < 120, f"esperaba rojo, no ({r},{g},{b})"
        client.post(f"/pdf/close/{doc_id}")

    def test_transform_image_replace_missing_file_is_422(self, client, tmp_path):
        doc_id = _pdf_with_image(client, tmp_path)
        im = client.get(f"/pdf/images/{doc_id}/0").json()["images"][0]
        resp = client.post(f"/pdf/transform-image/{doc_id}", json={
            "page_num": 0, "xref": im["xref"],
            "old": [im["x0"], im["y0"], im["x1"], im["y1"]],
            "replace_path": "C:/no/existe.png",
        })
        assert resp.status_code == 422
        client.post(f"/pdf/close/{doc_id}")


class TestRedact:
    def test_redact_area_marks_dirty(self, client, open_doc):
        info = open_doc(pages=1)
        resp = client.post(f"/pdf/redact/{info['doc_id']}", json={
            "page_num": 0, "x": 50, "y": 50, "width": 100, "height": 30,
        })
        assert resp.status_code == 200
        assert client.get(f"/pdf/dirty/{info['doc_id']}").json()["dirty"] is True
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/replace-page/{info['doc_id']}", json={"page_num": 0, "stash_id": stash_id}).status_code == 200

    def test_redact_matches_removes_text(self, client, open_doc):
        info = open_doc(pages=1, text="secretosecreto")
        doc_id = info["doc_id"]
        resp = client.post(f"/pdf/redact-matches/{doc_id}?query=secretosecreto")
        assert resp.status_code == 200
        assert resp.json()["redacted"] >= 1
        text = client.get(f"/pdf/text/{doc_id}/0").json()["text"]
        assert "secretosecreto" not in text
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/restore-document/{doc_id}", json={"stash_id": stash_id}).status_code == 200
        assert "secretosecreto" in client.get(f"/pdf/text/{doc_id}/0").json()["text"]

    def test_redact_unknown_doc_is_404(self, client):
        resp = client.post("/pdf/redact/no-such", json={
            "page_num": 0, "x": 0, "y": 0, "width": 10, "height": 10,
        })
        assert resp.status_code == 404


class TestNativeAnnotsAndOutline:
    def test_open_imports_highlight_without_sidecar(self, client, tmp_path):
        path = str(tmp_path / "marcado.pdf")
        doc = fitz.open()
        page = doc.new_page()
        page.add_highlight_annot(fitz.Rect(50, 50, 200, 70))
        doc.save(path)
        doc.close()
        info = client.post("/pdf/open", json={"file_path": path}).json()
        anns = client.get(f"/pdf/annotations/{info['doc_id']}").json()["annotations"]
        assert any(a["type"] == "highlight" for a in anns)
        client.post(f"/pdf/close/{info['doc_id']}")

    def test_set_outline_roundtrip(self, client, open_doc):
        info = open_doc(pages=3)
        resp = client.post(f"/pdf/outline/{info['doc_id']}", json=[
            {"title": "Portada", "page": 0},
            {"title": "Detalle", "page": 2},
        ])
        assert resp.status_code == 200
        toc = client.get(f"/pdf/outline/{info['doc_id']}").json()
        titles = [i["title"] for i in toc]
        assert "Portada" in titles and "Detalle" in titles


class TestEncabezadoYPie:
    def test_un_encabezado_largo_no_se_sale_por_la_izquierda(self, client, open_doc):
        """Se centra restando la mitad del ancho del texto: si el texto es más ancho
        que la página, la x salía negativa y el principio quedaba fuera del papel."""
        doc_id = open_doc(pages=1)["doc_id"]
        largo = "PROYECTO " * 30
        res = client.post(f"/pdf/header-footer/{doc_id}", json={"header": largo, "footer": "pie"})
        assert res.status_code == 200

        raw = client.get(f"/pdf/raw/{doc_id}")
        pagina = fitz.open(stream=raw.content, filetype="pdf")[0]
        bloques = [b for b in pagina.get_text("blocks") if "PROYECTO" in b[4]]
        assert bloques, "no se escribió el encabezado"
        assert min(b[0] for b in bloques) >= 0


class TestRedaccionYDibujoDelPlano:
    """`apply_redactions()` por omisión borra el dibujo vectorial CONTENIDO en el rect
    (`REMOVE_IF_COVERED`). Las rutas que redactan para *editar* —reemplazar texto,
    editar un span, mover una imagen— usaban ese rect como paso intermedio, así que se
    llevaban en silencio el achurado o el guion que hubiera detrás. En un plano eso es
    destruir contenido sin avisar."""

    def _plano_con_texto_y_linea(self, tmp_path):
        path = str(tmp_path / "plano.pdf")
        doc = fitz.open()
        page = doc.new_page(width=300, height=200)
        page.insert_text((72, 100), "REV B", fontsize=14)
        r = page.search_for("REV B")[0]
        # Segmento vectorial contenido en el rect del texto (un guion del plano).
        page.draw_line(fitz.Point(r.x0 + 2, r.y0 + 2), fitz.Point(r.x0 + 10, r.y0 + 2),
                       color=(1, 0, 0), width=0.5)
        doc.save(path)
        doc.close()
        return path

    def _dibujos(self, client, doc_id, tmp_path, nombre):
        out = str(tmp_path / nombre)
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        with fitz.open(out) as d:
            return len(d[0].get_drawings())

    def test_reemplazar_texto_no_borra_el_dibujo_de_abajo(self, client, tmp_path):
        path = self._plano_con_texto_y_linea(tmp_path)
        doc_id = _open(client, path)
        try:
            resp = client.post(f"/pdf/replace-text/{doc_id}", json={"query": "REV B", "replace": "REV C"})
            assert resp.status_code == 200 and resp.json()["replaced"] >= 1
            assert self._dibujos(client, doc_id, tmp_path, "reemplazado.pdf") == 1
            with fitz.open(str(tmp_path / "reemplazado.pdf")) as d:
                assert "REV C" in d[0].get_text()
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_redactar_area_si_borra_lo_que_hay_dentro(self, client, tmp_path):
        """La herramienta de redactar sí tiene que llevárselo: es su trabajo."""
        path = self._plano_con_texto_y_linea(tmp_path)
        doc_id = _open(client, path)
        try:
            resp = client.post(f"/pdf/redact/{doc_id}", json={
                "page_num": 0, "x": 60, "y": 80, "width": 80, "height": 40,
            })
            assert resp.status_code == 200
            assert self._dibujos(client, doc_id, tmp_path, "redactado.pdf") == 0
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def _plano_escaneado_con_texto(self, tmp_path):
        """Un escaneo (imagen que cubre la hoja) con un texto encima, como queda un
        plano viejo pasado por OCR."""
        path = str(tmp_path / "escaneado.pdf")
        doc = fitz.open()
        page = doc.new_page(width=300, height=200)
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 60, 40))
        pix.clear_with(80)
        page.insert_image(fitz.Rect(0, 0, 300, 200), pixmap=pix)
        page.insert_text((72, 100), "REV B", fontsize=14)
        doc.save(path)
        doc.close()
        return path

    def test_reemplazar_texto_no_blanquea_el_escaneo(self, client, tmp_path):
        """Por omisión (`IMAGE_PIXELS`) se blanquean los píxeles de la imagen que toca
        el rect: reemplazar un texto sobre un escaneo dejaba un rectángulo blanco."""
        path = self._plano_escaneado_con_texto(tmp_path)
        doc_id = _open(client, path)
        try:
            assert client.post(f"/pdf/replace-text/{doc_id}",
                               json={"query": "REV B", "replace": "REV C"}).status_code == 200
            out = str(tmp_path / "escaneado-out.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        with fitz.open(out) as d:
            pm = d[0].get_pixmap(dpi=72)
            assert pm.pixel(90, 93) != (255, 255, 255), "el escaneo quedó blanco donde estaba el texto"


class TestCampoEnVariasPaginas:
    """Un mismo campo puede tener widget en varias páginas (un «Nombre» repetido en el
    pie de cada hoja). El VALOR es compartido, pero la apariencia se dibuja por widget:
    al actualizar solo el de la página editada, las otras hojas seguían mostrando el
    valor viejo — y la apariencia es lo que se imprime."""

    def _formulario_dos_paginas(self, tmp_path):
        path = str(tmp_path / "formulario.pdf")
        doc = fitz.open()
        for _ in range(2):
            page = doc.new_page(width=595, height=842)
            w = fitz.Widget()
            w.field_name = "Nombre"
            w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            w.rect = fitz.Rect(72, 700, 300, 720)
            w.field_value = "viejo"
            page.add_widget(w)
        doc.save(path)
        doc.close()
        return path

    def test_el_valor_llega_a_los_widgets_de_las_otras_paginas(self, client, tmp_path):
        path = self._formulario_dos_paginas(tmp_path)
        doc_id = _open(client, path)
        try:
            resp = client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Nombre", "value": "Engell", "stash": True})
            assert resp.status_code == 200
            data = resp.json()
            # Documento entero stasheado: restaurar una sola página dejaría la otra hoja
            # con el valor nuevo.
            assert data["stash_page"] is None
            assert data["stash_id"]
            out = str(tmp_path / "formulario-out.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        with fitz.open(out) as d:
            valores = [w.field_value for p in d for w in (p.widgets() or [])]
        assert valores == ["Engell", "Engell"]

    def test_deshacer_devuelve_las_dos_paginas(self, client, tmp_path):
        path = self._formulario_dos_paginas(tmp_path)
        doc_id = _open(client, path)
        try:
            data = client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Nombre", "value": "Engell", "stash": True}).json()
            assert client.post(f"/pdf/restore-document/{doc_id}",
                               json={"stash_id": data["stash_id"]}).status_code == 200
            out = str(tmp_path / "formulario-undo.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        with fitz.open(out) as d:
            valores = [w.field_value for p in d for w in (p.widgets() or [])]
        assert valores == ["viejo", "viejo"]

    def test_campo_en_una_sola_pagina_sigue_stasheando_solo_esa(self, client, tmp_path):
        path = str(tmp_path / "una.pdf")
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        w = fitz.Widget()
        w.field_name = "Solo"
        w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        w.rect = fitz.Rect(72, 700, 300, 720)
        w.field_value = ""
        page.add_widget(w)
        doc.new_page(width=595, height=842)
        doc.save(path)
        doc.close()

        doc_id = _open(client, path)
        try:
            data = client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Solo", "value": "x", "stash": True}).json()
        finally:
            client.post(f"/pdf/close/{doc_id}")
        assert data["stash_page"] == 0


class TestVaciarCampoDeFormulario:
    """PyMuPDF IGNORA `field_value = ''`: borrar el contenido de un campo no borraba
    nada —ni el valor ni lo que se ve— y el PDF se guardaba con el dato viejo."""

    def _con_campo(self, tmp_path, valor="TEXTO VIEJO", tipo=None):
        path = str(tmp_path / "campo.pdf")
        doc = fitz.open()
        page = doc.new_page(width=300, height=120)
        w = fitz.Widget()
        w.field_name = "Nombre"
        w.field_type = tipo or fitz.PDF_WIDGET_TYPE_TEXT
        w.rect = fitz.Rect(20, 20, 280, 45)
        w.field_value = valor
        page.add_widget(w)
        doc.save(path)
        doc.close()
        return path

    def _valores(self, ruta):
        with fitz.open(ruta) as d:
            return [w.field_value for w in (d[0].widgets() or [])], d[0].get_text().strip()

    def test_vaciar_un_campo_de_texto_lo_vacia_de_verdad(self, client, tmp_path):
        path = self._con_campo(tmp_path)
        doc_id = _open(client, path)
        try:
            assert client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Nombre", "value": "", "stash": True}).status_code == 200
            out = str(tmp_path / "campo-vacio.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        valores, visible = self._valores(out)
        assert valores == [""]
        assert "TEXTO VIEJO" not in visible

    def test_deshacer_devuelve_el_valor(self, client, tmp_path):
        path = self._con_campo(tmp_path)
        doc_id = _open(client, path)
        try:
            data = client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Nombre", "value": "", "stash": True}).json()
            assert data["previous"] == "TEXTO VIEJO"
            assert client.post(f"/pdf/replace-page/{doc_id}",
                               json={"page_num": 0, "stash_id": data["stash_id"]}).status_code == 200
            out = str(tmp_path / "campo-undo.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        valores, _ = self._valores(out)
        assert valores == ["TEXTO VIEJO"]

    def test_una_casilla_en_off_no_pasa_por_el_vaciado(self, client, tmp_path):
        """En una casilla el valor es una opción del grupo: 'Off' se escribe normal."""
        path = self._con_campo(tmp_path, valor="Yes", tipo=fitz.PDF_WIDGET_TYPE_CHECKBOX)
        doc_id = _open(client, path)
        try:
            assert client.post(f"/pdf/widgets/{doc_id}/0",
                               json={"field_name": "Nombre", "value": "Off", "stash": True}).status_code == 200
            out = str(tmp_path / "casilla.pdf")
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        finally:
            client.post(f"/pdf/close/{doc_id}")
        valores, _ = self._valores(out)
        assert valores == ["Off"]


class TestCacheDeRenderTrasEditar:
    """El motor cachea el bitmap de cada página (`_render_cache`). Tres métodos que SÍ
    cambian la página no lo invalidaban, así que `/pdf/page-image` —export a PNG,
    contexto «página actual» de la IA— y los puntos de snap seguían siendo los de antes
    de la edición."""

    def _bitmap(self, client, doc_id, page=0):
        resp = client.get(f"/pdf/page-image/{doc_id}/{page}?zoom=1.0")
        assert resp.status_code == 200
        return resp.content

    def test_editar_un_span_refresca_el_bitmap(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        try:
            antes = self._bitmap(client, doc_id)
            resp = client.post(f"/pdf/edit-text/{doc_id}", json={
                "page_num": 0, "x0": 70, "y0": 60, "x1": 300, "y1": 80,
                "text": "TEXTO NUEVO", "size": 14, "color": "#000000",
            })
            assert resp.status_code == 200
            assert self._bitmap(client, doc_id) != antes
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_mover_una_imagen_refresca_el_bitmap(self, client, tmp_path):
        doc_id = _pdf_with_image(client, tmp_path)
        try:
            antes = self._bitmap(client, doc_id)
            xref = client.get(f"/pdf/images/{doc_id}/0").json()["images"][0]["xref"]
            resp = client.post(f"/pdf/transform-image/{doc_id}", json={
                "page_num": 0, "xref": xref,
                "old": [100, 100, 200, 200], "new": [20, 20, 120, 120],
            })
            assert resp.status_code == 200
            assert self._bitmap(client, doc_id) != antes
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_los_metadatos_no_tocan_el_bitmap(self, client, open_doc):
        """La otra mitad de la decisión: lo que no se dibuja en la página no invalida."""
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        try:
            antes = self._bitmap(client, doc_id)
            assert client.post(f"/pdf/metadata/{doc_id}", json={"title": "Otro título"}).status_code == 200
            assert self._bitmap(client, doc_id) == antes
        finally:
            client.post(f"/pdf/close/{doc_id}")
