"""Formularios en páginas giradas, y páginas con cropbox propio (desplazado respecto al
mediabox) además de /Rotate. El visor trabaja en la página GIRADA y recortada (el
viewport de PDF.js a escala 1 = page.rect); PyMuPDF da y pide coordenadas sin girar.
Los campos salían corridos en páginas giradas, los nuevos caían en otro sitio y su
texto se veía de lado."""
import fitz
import pytest

ROTACIONES = [0, 90, 180, 270]
# Cropbox asimétrico dentro del mediabox, y otro con el mediabox fuera del origen: un
# desplazamiento mal compensado sale a la vista en cualquier eje.
RECORTES = [
    None,
    ("[0 0 600 400]", "[30 10 570 380]"),
    ("[50 60 650 460]", "[80 70 620 440]"),
]
IDS_RECORTE = ["sin_recorte", "cropbox", "mediabox_desplazado"]
AZUL = (0, 0, 1)


def _pagina(path, rot, recorte=None, widget=None):
    """Página de 600x400 con una raya negra y «BUSCAME» en azul; luego cropbox y /Rotate
    puestos a mano, como vienen en un plano de otro programa."""
    doc = fitz.open()
    page = doc.new_page(width=600, height=400)
    page.draw_line((100, 300), (250, 300), width=2)
    page.insert_text((300, 120), "BUSCAME", fontsize=14, color=AZUL)
    if widget is not None:
        widget(doc, page)
    if recorte:
        mediabox, cropbox = recorte
        doc.xref_set_key(page.xref, "MediaBox", mediabox)
        doc.xref_set_key(page.xref, "CropBox", cropbox)
    doc.xref_set_key(page.xref, "Rotate", str(rot))
    doc.save(str(path))
    doc.close()
    return str(path)


@pytest.fixture
def abrir(client):
    abiertos = []

    def _abrir(path):
        r = client.post("/pdf/open", json={"file_path": str(path)})
        assert r.status_code == 200, r.text
        abiertos.append(r.json()["doc_id"])
        return r.json()["doc_id"]

    yield _abrir
    for doc_id in abiertos:
        client.post(f"/pdf/close/{doc_id}")


def _caja(pix, es_color, zona=None):
    """Caja de los píxeles que cumplen `es_color` (en `zona` = x0, y0, x1, y1)."""
    n, ancho, datos = pix.n, pix.width, pix.samples
    x0, y0, x1, y1 = zona or (0, 0, pix.width, pix.height)
    xs, ys = [], []
    for y in range(max(0, y0), min(pix.height, y1)):
        fila = y * ancho * n
        for x in range(max(0, x0), min(ancho, x1)):
            i = fila + x * n
            if es_color(datos[i], datos[i + 1], datos[i + 2]):
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def _negro(r, g, b):
    return r < 90 and g < 90 and b < 90


def _azul(r, g, b):
    return b > 150 and r < 100 and g < 100


def _render(path):
    doc = fitz.open(path)
    pix = doc[0].get_pixmap()
    doc.close()
    return pix


def _cerca(a, b, tol):
    return all(abs(p - q) <= tol for p, q in zip(a, b))


def _en_disco(path):
    """Rect del (único) widget en el archivo, llevado a la página como se ve."""
    doc = fitz.open(path)
    page = doc[0]
    r = next(page.widgets()).rect * page.rotation_matrix
    doc.close()
    return tuple(r)


def _vista(f):
    r = f["rect"]
    return (r["x"], r["y"], r["width"], r["height"])


