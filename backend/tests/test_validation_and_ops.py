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

    def test_save_to_relative_path_is_422(self, client, open_doc):
        """El motor empaquetado corre con el cwd que le deje Windows: una ruta
        relativa no escribe al lado del PDF, escribe donde nadie la encuentra."""
        info = open_doc()
        resp = client.post(f"/pdf/save/{info['doc_id']}?output_path=salida.pdf")
        assert resp.status_code == 422

    def test_null_byte_in_path_is_422(self, client, open_doc, tmp_path):
        """Con un nulo, `open()` levanta ValueError (500 sin explicacion) y las APIs
        de C cortan la cadena despues de la extension ya validada."""
        info = open_doc()
        destino = f"{tmp_path / 'x.pdf'}{chr(0)}.exe"
        resp = client.post(f"/pdf/save/{info['doc_id']}", params={"output_path": destino})
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

    # Marca de agua, encabezado/pie y numeración se aplicaban SIEMPRE al documento
    # entero. En un juego de 60 láminas eso puede ser justo lo que no querés.
    def test_watermark_solo_en_las_paginas_pedidas(self, client, open_doc):
        info = open_doc(pages=3, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/watermark/{doc_id}", json={
            "text": "BORRADOR", "tiled": False, "pages": [1],
        }).status_code == 200
        paginas = [client.get(f"/pdf/text/{doc_id}/{p}").json()["text"] for p in range(3)]
        assert "BORRADOR" not in paginas[0]
        assert "BORRADOR" in paginas[1]
        assert "BORRADOR" not in paginas[2]

    def test_header_footer_solo_en_las_paginas_pedidas(self, client, open_doc):
        info = open_doc(pages=3, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/header-footer/{doc_id}", json={
            "header": "Encabezado", "pages": [0, 2],
        }).status_code == 200
        paginas = [client.get(f"/pdf/text/{doc_id}/{p}").json()["text"] for p in range(3)]
        assert "Encabezado" in paginas[0]
        assert "Encabezado" not in paginas[1]
        assert "Encabezado" in paginas[2]

    def test_page_numbers_solo_en_las_paginas_pedidas(self, client, open_doc):
        """Y el número es el de la página en el documento, no el de la enésima sellada:
        numerar solo la 2 y la 3 tiene que dar 2 y 3."""
        info = open_doc(pages=3, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/page-numbers/{doc_id}?pages=1&pages=2").status_code == 200
        paginas = [client.get(f"/pdf/text/{doc_id}/{p}").json()["text"] for p in range(3)]
        assert "/" not in paginas[0]
        assert "2 / 3" in paginas[1]
        assert "3 / 3" in paginas[2]

    def test_rango_fuera_del_documento_se_ignora(self, client, open_doc):
        """El rango lo escribe el usuario a mano: un índice de más no puede reventar."""
        info = open_doc(pages=2, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/watermark/{doc_id}", json={
            "text": "BORRADOR", "tiled": False, "pages": [0, 99, -3],
        }).status_code == 200
        assert "BORRADOR" in client.get(f"/pdf/text/{doc_id}/0").json()["text"]
        assert "BORRADOR" not in client.get(f"/pdf/text/{doc_id}/1").json()["text"]

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


