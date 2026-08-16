"""Casos de error (404/422) del nuevo manejo de excepciones y operaciones de
documento que no tenían cobertura: merge, split, compress, watermark, crop,
header/footer, numeración, reorder, duplicate, insert-blank, metadata,
replace-text y save-password."""
import os

import fitz


class TestNotFound:
    def test_ops_on_unknown_doc_are_404(self, client, tmp_path):
        out = str(tmp_path / "x.pdf")
        assert client.post("/pdf/rotate/no-such", json={"page_num": 0, "degrees": 90}).status_code == 404
        assert client.post(f"/pdf/compress/no-such?output_path={out}").status_code == 404
        assert client.post("/pdf/save/no-such").status_code == 404
        assert client.get("/pdf/compare-text/no-such-a/no-such-b").status_code == 404
        assert client.post("/pdf/duplicate-page/no-such?page_num=0").status_code == 404

    def test_deleted_file_behind_doc_is_404(self, client, pdf_factory):
        path = pdf_factory()
        info = client.post("/pdf/open", json={"file_path": path}).json()
        doc_id = info["doc_id"]
        # Forzar evicción del doc vivo y borrar el archivo: al reabrir → 404
        from app.services.pdf_service import pdf_service
        with pdf_service._lock:
            d = pdf_service._docs.pop(doc_id, None)
            if d is not None:
                d.close()
        os.remove(path)
        assert client.get(f"/pdf/page-image/{doc_id}/0").status_code == 404
        client.post(f"/pdf/close/{doc_id}")


class TestOpenValidation:
    def test_open_rejects_non_pdf(self, client, tmp_path):
        bad = tmp_path / "notas.txt"
        bad.write_text("hola")
        resp = client.post("/pdf/open", json={"file_path": str(bad)})
        assert resp.status_code == 422

    def test_open_rejects_missing_file(self, client):
        resp = client.post("/pdf/open", json={"file_path": "C:/no/existe.pdf"})
        assert resp.status_code == 422


