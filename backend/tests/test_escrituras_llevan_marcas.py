"""Guardar no es la única forma de escribir el PDF del usuario: comprimir y quitar la
contraseña también escriben un archivo completo, y escribían el documento SIN las marcas
que el usuario tenía sin guardar. Si además elegía escribir encima del propio original,
el archivo en disco perdía lo que acababa de marcar."""
import fitz

MARCA = {"id": "m1", "type": "rect", "page": 0, "x": 40, "y": 60,
         "width": 120, "height": 50, "color": "#ef4444", "text": "revisar"}


def _marcas_en(path):
    doc = fitz.open(path)
    try:
        return [a.info.get("name", "") for a in doc[0].annots()]
    finally:
        doc.close()


class TestEscriturasLlevanMarcas:
    def test_comprimir_lleva_las_marcas_pendientes(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        out = str(tmp_path / "comprimido.pdf")
        assert client.post(f"/pdf/compress/{doc_id}?output_path={out}").status_code == 200
        assert any("pdfmaster:m1" in n for n in _marcas_en(out))

    def test_comprimir_encima_del_original_no_borra_las_marcas(self, client, open_doc):
        info = open_doc(pages=1)
        doc_id, original = info["doc_id"], info["file_path"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.post(f"/pdf/compress/{doc_id}?output_path={original}").status_code == 200
        assert any("pdfmaster:m1" in n for n in _marcas_en(original))

    def test_quitar_contrasena_lleva_las_marcas(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        out = str(tmp_path / "sin_clave.pdf")
        assert client.post(f"/pdf/remove-password/{doc_id}?output_path={out}").status_code == 200
        assert any("pdfmaster:m1" in n for n in _marcas_en(out))

    # Escribir una COPIA no guarda el original: apagar el «sin guardar» ahí deja cerrar
    # el documento sin aviso y perder las marcas.
    def test_quitar_contrasena_a_una_copia_no_limpia_el_sin_guardar(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True
        out = str(tmp_path / "copia.pdf")
        assert client.post(f"/pdf/remove-password/{doc_id}?output_path={out}").status_code == 200
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is True

    def test_quitar_contrasena_encima_del_original_si_limpia(self, client, open_doc):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.post(f"/pdf/remove-password/{doc_id}").status_code == 200
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False

    # El documento VIVO se queda limpio: si estas rutas dibujaran encima, escribir dos
    # veces apilaría las marcas (1 → 2 → 3…).
    def test_comprimir_dos_veces_no_apila_las_marcas(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        primero = str(tmp_path / "c1.pdf")
        segundo = str(tmp_path / "c2.pdf")
        assert client.post(f"/pdf/compress/{doc_id}?output_path={primero}").status_code == 200
        assert client.post(f"/pdf/compress/{doc_id}?output_path={segundo}").status_code == 200
        assert len(_marcas_en(segundo)) == len(_marcas_en(primero)) == 1


class TestExtraerPaginasLlevaMarcas:
    """Extraer páginas es el camino de «mandale esta lámina a alguien»: copiaba las
    páginas del documento vivo, o sea limpias."""

    def test_el_extracto_lleva_las_marcas_de_esa_pagina(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=3)["doc_id"]
        marca = dict(MARCA, page=1)
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [marca]}).status_code == 200
        out = str(tmp_path / "extracto.pdf")
        r = client.post(f"/pdf/split/{doc_id}?output_path={out}", json={"pages": [1, 2]})
        assert r.status_code == 200
        # La página 2 del original es la primera del extracto: la marca viaja con ella.
        assert any("pdfmaster:m1" in n for n in _marcas_en(out))

    def test_una_pagina_sin_marcas_sale_sin_marcas(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=3)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [dict(MARCA, page=1)]}).status_code == 200
        out = str(tmp_path / "extracto2.pdf")
        assert client.post(f"/pdf/split/{doc_id}?output_path={out}", json={"pages": [0]}).status_code == 200
        assert _marcas_en(out) == []

    def test_extraer_dos_veces_no_apila_las_marcas(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=2)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        uno = str(tmp_path / "e1.pdf")
        dos = str(tmp_path / "e2.pdf")
        assert client.post(f"/pdf/split/{doc_id}?output_path={uno}", json={"pages": [0]}).status_code == 200
        assert client.post(f"/pdf/split/{doc_id}?output_path={dos}", json={"pages": [0]}).status_code == 200
        assert len(_marcas_en(dos)) == len(_marcas_en(uno)) == 1

    # Una lista de páginas toda fuera de rango no es un PDF de cero páginas: es un 400.
    def test_paginas_fuera_de_rango_sigue_fallando_limpio(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=2)["doc_id"]
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        out = str(tmp_path / "nada.pdf")
        r = client.post(f"/pdf/split/{doc_id}?output_path={out}", json={"pages": [7, 9]})
        assert r.status_code == 400
