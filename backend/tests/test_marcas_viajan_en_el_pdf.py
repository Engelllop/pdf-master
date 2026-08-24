"""Ya no se escribe sidecar: el PDF es el único lugar donde viven las marcas. Este
test fija qué tipos sobreviven a guardar + reabrir, para que quitar el .json no
signifique perder trabajo."""
import fitz

TIPOS = ['highlight', 'underline', 'strikethrough', 'note', 'draw', 'text', 'rect',
         'circle', 'arrow', 'line', 'callout', 'signature', 'measure_distance',
         'measure_area', 'measure_perimeter', 'count', 'check', 'cross', 'star',
         'cloud', 'polygon']
PUNTOS = [{"x": 30, "y": 300}, {"x": 60, "y": 330}, {"x": 90, "y": 310}]
PNG_1PX = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
           "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def _marca(tipo, i=0):
    a = {"id": tipo, "type": tipo, "page": 0, "x": 40, "y": 60 + i * 4,
         "width": 80, "height": 40, "color": "#ef4444", "text": "txt"}
    if tipo in ('draw', 'polygon', 'measure_perimeter', 'measure_area', 'signature',
                'cloud', 'callout'):
        a["points"] = PUNTOS
    if tipo.startswith('measure'):
        a["measurement"] = {"value": 1.0, "unit": "m", "label": "1.00 m"}
    return a


def _guardar_y_reabrir(client, open_doc, tmp_path, marcas, nombre):
    doc_id = open_doc(pages=1)["doc_id"]
    out = str(tmp_path / nombre)
    assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": marcas}).status_code == 200
    assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
    client.post(f"/pdf/close/{doc_id}")
    nuevo = client.post("/pdf/open", json={"file_path": out}).json()["doc_id"]
    got = client.get(f"/pdf/annotations/{nuevo}").json()["annotations"]
    client.post(f"/pdf/close/{nuevo}")
    return out, got


class TestMarcasViajanEnElPdf:
    def test_todos_los_tipos_vuelven_al_reabrir(self, client, open_doc, tmp_path):
        marcas = [_marca(t, i) for i, t in enumerate(TIPOS)]
        _, got = _guardar_y_reabrir(client, open_doc, tmp_path, marcas, "todas.pdf")
        recuperados = {a["type"] for a in got}
        assert set(TIPOS) - recuperados == set(), f"no volvieron: {set(TIPOS) - recuperados}"

    def test_un_globo_no_tumba_el_guardado(self, client, open_doc, tmp_path):
        """add_freetext_annot(border_color=...) reventaba y el save devolvía 400: una
        sola marca de globo dejaba el documento entero sin guardar."""
        marcas = [_marca('callout'), _marca('rect', 1), _marca('highlight', 2)]
        _, got = _guardar_y_reabrir(client, open_doc, tmp_path, marcas, "globo.pdf")
        assert {a["type"] for a in got} == {"callout", "rect", "highlight"}

    def test_estrella_y_nube_son_anotaciones_no_dibujo_horneado(self, client, open_doc, tmp_path):
        """Dibujadas en el contenido quedaban pegadas a la página: al reabrir no eran
        editables y, con el sidecar, se veían dos veces."""
        out, _ = _guardar_y_reabrir(
            client, open_doc, tmp_path, [_marca('star'), _marca('cloud', 1)], "formas.pdf")
        page = fitz.open(out).load_page(0)
        assert len(list(page.annots() or [])) == 2

    def test_guardar_no_deja_sidecar(self, client, open_doc, tmp_path):
        import os
        out, _ = _guardar_y_reabrir(
            client, open_doc, tmp_path, [_marca('rect')], "sin-sidecar.pdf")
        assert not os.path.exists(out + ".pdfmaster.json")

    def test_la_imagen_queda_incrustada_en_la_pagina(self, client, open_doc, tmp_path):
        """La imagen se hornea en el contenido (no vuelve como marca editable), pero
        tiene que estar dentro del PDF: si no, guardar la perdería."""
        marca = _marca('image')
        marca["imageData"] = PNG_1PX
        out, got = _guardar_y_reabrir(client, open_doc, tmp_path, [marca], "imagen.pdf")
        assert not [a for a in got if a["type"] == "image"]
        assert fitz.open(out).load_page(0).get_images()