class TestPathValidation:
    def test_merge_with_missing_source_is_422(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/merge/{info['doc_id']}", json={"source_path": "C:/no/existe.pdf"})
        assert resp.status_code == 422

    def test_merge_with_non_pdf_source_is_422(self, client, open_doc, tmp_path):
        info = open_doc()
        bad = tmp_path / "no-es-pdf.txt"
        bad.write_text("hola")
        resp = client.post(f"/pdf/merge/{info['doc_id']}", json={"source_path": str(bad)})
        assert resp.status_code == 422

    def test_insert_image_missing_file_is_422(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/insert-image/{info['doc_id']}", json={
            "page_num": 0, "x": 10, "y": 10, "width": 100, "height": 100,
            "image_path": "C:/no/existe.png",
        })
        assert resp.status_code == 422

    def test_export_excel_wrong_extension_is_422(self, client, open_doc, tmp_path):
        info = open_doc()
        resp = client.post(f"/pdf/export-excel/{info['doc_id']}?output_path={tmp_path / 'salida.txt'}")
        assert resp.status_code == 422

    def test_save_to_missing_directory_is_422(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/save/{info['doc_id']}?output_path=C:/directorio/inexistente/x.pdf")
        assert resp.status_code == 422

    def test_zoom_out_of_bounds_is_422(self, client, open_doc):
        info = open_doc()
        assert client.get(f"/pdf/page-image/{info['doc_id']}/0?zoom=1000").status_code == 422
        assert client.get(f"/pdf/page-image/{info['doc_id']}/0?zoom=0.001").status_code == 422


class TestDocumentOps:
    def test_merge_appends_pages(self, client, open_doc, pdf_factory):
        info = open_doc(pages=2)
        other = pdf_factory(pages=3)
        resp = client.post(f"/pdf/merge/{info['doc_id']}", json={"source_path": other})
        assert resp.status_code == 200
        assert client.get(f"/pdf/page-image/{info['doc_id']}/4").status_code == 200

    def test_split_creates_pdf_with_selected_pages(self, client, open_doc, tmp_path):
        info = open_doc(pages=5)
        out = str(tmp_path / "partes.pdf")
        resp = client.post(f"/pdf/split/{info['doc_id']}?output_path={out}", json={"pages": [0, 2]})
        assert resp.status_code == 200
        with fitz.open(resp.json()["temp_path"]) as d:
            assert len(d) == 2

    def test_compress_writes_output(self, client, open_doc, tmp_path):
        info = open_doc()
        out = str(tmp_path / "comprimido.pdf")
        assert client.post(f"/pdf/compress/{info['doc_id']}?output_path={out}").status_code == 200
        assert os.path.getsize(out) > 0

    def test_watermark_marks_dirty(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/watermark/{info['doc_id']}", json={
            "text": "CONFIDENCIAL", "color": "#ff0000", "fontsize": 40, "angle": 45, "opacity": 0.2,
        })
        assert resp.status_code == 200
        assert client.get(f"/pdf/dirty/{info['doc_id']}").json()["dirty"] is True
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/restore-document/{info['doc_id']}", json={"stash_id": stash_id}).status_code == 200
        text = client.get(f"/pdf/text/{info['doc_id']}/0").json()["text"]
        assert "CONFIDENCIAL" not in text

    def test_watermark_is_tiled_across_the_page(self, client, open_doc):
        """La marca de agua se repite por toda la pagina; con tiled=False vuelve a
        ser una sola linea centrada (la de antes)."""
        info = open_doc(pages=1)
        body = {"text": "CONFIDENCIAL", "fontsize": 30, "opacity": 0.2}
        assert client.post(f"/pdf/watermark/{info['doc_id']}", json=body).status_code == 200
        tiled = client.get(f"/pdf/text/{info['doc_id']}/0").json()["text"].count("CONFIDENCIAL")
        assert tiled > 3

        info2 = open_doc(pages=1)
        assert client.post(f"/pdf/watermark/{info2['doc_id']}", json={**body, "tiled": False}).status_code == 200
        single = client.get(f"/pdf/text/{info2['doc_id']}/0").json()["text"].count("CONFIDENCIAL")
        assert single == 1

    def test_crop_reduces_page_size(self, client, open_doc):
        info = open_doc(pages=1)
        resp = client.post(f"/pdf/crop/{info['doc_id']}", json={
            "page_num": 0, "top": 50, "right": 50, "bottom": 50, "left": 50,
        })
        assert resp.status_code == 200
        data = client.get(f"/pdf/page-info/{info['doc_id']}/0?zoom=1.0").json()
        assert data["original_width"] < 595
        stash_id = resp.json()["stash_id"]
        assert stash_id
        restored = client.post(f"/pdf/replace-page/{info['doc_id']}", json={"page_num": 0, "stash_id": stash_id})
        assert restored.status_code == 200
        back = client.get(f"/pdf/page-info/{info['doc_id']}/0?zoom=1.0").json()
        assert back["original_width"] >= data["original_width"]

    def test_header_footer(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/header-footer/{info['doc_id']}", json={
            "header": "Encabezado", "footer": "Pie", "fontsize": 9, "color": "#000000",
        })
        assert resp.status_code == 200

    def test_page_numbers_inserts_text(self, client, open_doc):
        info = open_doc(pages=2, text="")
        assert client.post(f"/pdf/page-numbers/{info['doc_id']}?prefix=DOC-&start=1").status_code == 200
        text = client.get(f"/pdf/text/{info['doc_id']}/0").json()["text"]
        assert "DOC-" in text

    def test_reorder_pages(self, client, open_doc):
        info = open_doc(pages=3)
        resp = client.post(f"/pdf/reorder/{info['doc_id']}", json={"new_order": [2, 0, 1]})
        assert resp.status_code == 200
        text = client.get(f"/pdf/text/{info['doc_id']}/0").json()["text"]
        assert "pagina 3" in text

    def test_duplicate_and_insert_blank(self, client, open_doc):
        info = open_doc(pages=2)
        assert client.post(f"/pdf/duplicate-page/{info['doc_id']}?page_num=0").status_code == 200
        assert client.post(f"/pdf/insert-blank/{info['doc_id']}?index=0").status_code == 200
        assert client.get(f"/pdf/page-image/{info['doc_id']}/3").status_code == 200

    def test_metadata_roundtrip(self, client, open_doc):
        info = open_doc()
        resp = client.post(f"/pdf/metadata/{info['doc_id']}", json={
            "title": "Mi título", "author": "Engell", "subject": "Pruebas", "keywords": "pdf,test",
        })
        assert resp.status_code == 200
        previous = resp.json()["previous"]
        assert client.get(f"/pdf/info/{info['doc_id']}").json()["title"] == "Mi título"
        undo = client.post(f"/pdf/metadata/{info['doc_id']}", json=previous)
        assert undo.status_code == 200
        assert undo.json()["previous"]["title"] == "Mi título"
        again = client.get(f"/pdf/info/{info['doc_id']}").json()
        assert (again["title"] or "") == (previous["title"] or "")

    def test_make_searchable_skips_pages_with_text(self, client, open_doc):
        info = open_doc(pages=1, text="ya hay texto")
        resp = client.post(f"/pdf/make-searchable/{info['doc_id']}?page=0")
        assert resp.status_code == 200
        body = resp.json()
        assert body["words"] == 0
        assert body["stash_id"] is None

    def test_form_field_roundtrip(self, client, tmp_path):
        path = tmp_path / "form.pdf"
        doc = fitz.open()
        page = doc.new_page()
        widget = fitz.Widget()
        widget.field_name = "nombre"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.rect = fitz.Rect(72, 72, 300, 100)
        page.add_widget(widget)
        doc.save(str(path))
        doc.close()
        info = client.post("/pdf/open", json={"file_path": str(path)}).json()
        resp = client.post(f"/pdf/widgets/{info['doc_id']}/0", json={"field_name": "nombre", "value": "Ana"})
        assert resp.status_code == 200
        assert resp.json()["previous"] == ""
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.get(f"/pdf/widgets/{info['doc_id']}/0").json()[0]["value"] == "Ana"
        assert client.post(f"/pdf/replace-page/{info['doc_id']}", json={"page_num": 0, "stash_id": stash_id}).status_code == 200
        assert client.get(f"/pdf/widgets/{info['doc_id']}/0").json()[0]["value"] == ""
        client.post(f"/pdf/close/{info['doc_id']}")

    def test_create_form_fields(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        text = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "field_name": "nombre",
            "x": 72, "y": 120, "width": 200, "height": 24,
        })
        assert text.status_code == 200, text.text
        assert text.json()["field_name"] == "nombre"
        assert text.json()["stash_id"]
        check = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "checkbox", "field_name": "ok",
            "x": 72, "y": 160, "width": 14, "height": 14,
        })
        assert check.status_code == 200
        combo = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "combo", "field_name": "ciudad",
            "x": 72, "y": 200, "width": 160, "height": 22,
            "options": ["CABA", "Rosario", "Córdoba"],
        })
        assert combo.status_code == 200
        radio = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "radio", "field_name": "sexo",
            "x": 72, "y": 240, "width": 16, "height": 16, "radio_value": "M",
        })
        assert radio.status_code == 200
        fields = {f["field_name"]: f for f in client.get(f"/pdf/widgets/{doc_id}/0").json()}
        assert "nombre" in fields
        assert fields["nombre"]["field_type"].lower().startswith("text")
        assert "ok" in fields
        assert "ciudad" in fields
        assert "CABA" in fields["ciudad"]["options"]
        dup = client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "field_name": "nombre",
            "x": 72, "y": 280, "width": 120, "height": 20,
        })
        assert dup.status_code == 200
        assert dup.json()["field_name"] == "nombre_2"
        stash_id = text.json()["stash_id"]
        assert client.post(f"/pdf/replace-page/{doc_id}", json={"page_num": 0, "stash_id": stash_id}).status_code == 200
        names = [f["field_name"] for f in client.get(f"/pdf/widgets/{doc_id}/0").json()]
        assert names == []

    def test_transform_form_field(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "field_name": "titulo",
            "x": 72, "y": 120, "width": 200, "height": 24,
        }).status_code == 200
        xref = client.get(f"/pdf/widgets/{doc_id}/0").json()[0]["xref"]
        moved = client.post(f"/pdf/widgets/{doc_id}/0/transform", json={
            "xref": xref, "x": 100, "y": 150, "width": 180, "height": 22,
        })
        assert moved.status_code == 200
        rect = client.get(f"/pdf/widgets/{doc_id}/0").json()[0]["rect"]
        assert abs(rect["x"] - 100) < 1
        assert abs(rect["y"] - 150) < 1
        deleted = client.post(f"/pdf/widgets/{doc_id}/0/transform", json={"xref": xref, "delete": True})
        assert deleted.status_code == 200
        assert deleted.json()["stash_id"]
        assert client.get(f"/pdf/widgets/{doc_id}/0").json() == []
        assert client.post(f"/pdf/replace-page/{doc_id}", json={
            "page_num": 0, "stash_id": deleted.json()["stash_id"],
        }).status_code == 200
        restored = client.get(f"/pdf/widgets/{doc_id}/0").json()
        assert len(restored) == 1
        assert restored[0]["field_name"] == "titulo"

    def test_replace_text(self, client, open_doc):
        info = open_doc(pages=1, text="palabraunica")
        resp = client.post(f"/pdf/replace-text/{info['doc_id']}", json={
            "query": "palabraunica", "replace": "cambiada", "page_num": 0,
            "case_sensitive": False, "replace_all": True,
        })
        assert resp.status_code == 200
        assert resp.json()["replaced"] >= 1
        stash_id = resp.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/replace-page/{info['doc_id']}", json={"page_num": 0, "stash_id": stash_id}).status_code == 200
        assert "palabraunica" in client.get(f"/pdf/text/{info['doc_id']}/0").json()["text"]

    def test_save_with_password_protects_file(self, client, open_doc, tmp_path):
        info = open_doc()
        out = str(tmp_path / "protegido.pdf")
        resp = client.post(f"/pdf/save-password/{info['doc_id']}", json={
            "output_path": out, "user_password": "clave123",
        })
        assert resp.status_code == 200
        with fitz.open(out) as d:
            assert d.needs_pass


