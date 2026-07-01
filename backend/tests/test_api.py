import concurrent.futures
import json
import os

import pytest

from app.services.pdf_service import pdf_service


class TestOpenAndRender:
    def test_open_returns_info(self, open_doc):
        info = open_doc(pages=3)
        assert info["page_count"] == 3
        assert len(info["page_sizes"]) == 3
        assert info["page_sizes"][0]["width"] == 595

    def test_open_missing_file_is_400(self, client):
        resp = client.post("/pdf/open", json={"file_path": "C:/no/existe.pdf"})
        assert resp.status_code == 400

    def test_protected_pdf_needs_password(self, client, tmp_path):
        import fitz
        path = str(tmp_path / "protegido.pdf")
        doc = fitz.open()
        doc.new_page()
        doc.save(path, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secreto")
        doc.close()
        assert client.post("/pdf/open", json={"file_path": path}).status_code == 401
        assert client.post("/pdf/open", json={"file_path": path, "password": "mal"}).status_code == 401
        resp = client.post("/pdf/open", json={"file_path": path, "password": "secreto"})
        assert resp.status_code == 200
        client.post(f"/pdf/close/{resp.json()['doc_id']}")

    def test_page_image_is_png(self, client, open_doc):
        info = open_doc()
        resp = client.get(f"/pdf/page-image/{info['doc_id']}/0?zoom=1.0")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_page_image_out_of_range_is_404(self, client, open_doc):
        info = open_doc(pages=2)
        assert client.get(f"/pdf/page-image/{info['doc_id']}/99").status_code == 404

    def test_dead_doc_id_is_404(self, client):
        assert client.get("/pdf/page-image/no-such-doc/0").status_code == 404

    def test_render_cap_for_huge_pages(self, client, open_doc):
        info = open_doc(pages=1, width=3024, height=2160)
        resp = client.get(f"/pdf/page-info/{info['doc_id']}/0?zoom=1.0")
        data = resp.json()
        assert max(data["width"], data["height"]) <= 3000

    def test_thumbnail_capped(self, client, open_doc):
        info = open_doc(pages=1, width=3024, height=2160)
        resp = client.get(f"/pdf/thumbnail/{info['doc_id']}/0")
        data = resp.json()
        assert max(data["width"], data["height"]) <= 300


class TestConcurrency:
    """v1.2.7: accesos concurrentes a fitz causaban segfault del proceso.
    Reproduce la carga real: renders + widgets + text + thumbnails a la vez."""

    def test_concurrent_mixed_requests_do_not_crash(self, client, open_doc):
        infos = [open_doc(pages=4) for _ in range(3)]

        def hit(i):
            info = infos[i % len(infos)]
            doc_id = info["doc_id"]
            page = i % 4
            paths = [
                f"/pdf/page-image/{doc_id}/{page}?zoom=1.5",
                f"/pdf/widgets/{doc_id}/{page}",
                f"/pdf/text/{doc_id}/{page}",
                f"/pdf/thumbnail/{doc_id}/{page}",
            ]
            return client.get(paths[i % 4]).status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(hit, range(88)))
        assert all(code == 200 for code in results)

    def test_health_responds(self, client):
        assert client.get("/pdf/health").json() == {"status": "ok"}


class TestLru:
    def test_eviction_reopens_from_disk(self, client, open_doc):
        pdf_service._max_live_docs = 2
        infos = [open_doc(pages=1) for _ in range(4)]
        live = sum(1 for i in infos if i["doc_id"] in pdf_service._docs)
        assert live <= 2
        for info in infos:
            resp = client.get(f"/pdf/page-image/{info['doc_id']}/0")
            assert resp.status_code == 200

    def test_dirty_doc_never_evicted(self, client, open_doc):
        pdf_service._max_live_docs = 2
        dirty = open_doc(pages=1)
        client.post(f"/pdf/rotate/{dirty['doc_id']}", json={"page_num": 0, "degrees": 90})
        assert client.get(f"/pdf/dirty/{dirty['doc_id']}").json()["dirty"] is True
        for _ in range(4):
            open_doc(pages=1)
        assert dirty["doc_id"] in pdf_service._docs


