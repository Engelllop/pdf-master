"""Páginas con /Rotate. El visor trabaja en la página GIRADA (el viewport de PDF.js
aplica /Rotate y page_sizes es page.rect), pero PyMuPDF da y pide coordenadas SIN
girar. En una página con /Rotate 90 las marcas se guardaban en otro sitio que donde el
usuario las había dibujado, las ajenas se leían desplazadas, y la búsqueda, el texto
seleccionable, los puntos de ajuste, la redacción y el recorte caían fuera de lugar."""
import fitz
import pytest

ROTACIONES = [0, 90, 180, 270]
GIRADAS = [90, 180, 270]

RECT = {"id": "r1", "type": "rect", "page": 0, "x": 60, "y": 80, "width": 120, "height": 60,
        "color": "#ff0000", "lineWidth": 2}
LINEA = {"id": "l1", "type": "line", "page": 0, "x": 50, "y": 250, "width": 100, "height": 40,
         "color": "#0000ff", "lineWidth": 2}
TINTA = {"id": "d1", "type": "draw", "page": 0, "x": 200, "y": 220, "color": "#00aa00", "lineWidth": 2,
         "points": [{"x": 200, "y": 220}, {"x": 260, "y": 240}, {"x": 300, "y": 300}]}
TEXTO = {"id": "t1", "type": "text", "page": 0, "x": 40, "y": 20, "width": 300, "height": 30,
         "text": "WWWWWWWWWW", "fontSize": 16, "color": "#000000"}
MARCAS = [RECT, LINEA, TINTA, TEXTO]


def _girada(path, rot, linea=False):
    """Página de 600x400 SIN girar con texto (y una raya) y luego /Rotate `rot`: el
    contenido queda donde lo pondría cualquier otro programa."""
    doc = fitz.open()
    page = doc.new_page(width=600, height=400)
    page.insert_text((300, 120), "BUSCAME", fontsize=14)
    if linea:
        page.draw_line((100, 300), (250, 300))
    page.set_rotation(rot)
    doc.save(str(path))
    doc.close()
    return str(path)


@pytest.fixture
def abrir(client, tmp_path):
    abiertos = []

    def _abrir(path):
        r = client.post("/pdf/open", json={"file_path": str(path)})
        assert r.status_code == 200, r.text
        abiertos.append(r.json()["doc_id"])
        return r.json()["doc_id"]

    yield _abrir
    for doc_id in abiertos:
        client.post(f"/pdf/close/{doc_id}")


def _guardar_con_marcas(client, abrir, tmp_path, rot):
    path = _girada(tmp_path / f"girada{rot}.pdf", rot)
    doc_id = abrir(path)
    assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": MARCAS}).status_code == 200
    assert client.post(f"/pdf/save/{doc_id}").status_code == 200
    return path


def _por_nombre(page):
    return {(a.info.get("name") or "").split(":", 1)[-1]: a for a in page.annots()}


def _caja_de_color(pix, es_color, hasta_y=None):
    xs, ys = [], []
    for y in range(min(pix.height, hasta_y or pix.height)):
        for x in range(pix.width):
            if es_color(pix.pixel(x, y)):
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def _cerca(a, b, tol):
    return all(abs(p - q) <= tol for p, q in zip(a, b))


