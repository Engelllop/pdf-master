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

    def test_el_estilo_del_cuadro_de_texto_sobrevive(self, client, open_doc, tmp_path):
        """El FreeText nativo solo guarda tamaño, color y alineación: negrita, cursiva,
        interlineado y viñetas viajan en el payload propio. Sin eso, guardar y reabrir
        devolvía el texto en redonda y sin lista."""
        marca = {
            "id": "t1", "type": "text", "page": 0, "x": 40, "y": 60,
            "width": 200, "height": 60, "color": "#111111",
            "text": "Revisar niveles" + chr(10) + "Antes de imprimir",
            "fontSize": 12, "fontFamily": "Times", "bold": True, "italic": True,
            "align": "center", "lineHeight": 1.5, "listStyle": "bullet",
        }
        _, got = _guardar_y_reabrir(client, open_doc, tmp_path, [marca], "estilo.pdf")
        texto = [a for a in got if a["type"] == "text"]
        assert len(texto) == 1
        a = texto[0]
        assert a["bold"] is True and a["italic"] is True
        assert a["align"] == "center"
        assert a["lineHeight"] == 1.5
        assert a["listStyle"] == "bullet"
        assert a["fontFamily"] == "Times"
        # El texto vuelve limpio: las viñetas se dibujan al incrustar, no se guardan
        # dentro del texto (si no, al reeditar saldrían dobles).
        assert not a["text"].lstrip().startswith("•")


class TestResumenDeMarcas:
    def test_lleva_el_valor_medido_y_el_tipo_en_castellano(self, client, open_doc, tmp_path):
        """El resumen lo lee una persona: sin la medida, un takeoff salía como una
        lista de 'measure_distance' sin ningún número."""
        doc_id = open_doc(pages=1)["doc_id"]
        marca = {
            "id": "m1", "type": "measure_distance", "page": 0,
            "x": 10, "y": 10, "width": 100, "height": 0, "color": "#ef4444",
            "measurement": {"value": 12.5, "unit": "m", "label": "12.50 m"},
        }
        out = str(tmp_path / "resumen.pdf")
        res = client.post(f"/pdf/markup-summary/{doc_id}?output_path={out}",
                          json={"annotations": [marca]})
        assert res.status_code == 200
        assert res.json()["output_path"] == out

        texto = fitz.open(out)[0].get_text()
        assert "12.50 m" in texto
        assert "Distancia" in texto
        assert "measure_distance" not in texto

    def test_sin_output_path_sigue_devolviendo_base64(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        res = client.post(f"/pdf/markup-summary/{doc_id}", json={"annotations": []})
        assert res.status_code == 200
        assert res.json()["data_base64"]


class TestTextoVisibleFueraDeLatin1:
    """La APARIENCIA de un cuadro de texto la dibuja PyMuPDF con una fuente base, que
    solo cubre latin-1 y descarta el resto sin avisar: en otro visor (y en el papel) un
    «≥» o una raya «—» salían como un hueco. El dato exacto no se pierde: viaja en
    `content` y en el payload, así que la app lo restaura tal cual al reabrir."""

    TEXTO = "≥ 3 m — revisar"

    def _guardar_con_cuadro(self, client, open_doc, tmp_path):
        info = open_doc(pages=1, text="")
        doc_id = info["doc_id"]
        out = str(tmp_path / "cuadro.pdf")
        anns = {"annotations": [{
            "id": "t1", "type": "text", "page": 0, "x": 30, "y": 40,
            "width": 300, "height": 40, "text": self.TEXTO, "fontSize": 12, "color": "#000000",
        }]}
        assert client.post(f"/pdf/embed/{doc_id}", json=anns).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        client.post(f"/pdf/close/{doc_id}")
        return out

    def test_la_apariencia_translitera_en_vez_de_perder(self, client, open_doc, tmp_path):
        import fitz
        out = self._guardar_con_cuadro(client, open_doc, tmp_path)
        with fitz.open(out) as d:
            visible = "".join(a.get_text() for a in (d[0].annots() or []))
        assert ">= 3 m - revisar" in visible
        assert "≥" not in visible

    def test_al_reabrir_la_app_recupera_el_texto_exacto(self, client, open_doc, tmp_path):
        out = self._guardar_con_cuadro(client, open_doc, tmp_path)
        nuevo = client.post("/pdf/open", json={"file_path": out}).json()["doc_id"]
        try:
            anns = client.get(f"/pdf/annotations/{nuevo}").json()["annotations"]
        finally:
            client.post(f"/pdf/close/{nuevo}")
        assert [a["text"] for a in anns] == [self.TEXTO]

class TestTamanoDeLaBurbujaDeConteo:
    """El diametro lo elige el usuario y viaja en `width`, en puntos del PDF: una
    burbuja puesta al 400% tiene que salir igual que una puesta al 50%."""

    def test_el_tamano_elegido_sobrevive_a_guardar_y_reabrir(self, client, open_doc, tmp_path):
        marcas = [
            {"id": "c-chica", "type": "count", "page": 0, "x": 60, "y": 100,
             "color": "#ef4444", "text": "Luminarias", "symbol": "circle", "width": 12},
            {"id": "c-grande", "type": "count", "page": 0, "x": 160, "y": 100,
             "color": "#ef4444", "text": "Luminarias", "symbol": "circle", "width": 36},
        ]
        _, got = _guardar_y_reabrir(client, open_doc, tmp_path, marcas, "conteo.pdf")
        anchos = sorted(round(a["width"]) for a in got if a["type"] == "count")
        assert anchos == [12, 36], anchos

    def test_una_marca_vieja_sin_tamano_conserva_el_de_siempre(self, client, open_doc, tmp_path):
        """Las marcas hechas antes de que el tamano fuera elegible no llevan `width`:
        tienen que seguir midiendo 18 pt y no cambiar de tamano al reabrirlas."""
        marcas = [{"id": "c-vieja", "type": "count", "page": 0, "x": 60, "y": 100,
                   "color": "#ef4444", "text": "General", "symbol": "circle"}]
        _, got = _guardar_y_reabrir(client, open_doc, tmp_path, marcas, "conteo-viejo.pdf")
        conteos = [a for a in got if a["type"] == "count"]
        assert len(conteos) == 1
        assert round(conteos[0]["width"]) == 18