class TestAnnotations:
    def test_save_and_load_roundtrip(self, client, open_doc):
        info = open_doc()
        anns = {"annotations": [{
            "id": "a1", "type": "rect", "page": 0,
            "x": 10, "y": 20, "width": 100, "height": 50, "color": "#ff0000",
        }]}
        assert client.post(f"/pdf/annotations/{info['doc_id']}", json=anns).status_code == 200
        sidecar = info["file_path"] + ".pdfmaster.json"
        assert os.path.exists(sidecar)
        loaded = client.get(f"/pdf/annotations/{info['doc_id']}").json()
        assert loaded["annotations"][0]["id"] == "a1"

    def test_corrupt_sidecar_returns_empty(self, client, open_doc):
        info = open_doc()
        with open(info["file_path"] + ".pdfmaster.json", "w") as f:
            f.write("{corrupto")
        loaded = client.get(f"/pdf/annotations/{info['doc_id']}").json()
        assert loaded["annotations"] == []

    def test_embed_with_fontsize(self, client, open_doc):
        info = open_doc()
        anns = {"annotations": [{
            "id": "t1", "type": "text", "page": 0,
            "x": 50, "y": 50, "text": "nota\nmultilinea",
            "fontSize": 18, "fontFamily": "helv", "color": "#0000ff",
        }]}
        resp = client.post(f"/pdf/embed/{info['doc_id']}", json=anns)
        assert resp.status_code == 200

    def test_embed_with_stroke_style_opacity_fill(self, client, open_doc):
        info = open_doc()
        anns = {"annotations": [
            {"id": "r1", "type": "rect", "page": 0, "x": 10, "y": 10, "width": 80, "height": 40,
             "color": "#ff0000", "lineWidth": 4, "lineStyle": "dashed", "opacity": 0.6,
             "fillColor": "#00ff00", "fillOpacity": 0.25},
            {"id": "c1", "type": "circle", "page": 0, "x": 100, "y": 10, "width": 50, "height": 50,
             "color": "#0000ff", "lineWidth": 1.5, "lineStyle": "dotted", "opacity": 0.8},
            {"id": "h1", "type": "highlight", "page": 0, "x": 10, "y": 80, "width": 120, "height": 14,
             "color": "#fbbf24", "opacity": 0.3},
            {"id": "a1", "type": "arrow", "page": 0, "x": 10, "y": 120, "width": 60, "height": 30,
             "color": "#000000", "lineWidth": 3, "lineStyle": "dashed", "opacity": 0.5},
        ]}
        resp = client.post(f"/pdf/embed/{info['doc_id']}", json=anns)
        assert resp.status_code == 200
        assert client.get(f"/pdf/dirty/{info['doc_id']}").json()["dirty"] is True

    def test_embed_draw_and_signature_points(self, client, open_doc):
        # Regresión: points llegan como dicts del JSON; p.x crasheaba con
        # AttributeError y el guardado con dibujo libre/firma devolvía 500.
        info = open_doc()
        anns = {"annotations": [
            {"id": "d1", "type": "draw", "page": 0, "x": 10, "y": 10,
             "color": "#ff0000", "lineWidth": 2,
             "points": [{"x": 10, "y": 10}, {"x": 30, "y": 25}, {"x": 50, "y": 12}]},
            {"id": "f1", "type": "signature", "page": 0, "x": 60, "y": 60,
             "points": [{"x": 60, "y": 60}, {"x": 80, "y": 70}, {"x": 95, "y": 58}]},
        ]}
        resp = client.post(f"/pdf/embed/{info['doc_id']}", json=anns)
        assert resp.status_code == 200

    def test_embed_count_marks(self, client, open_doc):
        info = open_doc()
        anns = {"annotations": [
            {"id": "n1", "type": "count", "page": 0, "x": 40, "y": 40,
             "color": "#ef4444", "text": "Luminarias"},
            {"id": "n2", "type": "count", "page": 0, "x": 90, "y": 40,
             "color": "#ef4444", "text": "Luminarias", "opacity": 0.8},
        ]}
        resp = client.post(f"/pdf/embed/{info['doc_id']}", json=anns)
        assert resp.status_code == 200
        assert client.get(f"/pdf/dirty/{info['doc_id']}").json()["dirty"] is True

    def test_export_measurements_csv_and_xlsx(self, client, tmp_path):
        rows = [
            {"page": "1", "tipo": "Distancia", "etiqueta": "muro A", "valor": "12.50", "unidad": "m"},
            {"page": "", "tipo": "Conteo (total)", "etiqueta": "Luminarias", "valor": "8", "unidad": "uds"},
        ]
        for ext in ("csv", "xlsx"):
            out = str(tmp_path / f"mediciones.{ext}")
            resp = client.post("/pdf/export-measurements", json={
                "output_path": out, "title": "plano.pdf — escala: 1 m = 28.35 pt", "rows": rows,
            })
            assert resp.status_code == 200, resp.text
            assert os.path.getsize(out) > 0
        # extensión no permitida
        resp = client.post("/pdf/export-measurements", json={
            "output_path": str(tmp_path / "m.txt"), "rows": rows,
        })
        assert resp.status_code == 422

    def test_embed_image_annotation(self, client, open_doc):
        import base64 as b64
        # PNG 1x1 rojo
        png = b64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        data_url = "data:image/png;base64," + b64.b64encode(png).decode()
        anns = {"annotations": [{
            "id": "i1", "type": "image", "page": 0, "x": 30, "y": 30,
            "width": 100, "height": 80, "imageData": data_url, "rotation": 87,
        }]}
        info = open_doc()
        resp = client.post(f"/pdf/embed/{info['doc_id']}", json=anns)
        assert resp.status_code == 200, resp.text
        assert client.get(f"/pdf/dirty/{info['doc_id']}").json()["dirty"] is True

    def test_xfdf_roundtrip(self, client, open_doc, tmp_path):
        info = open_doc()
        out = str(tmp_path / "marcas.xfdf")
        anns = {"annotations": [
            {"id": "h1", "type": "highlight", "page": 0, "x": 10, "y": 20, "width": 100, "height": 14, "color": "#fbbf24"},
            {"id": "r1", "type": "rect", "page": 0, "x": 50, "y": 60, "width": 80, "height": 40, "color": "#ff0000", "fillColor": "#00ff00"},
            {"id": "a1", "type": "arrow", "page": 0, "x": 10, "y": 100, "width": 60, "height": 30, "color": "#0000ff"},
            {"id": "d1", "type": "draw", "page": 0, "x": 10, "y": 10, "color": "#111111",
             "points": [{"x": 10, "y": 10}, {"x": 30, "y": 25}, {"x": 50, "y": 12}]},
            {"id": "n1", "type": "note", "page": 0, "x": 200, "y": 200, "text": "revisar esto", "color": "#fbbf24"},
            {"id": "c1", "type": "count", "page": 0, "x": 300, "y": 300, "text": "Luminarias", "color": "#ef4444"},
        ]}
        resp = client.post(f"/pdf/export-xfdf/{info['doc_id']}?output_path={out}", json=anns)
        assert resp.status_code == 200, resp.text
        assert os.path.getsize(out) > 0

        resp = client.post(f"/pdf/import-xfdf/{info['doc_id']}", json={"file_path": out})
        assert resp.status_code == 200, resp.text
        imported = resp.json()["annotations"]
        types = sorted(a["type"] for a in imported)
        assert types == sorted(["highlight", "rect", "arrow", "draw", "note", "count"])
        # El flip vertical debe ser involutivo: la Y original se conserva
        h = next(a for a in imported if a["type"] == "highlight")
        assert abs(h["x"] - 10) < 0.01 and abs(h["y"] - 20) < 0.01
        assert abs(h["width"] - 100) < 0.01 and abs(h["height"] - 14) < 0.01
        c = next(a for a in imported if a["type"] == "count")
        assert c["text"] == "Luminarias"
        assert abs(c["x"] - 300) < 0.01 and abs(c["y"] - 300) < 0.01
        n = next(a for a in imported if a["type"] == "note")
        assert n["text"] == "revisar esto"

    def test_sidecar_preserves_stroke_and_rotation(self, client, open_doc):
        info = open_doc()
        anns = {"annotations": [{
            "id": "s1", "type": "rect", "page": 0, "x": 1, "y": 2, "width": 30, "height": 30,
            "color": "#ff0000", "lineWidth": 5, "lineStyle": "dotted", "opacity": 0.4,
            "fillColor": "#123456", "fillOpacity": 0.2, "rotation": 45,
        }]}
        assert client.post(f"/pdf/annotations/{info['doc_id']}", json=anns).status_code == 200
        loaded = client.get(f"/pdf/annotations/{info['doc_id']}").json()["annotations"][0]
        assert loaded["lineStyle"] == "dotted"
        assert loaded["lineWidth"] == 5
        assert loaded["opacity"] == 0.4
        assert loaded["fillColor"] == "#123456"
        assert loaded["rotation"] == 45