class TestLasMarcasQuedanDondeSeVen:
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_el_rect_en_disco_es_la_posicion_visual(self, client, abrir, tmp_path, rot):
        path = _guardar_con_marcas(client, abrir, tmp_path, rot)
        doc = fitz.open(path)
        page = doc[0]
        marcas = _por_nombre(page)
        # PyMuPDF expande el rect medio grosor de línea por lado.
        visual = marcas["r1"].rect * page.rotation_matrix
        assert _cerca(visual, (59, 79, 181, 141), 0.01)
        linea = [fitz.Point(v) * page.rotation_matrix for v in marcas["l1"].vertices]
        assert _cerca((*linea[0], *linea[1]), (50, 250, 150, 290), 0.01)
        tinta = [fitz.Point(v) * page.rotation_matrix for v in marcas["d1"].vertices[0]]
        assert _cerca([c for p in tinta for c in p], [200, 220, 260, 240, 300, 300], 0.01)
        # Y en el render (lo que ve cualquier visor): el recuadro rojo está ahí.
        rojo = _caja_de_color(page.get_pixmap(), lambda c: c[0] > 200 and c[1] < 80 and c[2] < 80)
        doc.close()
        assert _cerca(rojo, (59, 79, 180, 140), 2)

    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_el_texto_se_lee_como_en_pantalla(self, client, abrir, tmp_path, rot):
        path = _guardar_con_marcas(client, abrir, tmp_path, rot)
        doc = fitz.open(path)
        page = doc[0]
        pix = page.get_pixmap()
        doc.close()
        # Solo la franja de arriba, donde está el cuadro de texto y nada más.
        negro = _caja_de_color(pix, lambda c: c[0] < 90 and c[1] < 90 and c[2] < 90, hasta_y=60)
        assert negro is not None
        x0, y0, x1, y1 = negro
        # Horizontal en pantalla: mucho más ancho que alto.
        assert (x1 - x0) > 3 * (y1 - y0)

    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_ida_y_vuelta_de_las_propias_sin_doble_giro(self, client, abrir, tmp_path, rot):
        """Las propias vuelven del payload, que ya está en el espacio del visor."""
        path = _guardar_con_marcas(client, abrir, tmp_path, rot)
        nuevo = abrir(path)
        leidas = {a["id"]: a for a in client.get(f"/pdf/annotations/{nuevo}").json()["annotations"]}
        for m in MARCAS:
            for k in ("x", "y", "width", "height", "points"):
                if k in m:
                    assert leidas[m["id"]][k] == m[k], (m["id"], k)

    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_ida_y_vuelta_leidas_como_ajenas(self, client, abrir, tmp_path, rot):
        """Sin payload (como las ve otro programa) la geometría sale del PDF: tiene que
        volver al mismo sitio. Cubre la escritura y la lectura de las ajenas."""
        path = _guardar_con_marcas(client, abrir, tmp_path, rot)
        doc = fitz.open(path)
        page = doc[0]
        for a in page.annots():
            doc.xref_set_key(a.xref, "PM", "null")
            doc.xref_set_key(a.xref, "Name", "null")
        ajena = str(tmp_path / f"ajena{rot}.pdf")
        doc.save(ajena)
        doc.close()
        leidas = client.get(f"/pdf/annotations/{abrir(ajena)}").json()["annotations"]
        por_tipo = {a["type"]: a for a in leidas}
        r = por_tipo["rect"]
        assert _cerca((r["x"], r["y"], r["width"], r["height"]), (59, 79, 122, 62), 0.01)
        linea = por_tipo["line"]
        assert _cerca((linea["x"], linea["y"], linea["width"], linea["height"]), (50, 250, 100, 40), 0.01)
        tinta = [(p["x"], p["y"]) for p in por_tipo["draw"]["points"]]
        assert _cerca([c for p in tinta for c in p], [200, 220, 260, 240, 300, 300], 0.01)
        t = por_tipo["text"]
        assert _cerca((t["x"], t["y"], t["width"], t["height"]), (40, 20, 300, 30), 0.01)

    def test_sin_rotacion_las_coordenadas_no_cambian(self, client, abrir, tmp_path):
        """Referencia: lo que escribe PyMuPDF con las coordenadas tal cual."""
        path = _guardar_con_marcas(client, abrir, tmp_path, 0)
        ref = fitz.open()
        rp = ref.new_page(width=600, height=400)
        esperado_rect = rp.add_rect_annot(fitz.Rect(60, 80, 180, 140)).rect
        esperada_linea = rp.add_line_annot(fitz.Point(50, 250), fitz.Point(150, 290)).vertices
        doc = fitz.open(path)
        page = doc[0]  # con la página viva: sin ella, leer la anotación revienta MuPDF
        marcas = _por_nombre(page)
        assert marcas["r1"].rect == esperado_rect
        assert marcas["l1"].vertices == esperada_linea
        doc.close()
        ref.close()

    @pytest.mark.parametrize("rot", GIRADAS)
    def test_una_marca_ajena_se_lee_en_el_espacio_del_visor(self, client, abrir, tmp_path, rot):
        path = str(tmp_path / f"ajena_girada{rot}.pdf")
        doc = fitz.open()
        page = doc.new_page(width=600, height=400)
        page.set_rotation(rot)
        sin_girar = fitz.Rect(300, 50, 420, 110)
        a = page.add_rect_annot(sin_girar)
        esperado = a.rect * page.rotation_matrix
        doc.save(path)
        doc.close()
        r = client.get(f"/pdf/annotations/{abrir(path)}").json()["annotations"][0]
        assert _cerca((r["x"], r["y"], r["width"], r["height"]),
                      (esperado.x0, esperado.y0, esperado.width, esperado.height), 0.01)


