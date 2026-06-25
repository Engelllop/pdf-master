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

    def test_redact_matches_removes_text(self, client, open_doc):
        info = open_doc(pages=1, text="secretosecreto")
        doc_id = info["doc_id"]
        resp = client.post(f"/pdf/redact-matches/{doc_id}?query=secretosecreto")
        assert resp.status_code == 200
        assert resp.json()["redacted"] >= 1
        text = client.get(f"/pdf/text/{doc_id}/0").json()["text"]
        assert "secretosecreto" not in text

    def test_redact_unknown_doc_is_404(self, client):
        resp = client.post("/pdf/redact/no-such", json={
            "page_num": 0, "x": 0, "y": 0, "width": 10, "height": 10,
        })
        assert resp.status_code == 404
