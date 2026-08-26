"""/pdf/raw alimenta al visor (PDF.js). Con el documento limpio se sirve el archivo
tal cual — el atajo que evita re-comprimir un plano entero — pero en cuanto hay una
edición sin guardar tiene que reflejarla."""
import fitz


class TestRawBytes:
    def test_documento_limpio_devuelve_el_pdf(self, client, open_doc):
        doc_id = open_doc(pages=2)["doc_id"]
        res = client.get(f"/pdf/raw/{doc_id}")
        assert res.status_code == 200
        assert res.content.startswith(b"%PDF")
        assert len(fitz.open(stream=res.content, filetype="pdf")) == 2

    def test_refleja_ediciones_sin_guardar(self, client, open_doc):
        doc_id = open_doc(pages=3)["doc_id"]
        assert client.post(f"/pdf/delete-pages/{doc_id}", json={"pages": [0]}).status_code == 200
        res = client.get(f"/pdf/raw/{doc_id}")
        assert res.status_code == 200
        assert len(fitz.open(stream=res.content, filetype="pdf")) == 2

    def test_marks_dibuja_las_marcas_sin_guardar(self, client, open_doc):
        """La impresión pide marks=1: un plano marcado salía en papel SIN las marcas
        porque se imprimía el documento limpio."""
        doc_id = open_doc(pages=1)["doc_id"]
        marca = {
            "id": "a1", "type": "rect", "page": 0,
            "x": 50, "y": 50, "width": 120, "height": 60, "color": "#ff0000",
        }
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [marca]}).status_code == 200

        limpio = client.get(f"/pdf/raw/{doc_id}")
        marcado = client.get(f"/pdf/raw/{doc_id}?marks=1")
        assert limpio.status_code == 200 and marcado.status_code == 200
        assert len(fitz.open(stream=marcado.content, filetype="pdf")[0].get_drawings()) >                len(fitz.open(stream=limpio.content, filetype="pdf")[0].get_drawings())

    def test_marks_no_toca_el_documento_vivo(self, client, open_doc):
        """Dibujar para imprimir sobre el documento vivo apilaría las marcas en el
        siguiente guardado (el mismo motivo por el que embed no las aplica)."""
        doc_id = open_doc(pages=1)["doc_id"]
        marca = {
            "id": "a1", "type": "rect", "page": 0,
            "x": 50, "y": 50, "width": 120, "height": 60, "color": "#ff0000",
        }
        client.post(f"/pdf/embed/{doc_id}", json={"annotations": [marca]})
        client.get(f"/pdf/raw/{doc_id}?marks=1")
        client.get(f"/pdf/raw/{doc_id}?marks=1")
        una_vez = len(fitz.open(stream=client.get(f"/pdf/raw/{doc_id}?marks=1").content, filetype="pdf")[0].get_drawings())
        limpio = len(fitz.open(stream=client.get(f"/pdf/raw/{doc_id}").content, filetype="pdf")[0].get_drawings())
        assert una_vez > limpio