def _buscame_visual(path):
    doc = fitz.open(path)
    page = doc[0]
    r = page.search_for("BUSCAME")[0] * page.rotation_matrix
    doc.close()
    return r


class TestRutasConCoordenadasDelVisor:
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_buscar_devuelve_la_posicion_visual(self, client, abrir, tmp_path, rot):
        path = _girada(tmp_path / f"b{rot}.pdf", rot)
        doc_id = abrir(path)
        res = client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json()
        assert len(res) == 1
        esperado = _buscame_visual(path)
        assert _cerca((res[0]["x"], res[0]["y"], res[0]["width"], res[0]["height"]),
                      (esperado.x0, esperado.y0, esperado.width, esperado.height), 0.01)
        assert "BUSCAME" in res[0]["snippet"]
        spans = client.get(f"/pdf/spans/{doc_id}/0").json()["spans"]
        sp = next(s for s in spans if "BUSCAME" in s["text"])
        assert _cerca((sp["x0"], sp["y0"], sp["x1"], sp["y1"]), tuple(esperado), 0.01)

    @pytest.mark.parametrize("rot", GIRADAS)
    def test_texto_de_una_zona_y_redaccion_usan_la_zona_visual(self, client, abrir, tmp_path, rot):
        path = _girada(tmp_path / f"z{rot}.pdf", rot)
        doc_id = abrir(path)
        zona = _buscame_visual(path) + (-3, -3, 3, 3)
        caja = {"x": zona.x0, "y": zona.y0, "width": zona.width, "height": zona.height}
        texto = client.post(f"/pdf/text-clip/{doc_id}/0", json=caja).json()["text"]
        assert "BUSCAME" in texto
        assert client.post(f"/pdf/redact/{doc_id}", json={"page_num": 0, **caja}).status_code == 200
        assert client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json() == []

    @pytest.mark.parametrize("rot", GIRADAS)
    def test_puntos_de_ajuste_en_la_posicion_visual(self, client, abrir, tmp_path, rot):
        path = _girada(tmp_path / f"s{rot}.pdf", rot, linea=True)
        doc = fitz.open(path)
        m = doc[0].rotation_matrix
        doc.close()
        pts = {(p["x"], p["y"]) for p in client.get(f"/pdf/snap-points/{abrir(path)}/0").json()["points"]}
        for sin_girar in ((100, 300), (250, 300)):
            v = fitz.Point(sin_girar) * m
            assert (round(v.x, 1), round(v.y, 1)) in pts

    @pytest.mark.parametrize("rot", GIRADAS)
    def test_recortar_usa_los_margenes_de_pantalla(self, client, abrir, tmp_path, rot):
        path = _girada(tmp_path / f"c{rot}.pdf", rot)
        doc_id = abrir(path)
        antes = client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json()[0]
        ancho, alto = (400, 600) if rot in (90, 270) else (600, 400)
        r = client.post(f"/pdf/crop/{doc_id}", json={"page_num": 0, "top": 10, "right": 20, "bottom": 30, "left": 40})
        assert r.status_code == 200, r.text
        size = client.get(f"/pdf/info/{doc_id}").json()["page_sizes"][0]
        assert _cerca((size["width"], size["height"]), (ancho - 60, alto - 40), 0.01)
        despues = client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json()[0]
        # Lo de arriba a la izquierda EN PANTALLA es lo que se fue.
        assert _cerca((despues["x"], despues["y"]), (antes["x"] - 40, antes["y"] - 10), 0.01)


def _cuadrada(path, rot):
    """Página cuadrada y vacía: girada o no, en pantalla mide lo mismo, así que lo que se
    estampe tiene que verse IGUAL píxel a píxel."""
    doc = fitz.open()
    doc.new_page(width=500, height=500).set_rotation(rot)
    doc.save(str(path))
    doc.close()
    return str(path)


def _png_rojo_azul(path):
    """Mitad izquierda roja, derecha azul: deja ver si la imagen quedó girada."""
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 10), False)
    for x in range(20):
        for y in range(10):
            pix.set_pixel(x, y, (255, 0, 0) if x < 10 else (0, 0, 255))
    pix.save(str(path))
    return str(path)


ESTAMPADOS = {
    "marca_de_agua": lambda c, d: c.post(f"/pdf/watermark/{d}", json={"text": "BORRADOR", "tiled": False, "opacity": 1}),
    "marca_de_agua_mosaico": lambda c, d: c.post(f"/pdf/watermark/{d}", json={"text": "BORRADOR", "opacity": 1}),
    "encabezado_y_pie": lambda c, d: c.post(f"/pdf/header-footer/{d}", json={"header": "CABECERA", "footer": "PIE"}),
    "numeracion": lambda c, d: c.post(f"/pdf/page-numbers/{d}?position=bottom"),
}


