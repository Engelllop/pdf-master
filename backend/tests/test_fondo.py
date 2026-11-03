"""Fondo de página: color liso o imagen, DETRÁS del contenido, en su propia capa (como el
encabezado, la numeración y la marca de agua): aplicar reemplaza, se puede quitar y el
diálogo se reabre con lo aplicado."""
import fitz
import pytest
from PIL import Image

ROJO, AZUL, VERDE, AMARILLO = (255, 0, 0), (0, 0, 255), (0, 200, 0), (255, 255, 0)


def _abrir(client, ruta):
    return client.post("/pdf/open", json={"file_path": ruta}).json()["doc_id"]


@pytest.fixture
def pdf_con_texto(tmp_path):
    """Tres páginas con un texto negro grande en (72, 120)."""
    ruta = str(tmp_path / "doc.pdf")
    d = fitz.open()
    for i in range(3):
        d.new_page(width=300, height=400).insert_text((72, 120), f"TEXTO {i + 1}", fontsize=40)
    d.save(ruta)
    d.close()
    return ruta


@pytest.fixture
def imagen_cuadrantes(tmp_path):
    """80x40: arriba-izq rojo, arriba-der azul, abajo-izq verde, abajo-der amarillo."""
    ruta = str(tmp_path / "cuadrantes.png")
    im = Image.new("RGB", (80, 40))
    for x in range(80):
        for y in range(40):
            im.putpixel((x, y), (ROJO if y < 20 else VERDE) if x < 40 else (AZUL if y < 20 else AMARILLO))
    im.save(ruta)
    return ruta


def _aplicar(client, doc_id, spec, pages=None, capa="fondo"):
    r = client.post(f"/pdf/stamps/{doc_id}", json={"capa": capa, "spec": spec, "pages": pages})
    assert r.status_code == 200, r.text
    return r.json()


def _guardar(client, doc_id, tmp_path, nombre="salida.pdf"):
    salida = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}", params={"output_path": salida}).status_code == 200
    return salida


def _pixel(ruta, pagina, x, y):
    """El color en (x, y) de la página tal como se ve (con su rotación), a escala 1."""
    with fitz.open(ruta) as d:
        pix = d[pagina].get_pixmap(alpha=False)
        return tuple(pix.pixel(int(x), int(y)))


def _cerca(a, b, tol=6):
    return all(abs(p - q) <= tol for p, q in zip(a, b))


