"""Los nueve endpoints que no aparecian en ningun test.

De los 66 del motor, estos nueve no los tocaba nada: tres escriben en el disco del
usuario (`create-blank`, `images-to-pdf`, `export-html`), dos reordenan la geometria
de las paginas (`rotate-all`, `rotate-pages`), y el resto son lectura. Un fallo en los
primeros no da un error: deja un archivo mal escrito en la carpeta de alguien.
"""
import fitz
import pytest
from PIL import Image


# --------------------------------------------------------------------------- escriben

class TestCrearEnBlanco:
    def test_crea_el_pdf_con_las_paginas_y_el_tamano_pedidos(self, client, tmp_path):
        destino = tmp_path / "nuevo.pdf"
        resp = client.post("/pdf/create-blank", json={
            "output_path": str(destino), "page_width": 300, "page_height": 500, "page_count": 3,
        })
        assert resp.status_code == 200, resp.text
        assert destino.exists()

        # Lo que dice la respuesta y lo que hay en el archivo tienen que coincidir: el
        # cliente abre la pestana con esos datos sin volver a preguntar.
        info = resp.json()
        assert info["page_count"] == 3
        with fitz.open(destino) as doc:
            assert doc.page_count == 3
            assert round(doc[0].rect.width) == 300
            assert round(doc[0].rect.height) == 500

    def test_los_valores_por_defecto_son_A4_de_una_pagina(self, client, tmp_path):
        destino = tmp_path / "a4.pdf"
        assert client.post("/pdf/create-blank", json={"output_path": str(destino)}).status_code == 200
        with fitz.open(destino) as doc:
            assert doc.page_count == 1
            assert round(doc[0].rect.width) == 595

    @pytest.mark.parametrize("ruta,motivo", [
        ("relativa.pdf", "ruta relativa"),
        ("nota.txt", "extension que no es pdf"),
    ])
    def test_rechaza_rutas_que_no_valen(self, client, tmp_path, ruta, motivo):
        # Una ruta relativa escribe donde el motor tenga el cwd, que en el exe
        # empaquetado es donde Windows lo dejo: nadie lo encuentra.
        destino = ruta if ruta == "relativa.pdf" else str(tmp_path / ruta)
        assert client.post("/pdf/create-blank", json={"output_path": destino}).status_code == 422, motivo

    def test_no_escribe_en_una_carpeta_que_no_existe(self, client, tmp_path):
        destino = tmp_path / "sin_crear" / "x.pdf"
        assert client.post("/pdf/create-blank", json={"output_path": str(destino)}).status_code == 422
        assert not destino.exists()


class TestImagenesAPdf:
    @staticmethod
    def _imagen(ruta, tamano=(120, 80), color=(200, 30, 30)):
        Image.new("RGB", tamano, color).save(ruta)
        return str(ruta)

    def test_una_pagina_por_imagen(self, client, tmp_path):
        imgs = [self._imagen(tmp_path / f"f{i}.png") for i in range(3)]
        destino = tmp_path / "album.pdf"
        resp = client.post("/pdf/images-to-pdf", json={"images": imgs, "output_path": str(destino)})
        assert resp.status_code == 200, resp.text
        with fitz.open(destino) as doc:
            assert doc.page_count == 3

    def test_respeta_la_proporcion_de_una_imagen_apaisada(self, client, tmp_path):
        # Una captura apaisada metida en una pagina vertical sale deformada, y de ahi
        # no se vuelve: la pagina tiene que salir apaisada tambien.
        img = self._imagen(tmp_path / "ancha.png", tamano=(400, 100))
        destino = tmp_path / "ancha.pdf"
        assert client.post("/pdf/images-to-pdf", json={"images": [img], "output_path": str(destino)}).status_code == 200
        with fitz.open(destino) as doc:
            r = doc[0].rect
            assert r.width > r.height
            assert r.width / r.height == pytest.approx(4.0, rel=0.1)

    def test_rechaza_un_archivo_que_no_es_imagen(self, client, tmp_path):
        falso = tmp_path / "nota.txt"
        falso.write_text("no soy una imagen", encoding="utf-8")
        destino = tmp_path / "x.pdf"
        assert client.post("/pdf/images-to-pdf", json={
            "images": [str(falso)], "output_path": str(destino),
        }).status_code == 422
        assert not destino.exists()

    def test_rechaza_una_imagen_que_no_existe(self, client, tmp_path):
        assert client.post("/pdf/images-to-pdf", json={
            "images": [str(tmp_path / "fantasma.png")], "output_path": str(tmp_path / "x.pdf"),
        }).status_code == 422

    def test_si_una_de_varias_no_vale_no_escribe_NADA(self, client, tmp_path):
        # Validar dentro del bucle y escribir despues: a medias dejaria un PDF con
        # parte de las imagenes y un 422, que es lo peor de los dos mundos.
        buena = self._imagen(tmp_path / "buena.png")
        destino = tmp_path / "mezcla.pdf"
        assert client.post("/pdf/images-to-pdf", json={
            "images": [buena, str(tmp_path / "fantasma.png")], "output_path": str(destino),
        }).status_code == 422
        assert not destino.exists()