class TestDocumentOps:
    def test_rotate_marks_dirty_and_save_clears(self, client, open_doc):
        info = open_doc()
        doc_id = info["doc_id"]
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True
        resp = client.post(f"/pdf/save/{doc_id}")
        assert resp.status_code == 200
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False

    def test_delete_pages(self, client, open_doc):
        info = open_doc(pages=3)
        resp = client.post(f"/pdf/delete-pages/{info['doc_id']}", json={"pages": [1]})
        assert resp.status_code == 200
        assert client.get(f"/pdf/page-image/{info['doc_id']}/2").status_code == 404

    def test_search_finds_text(self, client, open_doc):
        info = open_doc(pages=2, text="NeedleUnico")
        results = client.get(f"/pdf/search/{info['doc_id']}", params={"query": "NeedleUnico"}).json()
        assert len(results) == 2

    def test_text_endpoint_returns_blocks_and_text(self, client, open_doc):
        info = open_doc(text="ContenidoVisible")
        data = client.get(f"/pdf/text/{info['doc_id']}/0").json()
        assert "ContenidoVisible" in data["text"]
        assert isinstance(data["blocks"], list)

    def test_snap_points_from_vector_content(self, client, tmp_path, open_doc):
        import fitz
        path = str(tmp_path / "plano.pdf")
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_line(fitz.Point(100, 100), fitz.Point(300, 100))
        page.draw_rect(fitz.Rect(50, 200, 150, 300))
        doc.save(path)
        doc.close()
        from app.services.pdf_service import pdf_service
        resp_open = client.post("/pdf/open", json={"file_path": path})
        doc_id = resp_open.json()["doc_id"]
        try:
            data = client.get(f"/pdf/snap-points/{doc_id}/0").json()
            pts = {(p["x"], p["y"]) for p in data["points"]}
            assert (100.0, 100.0) in pts and (300.0, 100.0) in pts
            assert (200.0, 100.0) in pts  # punto medio de la línea
            assert (50.0, 200.0) in pts and (150.0, 300.0) in pts  # esquinas del rect
        finally:
            client.post(f"/pdf/close/{doc_id}")

    def test_snap_points_dead_doc_is_404(self, client):
        assert client.get("/pdf/snap-points/no-such/0").status_code == 404

    def test_close_releases_doc(self, client, open_doc):
        info = open_doc()
        assert client.post(f"/pdf/close/{info['doc_id']}").status_code == 200
        assert client.get(f"/pdf/page-image/{info['doc_id']}/0").status_code == 404

    def test_open_does_not_lock_file_on_disk(self, client, pdf_factory):
        """Bug 'el archivo está en uso' al eliminar: abrir por stream no debe pinear
        el archivo en disco, así que puede borrarse aunque el doc siga abierto."""
        path = pdf_factory(pages=1)
        info = client.post("/pdf/open", json={"file_path": path}).json()
        assert client.get(f"/pdf/page-image/{info['doc_id']}/0").status_code == 200
        os.remove(path)  # en Windows fallaba con PermissionError antes del fix
        assert not os.path.exists(path)
        client.post(f"/pdf/close/{info['doc_id']}")
