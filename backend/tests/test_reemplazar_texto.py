"""Reemplazar texto redactaba TODAS las ocurrencias de la página y escribía el
reemplazo solo en la primera: el resto desaparecía del plano y el aviso las contaba
como reemplazadas. El estilo se leía después de redactar (o sea, cuando ya no había
texto que consultar) y el reemplazo se insertaba en la esquina superior de la caja, que
para `insert_text` es la línea base — una línea más arriba."""
import fitz
import pytest


@pytest.fixture
def pdf_con_revisiones(tmp_path):
    """Tres «REV B» en rojo a 14 pt en la página 1, una en la página 2."""
    ruta = tmp_path / "plano.pdf"
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    for y in (100, 200, 300):
        pg.insert_text((72, y), "REV B", fontsize=14, color=(1, 0, 0))
    pg2 = doc.new_page(width=595, height=842)
    pg2.insert_text((72, 100), "REV B", fontsize=14, color=(1, 0, 0))
    doc.save(str(ruta))
    doc.close()
    return str(ruta)


def _spans(path, page=0):
    doc = fitz.open(path)
    try:
        return [
            {"text": sp["text"].strip(), "y0": round(sp["bbox"][1], 1), "y1": round(sp["bbox"][3], 1),
             "size": round(sp["size"], 1), "color": sp["color"]}
            for b in doc[page].get_text("dict")["blocks"]
            for l in b.get("lines", [])
            for sp in l["spans"]
        ]
    finally:
        doc.close()


def _reemplazar(client, doc_id, tmp_path, nombre, **body):
    r = client.post(f"/pdf/replace-text/{doc_id}", json={"query": "REV B", "replace": "REV C", **body})
    assert r.status_code == 200, r.text
    salida = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}?output_path={salida}").status_code == 200
    return r.json(), salida


class TestReemplazarTexto:
    def test_reemplaza_todas_las_ocurrencias_de_la_pagina(self, client, pdf_con_revisiones, tmp_path):
        doc_id = client.post("/pdf/open", json={"file_path": pdf_con_revisiones}).json()["doc_id"]
        datos, salida = _reemplazar(client, doc_id, tmp_path, "a.pdf", replace_all=True)
        client.post(f"/pdf/close/{doc_id}")
        assert datos["replaced"] == 4  # 3 en la página 1 + 1 en la página 2
        textos = [s["text"] for s in _spans(salida)]
        assert textos.count("REV C") == 3
        assert "REV B" not in textos

    def test_el_reemplazo_queda_donde_estaba_el_original(self, client, pdf_con_revisiones, tmp_path):
        antes = _spans(pdf_con_revisiones)
        doc_id = client.post("/pdf/open", json={"file_path": pdf_con_revisiones}).json()["doc_id"]
        _, salida = _reemplazar(client, doc_id, tmp_path, "b.pdf", replace_all=True)
        client.post(f"/pdf/close/{doc_id}")
        despues = _spans(salida)
        # Misma caja vertical: `insert_text` recibe la línea base, no la esquina de arriba.
        assert [s["y0"] for s in despues] == [s["y0"] for s in antes]
        assert [s["y1"] for s in despues] == [s["y1"] for s in antes]

    def test_conserva_tamano_y_color(self, client, pdf_con_revisiones, tmp_path):
        doc_id = client.post("/pdf/open", json={"file_path": pdf_con_revisiones}).json()["doc_id"]
        _, salida = _reemplazar(client, doc_id, tmp_path, "c.pdf", replace_all=True)
        client.post(f"/pdf/close/{doc_id}")
        for s in _spans(salida):
            assert s["size"] == 14.0
            assert s["color"] == 0xFF0000

    # `replace_all=False` es «reemplazar esta»: borrar las otras dos y no escribirlas
    # era perder texto del plano sin decirlo.
    def test_reemplazar_una_no_toca_las_demas(self, client, pdf_con_revisiones, tmp_path):
        doc_id = client.post("/pdf/open", json={"file_path": pdf_con_revisiones}).json()["doc_id"]
        datos, salida = _reemplazar(client, doc_id, tmp_path, "d.pdf", replace_all=False)
        client.post(f"/pdf/close/{doc_id}")
        assert datos["replaced"] == 1
        textos = [s["text"] for s in _spans(salida)]
        assert textos.count("REV C") == 1
        assert textos.count("REV B") == 2

    def test_limitar_a_una_pagina(self, client, pdf_con_revisiones, tmp_path):
        doc_id = client.post("/pdf/open", json={"file_path": pdf_con_revisiones}).json()["doc_id"]
        datos, salida = _reemplazar(client, doc_id, tmp_path, "e.pdf", page_num=1, replace_all=True)
        client.post(f"/pdf/close/{doc_id}")
        assert datos["replaced"] == 1
        assert [s["text"] for s in _spans(salida, 0)].count("REV B") == 3
        assert [s["text"] for s in _spans(salida, 1)] == ["REV C"]


class TestFuentesBase14:
    """Courier tenía dos variantes cruzadas: la itálica devolvía la negrita-itálica y
    la negrita-itálica devolvía la negrita."""

    @pytest.mark.parametrize("fuente,esperado", [
        ("Courier", "cour"),
        ("Courier-Bold", "cobo"),
        ("Courier-Oblique", "coit"),
        ("Courier-BoldOblique", "cobi"),
        ("Helvetica-BoldOblique", "hebi"),
        ("Times-Italic", "tiit"),
    ])
    def test_cada_variante_a_su_base14(self, fuente, esperado):
        from app.services.pdf_service import pdf_service
        assert pdf_service._base14_font(fuente) == esperado