class TestExportarHtml:
    def test_escribe_html_con_el_texto_de_la_pagina(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=2, text="Viga V-12")["doc_id"]
        destino = tmp_path / "salida.html"
        resp = client.post(f"/pdf/export-html/{doc_id}?output_path={destino}")
        assert resp.status_code == 200, resp.text
        contenido = destino.read_text(encoding="utf-8", errors="replace")
        assert "Viga V-12" in contenido

    def test_acepta_htm_ademas_de_html(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        destino = tmp_path / "salida.htm"
        assert client.post(f"/pdf/export-html/{doc_id}?output_path={destino}").status_code == 200

    def test_rechaza_otra_extension(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        destino = tmp_path / "salida.pdf"
        assert client.post(f"/pdf/export-html/{doc_id}?output_path={destino}").status_code == 422
        assert not destino.exists()

    def test_un_doc_id_que_no_existe_da_404(self, client, tmp_path):
        destino = tmp_path / "x.html"
        assert client.post(f"/pdf/export-html/no-existe?output_path={destino}").status_code == 404


# ------------------------------------------------------------------- cambian paginas

class TestRotarTodo:
    def test_gira_todas_las_paginas(self, client, open_doc):
        doc_id = open_doc(pages=3)["doc_id"]
        antes = client.get(f"/pdf/page-info/{doc_id}/0").json()

        resp = client.post(f"/pdf/rotate-all/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert resp.status_code == 200, resp.text

        # Girar 90 grados intercambia ancho y alto de TODAS.
        for p in range(3):
            info = client.get(f"/pdf/page-info/{doc_id}/{p}").json()
            assert round(info["width"]) == round(antes["height"])
            assert round(info["height"]) == round(antes["width"])

    def test_deja_el_documento_como_sin_guardar(self, client, open_doc):
        doc_id = open_doc(pages=2)["doc_id"]
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False
        client.post(f"/pdf/rotate-all/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True

    def test_un_doc_id_que_no_existe_da_404(self, client):
        assert client.post("/pdf/rotate-all/no-existe", json={"page_num": 0, "degrees": 90}).status_code == 404


class TestRotarAlgunas:
    def test_gira_solo_las_pedidas(self, client, open_doc):
        doc_id = open_doc(pages=4)["doc_id"]
        antes = client.get(f"/pdf/page-info/{doc_id}/0").json()

        resp = client.post(f"/pdf/rotate-pages/{doc_id}", json={"pages": [1, 3], "degrees": 90})
        assert resp.status_code == 200, resp.text

        for p in (1, 3):
            info = client.get(f"/pdf/page-info/{doc_id}/{p}").json()
            assert round(info["width"]) == round(antes["height"]), f"la {p} tenia que girar"
        for p in (0, 2):
            info = client.get(f"/pdf/page-info/{doc_id}/{p}").json()
            assert round(info["width"]) == round(antes["width"]), f"la {p} NO tenia que girar"

    def test_una_lista_vacia_no_toca_nada_y_no_revienta(self, client, open_doc):
        doc_id = open_doc(pages=2)["doc_id"]
        antes = client.get(f"/pdf/page-info/{doc_id}/0").json()
        assert client.post(f"/pdf/rotate-pages/{doc_id}", json={"pages": [], "degrees": 90}).status_code == 200
        assert client.get(f"/pdf/page-info/{doc_id}/0").json()["width"] == antes["width"]

    def test_un_indice_fuera_de_rango_no_tumba_el_motor(self, client, open_doc):
        # Un cliente con una lista vieja de paginas (borro una y no se refresco) no
        # puede matar el proceso: eso se lleva las marcas sin guardar de las demas
        # pestanas por delante.
        doc_id = open_doc(pages=2)["doc_id"]
        resp = client.post(f"/pdf/rotate-pages/{doc_id}", json={"pages": [99], "degrees": 90})
        assert resp.status_code in (200, 400, 404, 422), resp.text
        assert client.get(f"/pdf/health").json()["status"] == "ok"

    def test_un_doc_id_que_no_existe_da_404(self, client):
        assert client.post("/pdf/rotate-pages/no-existe", json={"pages": [0], "degrees": 90}).status_code == 404


class TestFotoDelDocumento:
    def test_devuelve_un_stash_id_sin_modificar_el_documento(self, client, open_doc):
        doc_id = open_doc(pages=2)["doc_id"]
        resp = client.post(f"/pdf/stash-document/{doc_id}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["stash_id"]
        # La foto es para deshacer: pedirla no puede ensuciar el documento.
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False

    def test_dos_fotos_dan_ids_distintos(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        uno = client.post(f"/pdf/stash-document/{doc_id}").json()["stash_id"]
        dos = client.post(f"/pdf/stash-document/{doc_id}").json()["stash_id"]
        assert uno != dos

    def test_un_doc_id_que_no_existe_da_404(self, client):
        assert client.post("/pdf/stash-document/no-existe").status_code == 404


# ----------------------------------------------------------------------------- leen

class TestTile:
    def test_devuelve_un_png_del_rectangulo_pedido(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        resp = client.get(f"/pdf/tile/{doc_id}/0?x0=0&y0=0&x1=100&y1=50&zoom=2.0")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "image/png"
        assert resp.content.startswith(b"\x89PNG")

    def test_el_tamano_del_png_sigue_al_rectangulo_y_al_zoom(self, client, open_doc):
        # El tile NO sale a 1 px por punto: la escala es `zoom * RENDER_DPI / 72`, que
        # es lo que lo hace nitido en zoom profundo. Lo que se fija aqui es la relacion
        # —doblar el zoom dobla el bitmap, y la proporcion es la del rectangulo— sin
        # atar el test al DPI, que es un ajuste.
        import io
        doc_id = open_doc(pages=1)["doc_id"]
        pedir = lambda zoom: Image.open(io.BytesIO(  # noqa: E731
            client.get(f"/pdf/tile/{doc_id}/0?x0=0&y0=0&x1=100&y1=50&zoom={zoom}").content))
        chico = pedir(1.0)
        grande = pedir(2.0)

        assert chico.width / chico.height == pytest.approx(2.0, rel=0.02), "proporcion del rectangulo"
        assert grande.width == pytest.approx(chico.width * 2, rel=0.02)
        assert grande.height == pytest.approx(chico.height * 2, rel=0.02)

    def test_un_zoom_imposible_lo_rechaza_la_validacion(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.get(f"/pdf/tile/{doc_id}/0?x0=0&y0=0&x1=10&y1=10&zoom=999").status_code == 422

    def test_una_pagina_que_no_existe_da_404(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.get(f"/pdf/tile/{doc_id}/99?x0=0&y0=0&x1=10&y1=10").status_code == 404


class TestTextoDeUnRecuadro:
    def test_devuelve_el_texto_que_cae_dentro(self, client, open_doc):
        # El texto de prueba va en (72, 72) con cuerpo 14.
        doc_id = open_doc(pages=1, text="Nivel de piso")["doc_id"]
        resp = client.post(f"/pdf/text-clip/{doc_id}/0", json={"x": 0, "y": 0, "width": 400, "height": 200})
        assert resp.status_code == 200, resp.text
        assert "Nivel de piso" in resp.json()["text"]

    def test_un_recuadro_vacio_devuelve_cadena_vacia_y_no_un_error(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        resp = client.post(f"/pdf/text-clip/{doc_id}/0", json={"x": 0, "y": 700, "width": 50, "height": 50})
        assert resp.status_code == 200
        assert resp.json()["text"].strip() == ""

    def test_un_doc_id_que_no_existe_da_404(self, client):
        assert client.post("/pdf/text-clip/no-existe/0", json={
            "x": 0, "y": 0, "width": 10, "height": 10,
        }).status_code == 404


class TestOcrDisponible:
    def test_contesta_sin_token_y_con_un_booleano(self, client):
        # El cliente lo consulta para decidir si ensena las herramientas de OCR o el
        # aviso de "instala tesseract": si devolviera algo raro, se quedaria sin las
        # dos cosas.
        resp = client.get("/pdf/ocr-available")
        assert resp.status_code == 200
        assert isinstance(resp.json()["available"], bool)
