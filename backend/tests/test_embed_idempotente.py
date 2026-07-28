"""Guardar dos veces no puede apilar las marcas.

`embed_annotations` aplicaba las marcas al documento VIVO y `save` no lo recarga,
asi que el segundo guardado las volvia a dibujar encima del primero: un resaltado
pasaba a ser dos, tres... Ahora las marcas quedan en cola y cada guardado las
incrusta sobre una copia limpia.
"""
import fitz


def _ann(id_, **extra):
    base = {"id": id_, "type": "highlight", "page": 0, "x": 50, "y": 50,
            "width": 100, "height": 12, "color": "#ffff00"}
    base.update(extra)
    return base


def _annots(path):
    with fitz.open(path) as d:
        return len(list(d.load_page(0).annots()))


class TestEmbedIdempotente:
    def test_guardar_dos_veces_no_duplica(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "dos-veces.pdf")
        body = {"annotations": [_ann("h1")]}

        for _ in range(3):
            assert client.post(f"/pdf/embed/{doc_id}", json=body).status_code == 200
            assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200

        assert _annots(out) == 1

    def test_el_documento_vivo_no_se_ensucia_con_las_marcas(self, client, open_doc, tmp_path):
        """La copia en memoria se queda limpia: es lo que evita el apilado y lo que
        hace que el visor no vea las marcas dos veces (bitmap + capa de la app)."""
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [_ann("h1")]}).status_code == 200

        raw = client.get(f"/pdf/raw/{doc_id}")
        assert raw.status_code == 200
        with fitz.open(stream=raw.content, filetype="pdf") as vivo:
            assert len(list(vivo.load_page(0).annots())) == 0

    def test_al_quitar_todas_las_marcas_el_guardado_sale_limpio(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "limpio.pdf")

        client.post(f"/pdf/embed/{doc_id}", json={"annotations": [_ann("h1")]})
        client.post(f"/pdf/save/{doc_id}?output_path={out}")
        assert _annots(out) == 1

        client.post(f"/pdf/embed/{doc_id}", json={"annotations": []})
        client.post(f"/pdf/save/{doc_id}?output_path={out}")
        assert _annots(out) == 0

    def test_guardar_una_copia_no_limpia_el_original(self, client, open_doc, tmp_path):
        """`Guardar como` no toca el archivo original, asi que sigue con cambios
        pendientes: marcarlo como guardado haria perder el aviso al cerrar."""
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        client.post(f"/pdf/embed/{doc_id}", json={"annotations": [_ann("h1")]})
        client.post(f"/pdf/save/{doc_id}?output_path={tmp_path / 'copia.pdf'}")
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True

        client.post(f"/pdf/save/{doc_id}")
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False