class TestCamposEnElEspacioDelVisor:
    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    @pytest.mark.parametrize("tipo", ["text", "checkbox", "radio", "combo"])
    def test_ida_y_vuelta(self, client, abrir, tmp_path, rot, recorte, tipo):
        path = _pagina(tmp_path / f"f{rot}.pdf", rot, recorte)
        doc_id = abrir(path)
        caja = {"x": 60, "y": 70, "width": 140, "height": 24}
        r = client.post(f"/pdf/widgets/{doc_id}", json={"page_num": 0, "field_type": tipo, **caja})
        assert r.status_code == 200, r.text
        campos = client.get(f"/pdf/widgets/{doc_id}/0").json()
        assert len(campos) == 1
        assert _cerca(_vista(campos[0]), (60, 70, 140, 24), 0.01)
        # Y en disco, al reabrirlo: la geometría es la del PDF, no una copia en memoria.
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        otra = client.get(f"/pdf/widgets/{abrir(path)}/0").json()
        assert _cerca(_vista(otra[0]), (60, 70, 140, 24), 0.01)
        assert _cerca(_en_disco(path), (60, 70, 200, 94), 0.01)

    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_mover_y_redimensionar(self, client, abrir, tmp_path, rot, recorte):
        path = _pagina(tmp_path / f"m{rot}.pdf", rot, recorte)
        doc_id = abrir(path)
        client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "x": 60, "y": 70, "width": 140, "height": 24})
        xref = client.get(f"/pdf/widgets/{doc_id}/0").json()[0]["xref"]
        # Solo posición: el tamaño que se conserva es el de pantalla (con 90/270 el
        # ancho y el alto sin girar están cambiados).
        r = client.post(f"/pdf/widgets/{doc_id}/0/transform", json={"xref": xref, "x": 100, "y": 150})
        assert r.status_code == 200, r.text
        assert _cerca(_vista(client.get(f"/pdf/widgets/{doc_id}/0").json()[0]), (100, 150, 140, 24), 0.01)
        r = client.post(f"/pdf/widgets/{doc_id}/0/transform", json={"xref": xref, "width": 90, "height": 40})
        assert r.status_code == 200, r.text
        assert _cerca(_vista(client.get(f"/pdf/widgets/{doc_id}/0").json()[0]), (100, 150, 90, 40), 0.01)
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert _cerca(_en_disco(path), (100, 150, 190, 190), 0.01)

    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", [90, 180, 270])
    def test_un_campo_ajeno_se_lee_donde_se_ve(self, client, abrir, tmp_path, rot, recorte):
        def poner(doc, page):
            w = fitz.Widget()
            w.rect = fitz.Rect(300, 200, 420, 230)
            w.field_name = "ajeno"
            w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            page.add_widget(w)

        path = _pagina(tmp_path / f"a{rot}.pdf", rot, recorte, widget=poner)
        doc = fitz.open(path)
        page = doc[0]
        esperado = next(page.widgets()).rect * page.rotation_matrix
        doc.close()
        f = client.get(f"/pdf/widgets/{abrir(path)}/0").json()[0]
        assert _cerca(_vista(f), (esperado.x0, esperado.y0, esperado.width, esperado.height), 0.01)


