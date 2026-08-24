"""FreeText de otra herramienta (o de una versión vieja de la app): sin metadatos PM,
el tamaño y el color de la letra solo están en /DA."""
import fitz


def _pdf_con_freetext(path, text="Engell Javier", size=15, rgb=(0, 0.466667, 0.831373)):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    annot = page.add_freetext_annot(fitz.Rect(80, 100, 260, 120), text,
                                    fontsize=size, text_color=rgb)
    annot.update()
    doc.save(str(path))
    doc.close()
    return str(path)


class TestFreeTextAjeno:
    def test_importa_tamano_y_color_desde_da(self, client, tmp_path):
        path = _pdf_con_freetext(tmp_path / "ajeno.pdf")
        doc_id = client.post("/pdf/open", json={"file_path": path}).json()["doc_id"]
        anns = client.get(f"/pdf/annotations/{doc_id}").json()["annotations"]
        client.post(f"/pdf/close/{doc_id}")

        textos = [a for a in anns if a["type"] == "text"]
        assert len(textos) == 1
        a = textos[0]
        assert a["text"] == "Engell Javier"
        # Sin esto se importaba a 14 pt (el default del visor) y con el color del
        # fondo del globo: la letra quedaba de otro tamaño, o blanca sobre blanco.
        assert a["fontSize"] == 15
        assert a["color"].lower() == "#0077d4"