class TestFondoDeColor:
    def test_pinta_toda_la_hoja(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#ffeeaa", "opacity": 1})
        salida = _guardar(client, doc_id, tmp_path)
        for pagina in range(3):
            for x, y in ((5, 5), (295, 5), (5, 395), (295, 395), (150, 300)):
                assert _cerca(_pixel(salida, pagina, x, y), (255, 238, 170)), (pagina, x, y)

    def test_queda_detras_del_texto(self, client, pdf_con_texto, tmp_path):
        """El texto negro sigue negro por encima del fondo y se sigue extrayendo."""
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#ffeeaa", "opacity": 1})
        salida = _guardar(client, doc_id, tmp_path)
        with fitz.open(salida) as d:
            assert "TEXTO 1" in d[0].get_text()
            caja = d[0].search_for("TEXTO 1")[0]
            pix = d[0].get_pixmap(clip=caja, alpha=False)
            oscuros = [pix.pixel(x, y) for x in range(0, pix.width, 2) for y in range(0, pix.height, 2)
                       if sum(pix.pixel(x, y)) < 150]
            assert oscuros, "el texto quedó tapado por el fondo"

    def test_la_opacidad_mezcla_con_el_papel(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#000000", "opacity": 0.5})
        px = _pixel(_guardar(client, doc_id, tmp_path), 0, 5, 5)
        assert 100 <= px[0] <= 160 and px[0] == px[1] == px[2], px  # ~gris medio

    def test_solo_las_paginas_pedidas(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#ffeeaa", "opacity": 1}, pages=[1])
        salida = _guardar(client, doc_id, tmp_path)
        assert _cerca(_pixel(salida, 0, 5, 5), (255, 255, 255))
        assert _cerca(_pixel(salida, 1, 5, 5), (255, 238, 170))
        assert _cerca(_pixel(salida, 2, 5, 5), (255, 255, 255))

    def test_aplicar_de_nuevo_reemplaza_no_apila(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#ff0000", "opacity": 1})
        _aplicar(client, doc_id, {"kind": "color", "color": "#0000ff", "opacity": 1})
        salida = _guardar(client, doc_id, tmp_path)
        assert _cerca(_pixel(salida, 0, 5, 5), (0, 0, 255))
        with fitz.open(salida) as d:
            capas = [i for i in (d.get_ocgs() or {}).values() if i.get("name") == "PDF Master - Fondo"]
            assert len(capas) == 1

    def test_quitar_deja_la_hoja_como_estaba(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"kind": "color", "color": "#ff0000", "opacity": 1})
        r = client.post(f"/pdf/stamps/remove/{doc_id}", json={"capa": "fondo"})
        assert r.status_code == 200 and r.json()["removed"] == 3
        salida = _guardar(client, doc_id, tmp_path)
        assert _cerca(_pixel(salida, 0, 5, 5), (255, 255, 255))
        with fitz.open(salida) as d:
            assert "TEXTO 1" in d[0].get_text()

    def test_el_estado_devuelve_lo_aplicado_para_reabrir_el_dialogo(self, client, pdf_con_texto):
        doc_id = _abrir(client, pdf_con_texto)
        assert client.get(f"/pdf/stamps/{doc_id}").json()["fondo"] is None
        _aplicar(client, doc_id, {"kind": "color", "color": "#ffeeaa", "opacity": 0.7}, pages=[0, 2])
        f = client.get(f"/pdf/stamps/{doc_id}").json()["fondo"]
        assert f["kind"] == "color" and f["color"] == "#ffeeaa" and f["opacity"] == 0.7 and f["pages"] == [0, 2]

    def test_no_pisa_las_otras_capas(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        _aplicar(client, doc_id, {"zones": {"br": "Pie"}, "fontsize": 12, "color": "#000000"}, capa="numeracion")
        _aplicar(client, doc_id, {"kind": "color", "color": "#ffeeaa", "opacity": 1})
        salida = _guardar(client, doc_id, tmp_path)
        with fitz.open(salida) as d:
            assert "Pie" in d[0].get_text()
        estado = client.get(f"/pdf/stamps/{doc_id}").json()
        assert estado["numeracion"] is not None and estado["fondo"] is not None

    def test_vista_previa_no_toca_el_documento(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        r = client.post(f"/pdf/stamps/preview/{doc_id}", json={
            "capa": "fondo", "spec": {"kind": "color", "color": "#ff0000", "opacity": 1}, "page_num": 0, "width": 300})
        assert r.status_code == 200 and r.headers["content-type"] == "image/png"
        pix = fitz.Pixmap(r.content)
        assert _cerca(tuple(pix.pixel(3, 3)), (255, 0, 0))
        assert client.get(f"/pdf/stamps/{doc_id}").json()["fondo"] is None
        assert _cerca(_pixel(_guardar(client, doc_id, tmp_path), 0, 5, 5), (255, 255, 255))


class TestFondoConImagen:
    def _con_imagen(self, client, pdf, tmp_path, img, fit="stretch", pagina=0):
        doc_id = _abrir(client, pdf)
        _aplicar(client, doc_id, {"kind": "image", "image_path": img, "fit": fit})
        return _guardar(client, doc_id, tmp_path)

    def test_estirada_pone_cada_cuadrante_en_su_sitio(self, client, pdf_con_texto, imagen_cuadrantes, tmp_path):
        s = self._con_imagen(client, pdf_con_texto, tmp_path, imagen_cuadrantes, "stretch")
        assert _cerca(_pixel(s, 0, 20, 20), ROJO) and _cerca(_pixel(s, 0, 280, 20), AZUL)
        assert _cerca(_pixel(s, 0, 20, 380), VERDE) and _cerca(_pixel(s, 0, 280, 380), AMARILLO)

    @pytest.mark.parametrize("giro", [90, 180, 270])
    def test_en_pagina_girada_la_imagen_se_ve_derecha(self, client, tmp_path, imagen_cuadrantes, giro):
        """El contenido se dibuja en la página sin girar: sin compensar, la imagen sale
        girada o espejada en una hoja con /Rotate."""
        ruta = str(tmp_path / f"giro{giro}.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400).set_rotation(giro)
        d.save(ruta)
        d.close()
        s = self._con_imagen(client, ruta, tmp_path, imagen_cuadrantes, "stretch")
        with fitz.open(s) as docu:
            ancho, alto = docu[0].rect.width, docu[0].rect.height
        assert _cerca(_pixel(s, 0, ancho * 0.1, alto * 0.1), ROJO), "arriba-izquierda"
        assert _cerca(_pixel(s, 0, ancho * 0.9, alto * 0.1), AZUL), "arriba-derecha"
        assert _cerca(_pixel(s, 0, ancho * 0.1, alto * 0.9), VERDE), "abajo-izquierda"
        assert _cerca(_pixel(s, 0, ancho * 0.9, alto * 0.9), AMARILLO), "abajo-derecha"

    def test_contain_en_pagina_girada_calcula_el_ajuste_sobre_lo_que_se_ve(self, client, tmp_path, imagen_cuadrantes):
        """Hoja 300x400 girada 90° se ve 400x300; la imagen 2:1 entra a 400x200, con
        franjas blancas de 50 arriba y abajo (no a lo ancho de la hoja sin girar)."""
        ruta = str(tmp_path / "g90.pdf")
        d = fitz.open()
        d.new_page(width=300, height=400).set_rotation(90)
        d.save(ruta)
        d.close()
        s = self._con_imagen(client, ruta, tmp_path, imagen_cuadrantes, "contain")
        assert _cerca(_pixel(s, 0, 200, 10), (255, 255, 255)) and _cerca(_pixel(s, 0, 200, 290), (255, 255, 255))
        assert _cerca(_pixel(s, 0, 20, 100), ROJO) and _cerca(_pixel(s, 0, 380, 200), AMARILLO)

    def test_cover_llena_la_hoja_sin_deformar(self, client, pdf_con_texto, imagen_cuadrantes, tmp_path):
        """Imagen apaisada (2:1) en hoja vertical (3:4): cover la llena y recorta los lados,
        así que en el centro de los bordes ya no hay papel blanco."""
        s = self._con_imagen(client, pdf_con_texto, tmp_path, imagen_cuadrantes, "cover")
        for x, y in ((2, 2), (297, 2), (2, 397), (297, 397), (150, 200)):
            assert not _cerca(_pixel(s, 0, x, y), (255, 255, 255)), (x, y)

    def test_contain_entra_entera_y_deja_franjas(self, client, pdf_con_texto, imagen_cuadrantes, tmp_path):
        s = self._con_imagen(client, pdf_con_texto, tmp_path, imagen_cuadrantes, "contain")
        # 2:1 en 300x400: ocupa 300x150 centrada → franjas blancas arriba y abajo.
        assert _cerca(_pixel(s, 0, 150, 5), (255, 255, 255))
        assert _cerca(_pixel(s, 0, 150, 395), (255, 255, 255))
        assert _cerca(_pixel(s, 0, 10, 130), ROJO) and _cerca(_pixel(s, 0, 290, 270), AMARILLO)

    def test_la_imagen_queda_detras_del_texto(self, client, pdf_con_texto, imagen_cuadrantes, tmp_path):
        s = self._con_imagen(client, pdf_con_texto, tmp_path, imagen_cuadrantes, "stretch")
        with fitz.open(s) as d:
            assert "TEXTO 1" in d[0].get_text()
            pix = d[0].get_pixmap(clip=d[0].search_for("TEXTO 1")[0], alpha=False)
            assert any(sum(pix.pixel(x, y)) < 150 for x in range(0, pix.width, 2) for y in range(0, pix.height, 2))

    def test_una_imagen_que_no_existe_es_422(self, client, pdf_con_texto, tmp_path):
        doc_id = _abrir(client, pdf_con_texto)
        r = client.post(f"/pdf/stamps/{doc_id}", json={
            "capa": "fondo", "spec": {"kind": "image", "image_path": str(tmp_path / "no-existe.png")}})
        assert r.status_code == 422

    def test_un_archivo_que_no_es_imagen_es_422(self, client, pdf_con_texto, tmp_path):
        txt = tmp_path / "x.txt"
        txt.write_text("hola")
        doc_id = _abrir(client, pdf_con_texto)
        r = client.post(f"/pdf/stamps/{doc_id}", json={"capa": "fondo", "spec": {"kind": "image", "image_path": str(txt)}})
        assert r.status_code == 422
        r = client.post(f"/pdf/stamps/preview/{doc_id}", json={
            "capa": "fondo", "spec": {"kind": "image", "image_path": str(txt)}, "page_num": 0})
        assert r.status_code == 422

    def test_sin_imagen_elegida_la_vista_previa_muestra_la_hoja_sola_y_aplicar_se_niega(self, client, pdf_con_texto):
        """El diálogo pide la vista previa antes de que se elija la imagen: no debe fallar
        ni pintar el color por defecto (negro)."""
        doc_id = _abrir(client, pdf_con_texto)
        r = client.post(f"/pdf/stamps/preview/{doc_id}", json={
            "capa": "fondo", "spec": {"kind": "image", "image_path": ""}, "page_num": 0, "width": 300})
        assert r.status_code == 200
        assert _cerca(tuple(fitz.Pixmap(r.content).pixel(3, 3)), (255, 255, 255))
        r = client.post(f"/pdf/stamps/{doc_id}", json={"capa": "fondo", "spec": {"kind": "image", "image_path": ""}})
        assert r.status_code == 422

    def test_una_imagen_ilegible_no_rompe_y_deja_la_hoja_igual(self, client, pdf_con_texto, tmp_path):
        mala = tmp_path / "rota.png"
        mala.write_bytes(b"no soy un png")
        doc_id = _abrir(client, pdf_con_texto)
        r = client.post(f"/pdf/stamps/{doc_id}", json={"capa": "fondo", "spec": {"kind": "image", "image_path": str(mala)}})
        assert r.status_code == 200
        assert _cerca(_pixel(_guardar(client, doc_id, tmp_path), 0, 5, 5), (255, 255, 255))