class TestElTextoDelCampoSeLeeDerecho:
    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_campo_nuevo_con_valor(self, client, abrir, tmp_path, rot, recorte):
        path = _pagina(tmp_path / f"t{rot}.pdf", rot, recorte)
        doc_id = abrir(path)
        client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "field_name": "nombre",
            "x": 40, "y": 30, "width": 220, "height": 26})
        r = client.post(f"/pdf/widgets/{doc_id}/0", json={"field_name": "nombre", "value": "WWWWWWWW"})
        assert r.status_code == 200, r.text
        # Y moverlo después no le cambia el sentido (conserva su /MK /R).
        xref = client.get(f"/pdf/widgets/{doc_id}/0").json()[0]["xref"]
        client.post(f"/pdf/widgets/{doc_id}/0/transform", json={"xref": xref, "x": 50, "y": 40})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        negro = _caja(_render(path), _negro, zona=(50, 40, 270, 66))
        assert negro is not None
        x0, y0, x1, y1 = negro
        # Horizontal en pantalla y arrancando a la izquierda del campo (cabeza abajo
        # quedaría pegado a la derecha).
        assert (x1 - x0) > 3 * (y1 - y0)
        assert x0 - 50 < 12

    @pytest.mark.parametrize("rot", [90, 180, 270])
    def test_mover_conserva_el_mk_r_existente(self, client, abrir, tmp_path, rot):
        def poner(doc, page):
            w = fitz.Widget()
            w.rect = fitz.Rect(300, 200, 420, 230)
            w.field_name = "ajeno"
            w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            a = page.add_widget(w)
            doc.xref_set_key(a.xref, "MK/R", "90")

        path = _pagina(tmp_path / f"k{rot}.pdf", rot, widget=poner)
        doc_id = abrir(path)
        xref = client.get(f"/pdf/widgets/{doc_id}/0").json()[0]["xref"]
        assert client.post(f"/pdf/widgets/{doc_id}/0/transform",
                           json={"xref": xref, "x": 20, "y": 20}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        doc = fitz.open(path)
        assert doc.xref_get_key(xref, "MK/R") == ("int", "90")
        doc.close()

    def test_sin_rotacion_no_se_escribe_mk_r(self, client, abrir, tmp_path):
        path = _pagina(tmp_path / "r0.pdf", 0)
        doc_id = abrir(path)
        client.post(f"/pdf/widgets/{doc_id}", json={
            "page_num": 0, "field_type": "text", "x": 60, "y": 70, "width": 140, "height": 24})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        doc = fitz.open(path)
        page = doc[0]
        w = next(page.widgets())
        assert w.rect == fitz.Rect(60, 70, 200, 94)
        assert doc.xref_get_key(w.xref, "MK/R")[0] == "null"
        doc.close()


class TestCropboxYRotacion:
    """Lo que devuelve cada ruta tiene que caer sobre lo que se ve en el render."""

    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_puntos_de_ajuste_sobre_la_raya(self, client, abrir, tmp_path, rot, recorte):
        path = _pagina(tmp_path / f"s{rot}.pdf", rot, recorte)
        raya = _caja(_render(path), _negro)
        pts = client.get(f"/pdf/snap-points/{abrir(path)}/0").json()["points"]
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        # La raya tiene 2 pt de grueso: el píxel pintado va de centro-1 a centro+1.
        assert _cerca((min(xs), min(ys), max(xs), max(ys)), raya, 1.5), (pts, raya)

    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_buscar_spans_y_zona_sobre_el_texto(self, client, abrir, tmp_path, rot, recorte):
        path = _pagina(tmp_path / f"b{rot}.pdf", rot, recorte)
        doc_id = abrir(path)
        tinta = fitz.Rect(_caja(_render(path), _azul))
        res = client.get(f"/pdf/search/{doc_id}?query=BUSCAME").json()
        assert len(res) == 1
        hallado = fitz.Rect(res[0]["x"], res[0]["y"], res[0]["x"] + res[0]["width"], res[0]["y"] + res[0]["height"])
        # La caja de búsqueda es la del tipo (con ascendentes/descendentes): contiene la tinta.
        assert hallado.contains(tinta), (hallado, tinta)
        sp = next(s for s in client.get(f"/pdf/spans/{doc_id}/0").json()["spans"] if "BUSCAME" in s["text"])
        assert fitz.Rect(sp["x0"], sp["y0"], sp["x1"], sp["y1"]).contains(tinta)
        zona = tinta + (-3, -3, 3, 3)
        texto = client.post(f"/pdf/text-clip/{doc_id}/0", json={
            "x": zona.x0, "y": zona.y0, "width": zona.width, "height": zona.height}).json()["text"]
        assert "BUSCAME" in texto

    @pytest.mark.parametrize("recorte", RECORTES, ids=IDS_RECORTE)
    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_marcas_incrustadas_y_leidas(self, client, abrir, tmp_path, rot, recorte):
        path = _pagina(tmp_path / f"e{rot}.pdf", rot, recorte)
        doc_id = abrir(path)
        rect = {"id": "r1", "type": "rect", "page": 0, "x": 60, "y": 80, "width": 120, "height": 60,
                "color": "#ff0000", "lineWidth": 2}
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [rect]}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        rojo = _caja(_render(path), lambda r, g, b: r > 200 and g < 80 and b < 80)
        assert _cerca(rojo, (59, 79, 180, 140), 2), rojo
        # Leída como ajena (sin el payload propio): la geometría sale del PDF.
        doc = fitz.open(path)
        page = doc[0]
        for a in page.annots():
            doc.xref_set_key(a.xref, "PM", "null")
            doc.xref_set_key(a.xref, "Name", "null")
        ajena = str(tmp_path / f"ajena{rot}.pdf")
        doc.save(ajena)
        doc.close()
        r = client.get(f"/pdf/annotations/{abrir(ajena)}").json()["annotations"][0]
        assert _cerca((r["x"], r["y"], r["width"], r["height"]), (59, 79, 122, 62), 0.01)

    @pytest.mark.parametrize("rot", ROTACIONES)
    def test_puntos_de_ajuste_tras_recortar_en_la_app(self, client, abrir, tmp_path, rot):
        """El cropbox puesto por /pdf/crop sobre el documento vivo (sin reabrir)."""
        path = _pagina(tmp_path / f"cr{rot}.pdf", rot)
        doc_id = abrir(path)
        client.get(f"/pdf/snap-points/{doc_id}/0")  # llena el cache: el recorte lo tiene que vaciar
        r = client.post(f"/pdf/crop/{doc_id}", json={"page_num": 0, "top": 10, "right": 20, "bottom": 30, "left": 40})
        assert r.status_code == 200, r.text
        pts = client.get(f"/pdf/snap-points/{doc_id}/0").json()["points"]
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        raya = _caja(_render(path), _negro)
        xs = [p["x"] for p in pts]
        ys = [p["y"] for p in pts]
        assert _cerca((min(xs), min(ys), max(xs), max(ys)), raya, 1.5), (pts, raya)
