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
