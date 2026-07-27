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

    def test_replace_text(self, client, open_doc):
        info = open_doc(pages=1, text="palabraunica")
        resp = client.post(f"/pdf/replace-text/{info['doc_id']}", json={
            "query": "palabraunica", "replace": "cambiada", "page_num": 0,
            "case_sensitive": False, "replace_all": True,
        })
        assert resp.status_code == 200
        assert resp.json()["replaced"] >= 1

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