class TestCopiaDeSeguridad:
    """La copia .bak es la red del usuario al sobrescribir un archivo entregado.
    `save_with_password` y `remove_password` ni la miraban —el ajuste estaba activado
    y no había copia— y si el guardado fallaba dejaban su temporal tirado EN LA
    CARPETA DEL PLANO, con el documento dentro."""

    def test_guardar_con_contrasena_hace_la_copia_bak(self, client, open_doc, pdf_factory):
        info = open_doc()
        destino = pdf_factory(pages=1)  # ya existe: sobrescribirlo debe dejar .bak
        resp = client.post(f"/pdf/save-password/{info['doc_id']}", json={
            "output_path": destino, "user_password": "clave123", "backup": True,
        })
        assert resp.status_code == 200
        assert resp.json()["backup_failed"] is False
        assert os.path.exists(destino + ".bak")

    def test_quitar_contrasena_hace_la_copia_bak(self, client, open_doc, pdf_factory):
        info = open_doc()
        destino = pdf_factory(pages=1)
        resp = client.post(f"/pdf/remove-password/{info['doc_id']}?output_path={destino}&backup=true")
        assert resp.status_code == 200
        assert os.path.exists(destino + ".bak")

    def test_si_la_copia_falla_lo_dice_en_vez_de_callarse(self, client, open_doc, pdf_factory, monkeypatch):
        """Se guarda igual (el usuario pidió guardar), pero sabiendo que no hay red."""
        import shutil as _shutil
        info = open_doc()
        destino = pdf_factory(pages=1)

        def copia_imposible(*_a, **_k):
            raise OSError("disco lleno")

        monkeypatch.setattr(_shutil, "copy2", copia_imposible)
        resp = client.post(f"/pdf/save/{info['doc_id']}?output_path={destino}&backup=true")
        assert resp.status_code == 200
        assert resp.json()["backup_failed"] is True
        assert not os.path.exists(destino + ".bak")

    def test_un_guardado_fallido_no_deja_temporales_en_la_carpeta(self, client, open_doc, pdf_factory, monkeypatch):
        info = open_doc()
        destino = pdf_factory(pages=1)
        carpeta = os.path.dirname(destino)
        antes = set(os.listdir(carpeta))

        def guardado_roto(*_a, **_k):
            raise RuntimeError("fallo al escribir")

        monkeypatch.setattr(fitz.Document, "save", guardado_roto)
        resp = client.post(f"/pdf/save-password/{info['doc_id']}", json={
            "output_path": destino, "user_password": "clave123",
        })
        assert resp.status_code == 400
        assert set(os.listdir(carpeta)) == antes


class TestEscriturasAtomicas:
    """`compress`, `split` y `images-to-pdf` escribían directo sobre la ruta elegida:
    el cuadro de guardar deja elegir un PDF que ya existe (el propio original), y un
    fallo a mitad de escritura lo dejaba truncado."""

    def test_un_compress_fallido_no_toca_el_archivo_que_ya_estaba(self, client, open_doc, pdf_factory, monkeypatch):
        info = open_doc()
        destino = pdf_factory(pages=1)
        antes = open(destino, 'rb').read()
        carpeta = os.path.dirname(destino)
        listado = set(os.listdir(carpeta))

        def guardado_roto(*_a, **_k):
            raise RuntimeError("fallo al escribir")

        monkeypatch.setattr(fitz.Document, "save", guardado_roto)
        assert client.post(f"/pdf/compress/{info['doc_id']}?output_path={destino}").status_code == 400
        assert open(destino, 'rb').read() == antes
        assert set(os.listdir(carpeta)) == listado

    def test_split_sin_paginas_validas_avisa_en_vez_de_reventar(self, client, open_doc, tmp_path):
        """Antes intentaba guardar un PDF de cero páginas: PyMuPDF lo rechaza y salía
        un 500 sin explicación."""
        info = open_doc(pages=2)
        out = str(tmp_path / "extraido.pdf")
        resp = client.post(f"/pdf/split/{info['doc_id']}?output_path={out}", json={"pages": [50, 99]})
        assert resp.status_code == 400
        assert not os.path.exists(out)

    def test_exportar_txt_fallido_no_borra_el_archivo_que_ya_estaba(self, client, open_doc, tmp_path, monkeypatch):
        """`open(output_path, "w")` truncaba el destino ANTES de escribir una letra:
        si fallaba en la primera página, donde había un documento quedaba un vacío."""
        info = open_doc(pages=2)
        destino = tmp_path / "notas.txt"
        destino.write_text("contenido que ya estaba", encoding="utf-8")

        def texto_roto(*_a, **_k):
            raise RuntimeError("fallo leyendo la página")

        monkeypatch.setattr(fitz.Page, "get_text", texto_roto)
        resp = client.post(f"/pdf/export-txt/{info['doc_id']}?output_path={destino}")
        assert resp.status_code in (400, 500)
        assert destino.read_text(encoding="utf-8") == "contenido que ya estaba"
        assert not any(p.suffix == ".txt" and p != destino for p in tmp_path.iterdir())

    def test_exportar_txt_normal_escribe_el_texto(self, client, open_doc, tmp_path):
        info = open_doc(pages=2)
        destino = tmp_path / "salida.txt"
        assert client.post(f"/pdf/export-txt/{info['doc_id']}?output_path={destino}").status_code == 200
        assert "Hola PDF Master" in destino.read_text(encoding="utf-8")

    def test_split_normal_sigue_funcionando(self, client, open_doc, tmp_path):
        info = open_doc(pages=3)
        out = str(tmp_path / "extraido.pdf")
        resp = client.post(f"/pdf/split/{info['doc_id']}?output_path={out}", json={"pages": [0, 2]})
        assert resp.status_code == 200
        with fitz.open(out) as d:
            assert len(d) == 2


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