class TestEstampadosSeVenIgualEnPaginasGiradas:
    @pytest.mark.parametrize("rot", GIRADAS)
    @pytest.mark.parametrize("nombre", list(ESTAMPADOS))
    def test_mismo_resultado_que_sin_girar(self, client, abrir, tmp_path, rot, nombre):
        imagenes = []
        for r in (0, rot):
            doc_id = abrir(_cuadrada(tmp_path / f"{nombre}{r}.pdf", r))
            assert ESTAMPADOS[nombre](client, doc_id).status_code == 200
            png = client.get(f"/pdf/page-image/{doc_id}/0?zoom=0.5")
            assert png.status_code == 200
            imagenes.append(fitz.Pixmap(png.content))
        base, girada = imagenes
        assert (base.width, base.height) == (girada.width, girada.height)
        assert base.samples == girada.samples


class TestEdicionEnPaginasGiradas:
    @pytest.mark.parametrize("rot", GIRADAS)
    def test_editar_un_span_lo_reemplaza_en_su_sitio(self, client, abrir, tmp_path, rot):
        doc_id = abrir(_girada(tmp_path / f"e{rot}.pdf", rot))
        sp = next(s for s in client.get(f"/pdf/spans/{doc_id}/0").json()["spans"] if "BUSCAME" in s["text"])
        r = client.post(f"/pdf/edit-text/{doc_id}", json={
            "page_num": 0, "x0": sp["x0"], "y0": sp["y0"], "x1": sp["x1"], "y1": sp["y1"],
            "text": "NUEVO", "size": 14})
        assert r.status_code == 200, r.text
        assert client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json() == []
        nuevo = client.get(f"/pdf/search/{doc_id}?query=NUEVO").json()
        assert len(nuevo) == 1
        n = nuevo[0]
        # En el mismo sentido que el original (aquí va girado con la página: en
        # vertical en pantalla con 90/270) y encima de donde estaba.
        assert (n["width"] > n["height"]) == ((sp["x1"] - sp["x0"]) > (sp["y1"] - sp["y0"]))
        caja_nueva = fitz.Rect(n["x"], n["y"], n["x"] + n["width"], n["y"] + n["height"])
        comun = caja_nueva & fitz.Rect(sp["x0"], sp["y0"], sp["x1"], sp["y1"])
        assert not comun.is_empty and comun.get_area() >= 0.5 * caja_nueva.get_area()

    @pytest.mark.parametrize("rot", GIRADAS)
    def test_insertar_y_mover_una_imagen(self, client, abrir, tmp_path, rot):
        doc_id = abrir(_cuadrada(tmp_path / f"i{rot}.pdf", rot))
        img = _png_rojo_azul(tmp_path / "rb.png")
        caja = {"page_num": 0, "x": 100, "y": 100, "width": 200, "height": 100, "image_path": img}
        assert client.post(f"/pdf/insert-image/{doc_id}", json=caja).status_code == 200
        imgs = client.get(f"/pdf/images/{doc_id}/0").json()["images"]
        assert len(imgs) == 1
        im = imgs[0]
        assert _cerca((im["x0"], im["y0"], im["x1"], im["y1"]), (100, 100, 300, 200), 0.01)
        pix = fitz.Pixmap(client.get(f"/pdf/page-image/{doc_id}/0?zoom=1").content)
        escala = pix.width / 500
        izq = pix.pixel(int(120 * escala), int(150 * escala))
        der = pix.pixel(int(280 * escala), int(150 * escala))
        assert izq[0] > 200 and izq[2] < 80, "la imagen no quedó derecha"
        assert der[2] > 200 and der[0] < 80, "la imagen no quedó derecha"
        r = client.post(f"/pdf/transform-image/{doc_id}", json={
            "page_num": 0, "xref": im["xref"], "old": [im["x0"], im["y0"], im["x1"], im["y1"]],
            "new": [150, 250, 350, 350]})
        assert r.status_code == 200, r.text
        movida = client.get(f"/pdf/images/{doc_id}/0").json()["images"]
        assert len(movida) == 1
        assert _cerca((movida[0]["x0"], movida[0]["y0"], movida[0]["x1"], movida[0]["y1"]), (150, 250, 350, 350), 0.01)
