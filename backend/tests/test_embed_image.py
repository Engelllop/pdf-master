"""Las anotaciones de imagen SI se incrustan en el PDF (rama `image` de
embed_annotations, anadida en 28ce2e2). El aviso del frontend decia lo contrario,
asi que conviene tener la prueba que lo fija."""
import base64
import io

import fitz


def _png_data_url(color=(255, 0, 0), w=40, h=20) -> str:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, w, h))
    pix.set_rect(pix.irect, color)
    return "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode()


class TestEmbedImage:
    def _embed(self, client, doc_id, **extra):
        ann = {
            "id": "img-1", "type": "image", "page": 0,
            "x": 50, "y": 60, "width": 120, "height": 90,
            "imageData": _png_data_url(),
            **extra,
        }
        return client.post(f"/pdf/embed/{doc_id}", json={"annotations": [ann]})

    def test_la_imagen_queda_dentro_del_pdf(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        assert self._embed(client, info["doc_id"]).status_code == 200

        out = str(tmp_path / "con-imagen.pdf")
        assert client.post(f"/pdf/save/{info['doc_id']}?output_path={out}").status_code == 200

        # Se relee del disco: lo que importa es que sobreviva al guardado.
        with fitz.open(out) as saved:
            images = saved.load_page(0).get_images(full=True)
            assert len(images) == 1
            rects = saved.load_page(0).get_image_rects(images[0][0])
            assert rects, "la imagen no quedo colocada en la pagina"
            r = rects[0]
            assert abs(r.x0 - 50) < 2 and abs(r.y0 - 60) < 2
            assert abs(r.width - 120) < 2 and abs(r.height - 90) < 2

    def test_la_rotacion_libre_se_redondea_a_multiplos_de_90(self, client, open_doc):
        """insert_image solo rota en multiplos de 90; la app permite cualquier
        angulo. Redondear es la degradacion conocida — pero no debe fallar."""
        info = open_doc(pages=1)
        for rotation in (0, 37, 80, 135, 200, 359):
            resp = self._embed(client, info["doc_id"], rotation=rotation)
            assert resp.status_code == 200, f"rotacion {rotation}: {resp.text}"

    def test_un_data_url_corrupto_no_tumba_el_guardado(self, client, open_doc):
        info = open_doc(pages=1)
        ann = {
            "id": "img-mala", "type": "image", "page": 0, "x": 10, "y": 10,
            "width": 50, "height": 50, "imageData": "data:image/png;base64,no-es-base64",
        }
        assert client.post(f"/pdf/embed/{info['doc_id']}", json={"annotations": [ann]}).status_code == 200