class TestInsertarEnBlanco:
    def test_la_pagina_en_blanco_copia_el_tamano_del_plano(self, client, open_doc):
        """Era A4 fijo: insertar una hoja en un juego de planos metía una A4 diminuta
        entre láminas grandes."""
        doc_id = open_doc(pages=2, width=1000, height=700)["doc_id"]
        assert client.post(f"/pdf/insert-blank/{doc_id}?index=1").status_code == 200

        info = client.get(f"/pdf/info/{doc_id}").json()
        assert info["page_count"] == 3
        nueva = info["page_sizes"][1]
        assert round(nueva["width"]) == 1000
        assert round(nueva["height"]) == 700

    def test_con_medidas_explicitas_manda_lo_pedido(self, client, open_doc):
        doc_id = open_doc(pages=1, width=1000, height=700)["doc_id"]
        assert client.post(f"/pdf/insert-blank/{doc_id}?index=1&width=595&height=842").status_code == 200
        info = client.get(f"/pdf/info/{doc_id}").json()
        assert round(info["page_sizes"][1]["width"]) == 595


class TestExportarWord:
    def test_con_output_path_escribe_el_docx(self, client, open_doc, tmp_path):
        """Word era la única exportación que solo devolvía base64 y se bajaba sola a la
        carpeta de descargas."""
        doc_id = open_doc(pages=2)["doc_id"]
        out = str(tmp_path / "salida.docx")
        res = client.get(f"/pdf/export-word/{doc_id}?output_path={out}")
        assert res.status_code == 200
        assert res.json()["output_path"] == out
        import os
        assert os.path.getsize(out) > 0

    def test_sin_output_path_sigue_devolviendo_base64(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        res = client.get(f"/pdf/export-word/{doc_id}")
        assert res.status_code == 200
        assert res.json()["data_base64"]


class TestGuardarPaginaComoImagen:
    def test_escribe_el_png_donde_se_pide(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        out = str(tmp_path / "pagina.png")
        res = client.post(f"/pdf/save-page-image/{doc_id}/0?output_path={out}&zoom=1.0")
        assert res.status_code == 200
        with open(out, "rb") as fh:
            assert fh.read(8) == b"\x89PNG\r\n\x1a\n"

    def test_rechaza_una_extension_que_no_sea_png(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        out = str(tmp_path / "pagina.exe")
        assert client.post(f"/pdf/save-page-image/{doc_id}/0?output_path={out}").status_code == 422


class TestComprimir:
    def test_devuelve_los_tamanos_para_saber_si_valio_la_pena(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=3)["doc_id"]
        out = str(tmp_path / "comprimido.pdf")
        res = client.post(f"/pdf/compress/{doc_id}?output_path={out}")
        assert res.status_code == 200
        cuerpo = res.json()
        assert cuerpo["size_before"] > 0
        assert cuerpo["size_after"] > 0
        import os
        assert cuerpo["size_after"] == os.path.getsize(out)


class TestExportMediciones:
    """La escala va por fila: un juego de planos mezcla escalas y una sola en el título
    no dice con cuál se tomó cada cota."""

    def test_csv_incluye_la_columna_de_escala(self, client, tmp_path):
        out = str(tmp_path / "mediciones.csv")
        resp = client.post("/pdf/export-measurements", json={
            "output_path": out,
            "title": "plano.pdf — varias escalas (ver columna)",
            "rows": [
                {"page": "1", "tipo": "Distancia", "etiqueta": "2.50 m", "valor": "2.50",
                 "unidad": "m", "escala": "1 m = 10.00 pt"},
                {"page": "3", "tipo": "Distancia", "etiqueta": "0.40 m", "valor": "0.40",
                 "unidad": "m", "escala": "1 m = 50.00 pt"},
                {"page": "", "tipo": "Conteo (circle)", "etiqueta": "Luminarias", "valor": "12",
                 "unidad": "uds", "escala": ""},
            ],
        })
        assert resp.status_code == 200
        contenido = open(out, encoding="utf-8-sig").read()
        assert "Escala" in contenido
        assert "1 m = 10.00 pt" in contenido
        assert "1 m = 50.00 pt" in contenido

    def test_una_fila_sin_escala_no_revienta(self, client, tmp_path):
        """Filas de versiones anteriores (o los conteos) no traen el campo."""
        out = str(tmp_path / "sin-escala.csv")
        resp = client.post("/pdf/export-measurements", json={
            "output_path": out, "title": "",
            "rows": [{"page": "1", "tipo": "Distancia", "etiqueta": "x", "valor": "1", "unidad": "m"}],
        })
        assert resp.status_code == 200
        assert os.path.exists(out)


class TestTextoFueraDeLatin1:
    """Los tipos base de PDF solo cubren latin-1: al estampar, una raya «—», un «→» o un
    «✔» DESAPARECÍAN sin aviso (el «—» de la cabecera del propio resumen, incluido)."""

    def test_el_resumen_de_marcas_no_pierde_los_caracteres(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        out = str(tmp_path / "resumen.pdf")
        anns = {"annotations": [{
            "id": "n1", "type": "note", "page": 0, "x": 40, "y": 40,
            "text": "cota — con ✔ y → 12", "author": "Ramírez",
            "replies": [{"id": "r1", "author": "Engell", "text": "ok → rev C", "at": 1785000000000}],
        }]}
        resp = client.post(f"/pdf/markup-summary/{info['doc_id']}?output_path={out}", json=anns)
        assert resp.status_code == 200
        with fitz.open(out) as d:
            t = d[0].get_text()
        # Transliterados, no desaparecidos.
        assert "cota - con v y -> 12" in t
        assert "ok -> rev C" in t
        # Y los acentos, que sí caben en latin-1, se conservan tal cual.
        assert "Ramírez" in t

    def test_la_marca_de_agua_tampoco(self, client, open_doc, tmp_path):
        info = open_doc(pages=1, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/watermark/{doc_id}", json={
            "text": "BORRADOR — no construir", "tiled": False,
        }).status_code == 200
        out = str(tmp_path / "agua.pdf")
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        with fitz.open(out) as d:
            assert "BORRADOR - no construir" in d[0].get_text()

    def test_el_encabezado_tampoco(self, client, open_doc, tmp_path):
        info = open_doc(pages=1, text="")
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/header-footer/{doc_id}", json={"header": "Rev C — 08/27/2026"}).status_code == 200
        out = str(tmp_path / "encabezado.pdf")
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        with fitz.open(out) as d:
            assert "Rev C - 08/27/2026" in d[0].get_text()