class TestInfoEndpoint:
    def test_info_reflects_in_memory_merge(self, client, open_doc, pdf_factory):
        info = open_doc(pages=3)
        source = pdf_factory(pages=2)
        assert client.post(f"/pdf/merge/{info['doc_id']}", json={"source_path": source}).status_code == 200
        resp = client.get(f"/pdf/info/{info['doc_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["page_count"] == 5
        assert len(data["page_sizes"]) == 5

    def test_info_unknown_doc_is_404(self, client):
        assert client.get("/pdf/info/no-such-doc").status_code == 404


class TestReplaceCaseSensitive:
    def _make_doc(self, client, pdf_factory):
        import fitz
        import shutil
        path = pdf_factory(pages=1)
        doc = fitz.open(path)
        page = doc[0]
        page.insert_text((72, 200), "ZebRa uno", fontsize=12)
        page.insert_text((72, 240), "zebra dos", fontsize=12)
        doc.save(str(path) + ".tmp")
        doc.close()
        shutil.move(str(path) + ".tmp", path)
        resp = client.post("/pdf/open", json={"file_path": path})
        assert resp.status_code == 200
        return resp.json()["doc_id"]

    def test_case_sensitive_only_replaces_exact_match(self, client, pdf_factory):
        doc_id = self._make_doc(client, pdf_factory)
        try:
            r = client.post(f"/pdf/replace-text/{doc_id}", json={
                "query": "ZebRa", "replace": "Cebra", "case_sensitive": True, "replace_all": True,
            })
            assert r.status_code == 200
            assert r.json()["replaced"] == 1
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_case_insensitive_replaces_all(self, client, pdf_factory):
        doc_id = self._make_doc(client, pdf_factory)
        try:
            r = client.post(f"/pdf/replace-text/{doc_id}", json={
                "query": "zebra", "replace": "cebra", "case_sensitive": False, "replace_all": True,
            })
            assert r.status_code == 200
            assert r.json()["replaced"] == 2
        finally:
            client.post(f"/pdf/close/{doc_id}")
