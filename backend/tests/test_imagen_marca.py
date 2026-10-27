"""La herramienta Imagen: ni duplicada, ni deformada, ni distinta de la pantalla.

1. La imagen se grababa en el CONTENIDO de la página y seguía en la lista de marcas.
   Si el motor soltaba el documento limpio (LRU) o se reiniciaba y lo reabría de disco,
   el siguiente guardado la volvía a grabar: una copia en el sitio viejo y otra en el
   nuevo. Ahora es una anotación propia y se redibuja como el resto de las marcas.
2. Con un giro libre el lienzo agrandado por Pillow se metía en la caja original.
3. La pantalla la encaja con proporción (`xMidYMid meet`) y el PDF la estiraba.
"""
import base64
import io
import math

import fitz
import pytest
from PIL import Image

from app.services._pdf_annotations import caja_de_imagen
from app.services.pdf_service import pdf_service

ROJO = (255, 0, 0)
AZUL = (0, 0, 255)


def _png(w=200, h=100, franja=20, alfa=False) -> bytes:
    """Rojo con una franja azul ARRIBA: así se ve hacia dónde quedó girada."""
    im = Image.new("RGBA" if alfa else "RGB", (w, h), ROJO + ((255,) if alfa else ()))
    for x in range(w):
        for y in range(franja):
            im.putpixel((x, y), AZUL + ((255,) if alfa else ()))
    if alfa:
        for x in range(10):
            for y in range(franja, h):
                im.putpixel((x, y), (0, 255, 0, 128))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def _data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


def _img(**extra):
    base = {"id": "img-1", "type": "image", "page": 0, "x": 100, "y": 100,
            "width": 200, "height": 100, "imageData": _data_url(_png())}
    base.update(extra)
    return base


def _guardar(client, doc_id, anns, out=None):
    assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": anns}).status_code == 200
    q = f"?output_path={out}" if out else ""
    assert client.post(f"/pdf/save/{doc_id}{q}").status_code == 200


def _sellos(path):
    with fitz.open(path) as d:
        page = d.load_page(0)
        return [a.rect for a in page.annots() if a.type[1] == "Stamp"], len(page.get_images())


def _soltar(doc_id):
    """Lo que hace el LRU con un documento limpio: cerrarlo y reabrirlo de disco."""
    with pdf_service._lock:
        pdf_service._docs.pop(doc_id).close()


def _cerca(r, x0, y0, x1, y1, tol=0.6):
    return all(abs(a - b) < tol for a, b in zip((r.x0, r.y0, r.x1, r.y1), (x0, y0, x1, y1)))


def _pixel(page, x, y):
    pix = page.get_pixmap()
    return pix.pixel(int(x), int(y))


def _es(color, esperado, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(color, esperado))


class TestImagenNoSeDuplica:
    def test_mover_tras_desalojo_no_deja_la_copia_vieja(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id, path = info["doc_id"], info["file_path"]
        _guardar(client, doc_id, [_img()])
        _soltar(doc_id)  # el siguiente acceso lo reabre DEL DISCO, ya con la imagen
        _guardar(client, doc_id, [_img(x=300)])

        sellos, en_contenido = _sellos(path)
        assert en_contenido == 0, "la imagen no debe grabarse en el contenido de la página"
        assert len(sellos) == 1, f"imagen duplicada: {sellos}"
        assert _cerca(sellos[0], 300, 100, 500, 200)

    def test_guardar_varias_veces_con_desalojos_no_la_apila(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id, path = info["doc_id"], info["file_path"]
        for i in range(3):
            _guardar(client, doc_id, [_img()])
            _soltar(doc_id)
        assert len(_sellos(path)[0]) == 1

    def test_reabrir_el_archivo_la_devuelve_editable(self, client, open_doc):
        """Tras un reinicio el archivo se abre de cero: la imagen vuelve a la lista
        (con su giro, opacidad e imagen original) y guardarla otra vez no la duplica."""
        info = open_doc(pages=1)
        png = _png(alfa=True)
        _guardar(client, info["doc_id"], [_img(imageData=_data_url(png), rotation=30, opacity=0.5)])

        resp = client.post("/pdf/open", json={"file_path": info["file_path"]})
        assert resp.status_code == 200
        nuevo = resp.json()
        try:
            assert nuevo["unmanaged_annots"] == 0, "la imagen propia no es un sello ajeno"
            anns = client.get(f"/pdf/annotations/{nuevo['doc_id']}").json()["annotations"]
            assert len(anns) == 1
            a = anns[0]
            assert a["type"] == "image" and a["id"] == "img-1"
            assert (a["x"], a["y"], a["width"], a["height"]) == (100, 100, 200, 100)
            assert a["rotation"] == 30 and a["opacity"] == 0.5
            original = Image.open(io.BytesIO(png))
            vuelta = Image.open(io.BytesIO(base64.b64decode(a["imageData"].split(",", 1)[1])))
            assert vuelta.size == original.size
            assert vuelta.convert("RGBA").tobytes() == original.convert("RGBA").tobytes()

            # Moverla y guardar: sigue habiendo UNA, en el sitio nuevo.
            a["x"] = 250
            _guardar(client, nuevo["doc_id"], [a])
            assert len(_sellos(info["file_path"])[0]) == 1
        finally:
            client.post(f"/pdf/close/{nuevo['doc_id']}")

    def test_jpeg_vuelve_byte_a_byte(self, client, open_doc):
        info = open_doc(pages=1)
        buf = io.BytesIO()
        Image.new("RGB", (80, 40), (10, 200, 30)).save(buf, "JPEG")
        jpg = buf.getvalue()
        url = "data:image/jpeg;base64," + base64.b64encode(jpg).decode()
        _guardar(client, info["doc_id"], [_img(imageData=url)])
        _soltar(info["doc_id"])
        a = client.get(f"/pdf/annotations/{info['doc_id']}").json()["annotations"][0]
        assert a["imageData"] == url

    def test_borrarla_la_saca_del_archivo(self, client, open_doc):
        info = open_doc(pages=1)
        _guardar(client, info["doc_id"], [_img()])
        _soltar(info["doc_id"])
        _guardar(client, info["doc_id"], [])
        assert _sellos(info["file_path"])[0] == []

    def test_un_sello_ajeno_no_se_toca(self, client, pdf_factory):
        path = pdf_factory(pages=1)
        with fitz.open(path) as d:
            d.load_page(0).add_stamp_annot(fitz.Rect(50, 300, 150, 350), stamp=_png())
            d.saveIncr()
        info = client.post("/pdf/open", json={"file_path": path}).json()
        try:
            assert info["unmanaged_annots"] == 1
            assert client.get(f"/pdf/annotations/{info['doc_id']}").json()["annotations"] == []
            _guardar(client, info["doc_id"], [_img()])
            assert len(_sellos(path)[0]) == 2  # el ajeno sigue + el nuestro
        finally:
            client.post(f"/pdf/close/{info['doc_id']}")


class TestGeometria:
    def test_caja_de_imagen_respeta_proporcion_y_centro(self):
        fw, fh, r = caja_de_imagen(100, 100, 200, 200, 200, 100, 0)
        assert (fw, fh) == (200, 100)
        assert _cerca(r, 100, 150, 300, 250)

    def test_caja_de_imagen_giro_libre_crece_sobre_el_mismo_centro(self):
        fw, fh, r = caja_de_imagen(100, 100, 200, 100, 200, 100, 30)
        c, s = math.cos(math.radians(30)), math.sin(math.radians(30))
        assert r.width == pytest.approx(200 * c + 100 * s)   # ~223.2
        assert r.height == pytest.approx(200 * s + 100 * c)  # ~186.6
        assert (r.x0 + r.x1) / 2 == pytest.approx(200) and (r.y0 + r.y1) / 2 == pytest.approx(150)

    def test_caja_de_imagen_a_90_intercambia_lados(self):
        _, _, r = caja_de_imagen(100, 100, 200, 100, 200, 100, 90)
        assert _cerca(r, 150, 50, 250, 250)

    def _embed(self, rot_pagina, **extra):
        doc = fitz.open()
        page = doc.new_page(width=600, height=600)
        if rot_pagina:
            page.set_rotation(rot_pagina)
        from app.models.pdf import Annotation
        pdf_service._embed_into(doc, [Annotation(**_img(**extra))])
        return doc

    @pytest.mark.parametrize("rot_pagina", [0, 90, 270])
    @pytest.mark.parametrize("angulo", [0, 30, 90, 135, 200])
    def test_se_ve_como_en_pantalla(self, rot_pagina, angulo):
        """Centro rojo, la franja azul hacia donde apunta el giro (horario, como el
        `rotate()` del SVG) y la esquina de la imagen girada dentro de ella —con el
        lienzo metido en la caja original quedaba fuera—."""
        doc = self._embed(rot_pagina, rotation=angulo)
        page = doc.load_page(0)
        a = math.radians(angulo)
        cx, cy = 200, 150
        assert _es(_pixel(page, cx, cy), ROJO)
        arriba = (cx + math.sin(a) * 42, cy - math.cos(a) * 42)
        assert _es(_pixel(page, *arriba), AZUL), f"la franja no quedó arriba girada {angulo}°"

        def girar(dx, dy):  # punto de la imagen (relativo al centro) en la página
            return (cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a))
        assert _es(_pixel(page, *girar(92, 42)), ROJO), "la imagen girada quedó encogida"

    def test_proporcion_en_una_caja_mas_alta(self):
        """Caja 200x200 con imagen 200x100: encajada y centrada, sin estirar."""
        doc = self._embed(0, height=200)
        page = doc.load_page(0)
        assert _es(_pixel(page, 200, 120), (255, 255, 255)), "la imagen se estiró a la caja"
        assert _es(_pixel(page, 200, 160), AZUL)  # la franja empieza en y=150
        assert _es(_pixel(page, 200, 200), ROJO)

    def test_opacidad(self):
        doc = self._embed(0, opacity=0.3)
        rojo = _pixel(doc.load_page(0), 200, 170)
        assert _es(rojo, (255, 178, 178), tol=12)
