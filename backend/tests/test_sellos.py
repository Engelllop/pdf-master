"""Sellos de página en capa propia: encabezado y pie, numeración y marca de agua.

Antes se escribían sueltos en el contenido: aplicar dos veces los apilaba, no había
forma de quitarlos, y encabezado y números caían en el mismo sitio."""
from datetime import date

import fitz

from app.services._pdf_sellos import expandir


def _pdf(tmp_path, paginas=3, w=612, h=792, rot=0, nombre="doc.pdf"):
    path = str(tmp_path / nombre)
    doc = fitz.open()
    for k in range(paginas):
        page = doc.new_page(width=w, height=h)
        page.insert_text((72, 120), f"Contenido {k + 1}", fontsize=14)
        page.set_rotation(rot)
    doc.save(path)
    doc.close()
    return path


def _abrir(client, path):
    return client.post("/pdf/open", json={"file_path": path}).json()["doc_id"]


def _guardar(client, doc_id, tmp_path, nombre="salida.pdf"):
    out = str(tmp_path / nombre)
    assert client.post(f"/pdf/save/{doc_id}", params={"output_path": out}).status_code == 200
    return fitz.open(out)


def _lineas(page):
    """{texto: bbox en coordenadas de PANTALLA} de cada renglón."""
    return {"".join(s["text"] for s in l["spans"]).strip(): fitz.Rect(l["bbox"]) * page.rotation_matrix
            for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])}


PIE = {"zones": {"tl": "Proyecto Demo", "br": "Pagina {n} de {total}"}, "fontsize": 10}


class TestVariables:
    def test_expande_numero_total_fecha_y_archivo(self):
        hoy = date(2026, 10, 27)
        assert expandir("Pagina {n} de {total}", 3, 9, "A-101", hoy) == "Pagina 3 de 9"
        assert expandir("ABC{n:6}", 42, 9, "x", hoy) == "ABC000042"
        assert expandir("{archivo} - {fecha}", 1, 1, "A-101", hoy) == "A-101 - 27/10/2026"
        assert expandir("{desconocida}", 1, 1, "x", hoy) == "{desconocida}"


class TestEncabezadoYPie:
    def test_escribe_cada_zona_en_su_esquina(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        assert client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE}).status_code == 200
        lineas = _lineas(_guardar(client, doc_id, tmp_path)[1])
        assert lineas["Proyecto Demo"].x0 < 100 and lineas["Proyecto Demo"].y1 < 60
        pie = lineas["Pagina 2 de 3"]
        assert pie.x1 > 612 - 100 and pie.y0 > 792 - 60

    def test_reaplicar_reemplaza_no_apila(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        for _ in range(3):
            client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE})
        assert _guardar(client, doc_id, tmp_path)[0].get_text().count("Proyecto Demo") == 1

    def test_el_rango_manda_y_las_demas_lo_pierden(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE})
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE, "pages": [1]})
        doc = _guardar(client, doc_id, tmp_path)
        assert ["Proyecto Demo" in p.get_text() for p in doc] == [False, True, False]

    def test_en_pagina_girada_queda_en_su_lugar(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path, rot=90))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE})
        page = _guardar(client, doc_id, tmp_path)[0]
        vista = page.rect  # 792 x 612
        lineas = _lineas(page)
        assert lineas["Proyecto Demo"].x0 < 100 and lineas["Proyecto Demo"].y1 < 60
        assert lineas["Pagina 1 de 3"].x1 > vista.width - 100 and lineas["Pagina 1 de 3"].y0 > vista.height - 60
        # Y se lee derecho en pantalla: lo bastante ancho y bajo, no un renglón vertical.
        assert lineas["Proyecto Demo"].width > lineas["Proyecto Demo"].height

    def test_el_numero_inicial_corre_la_numeracion(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "numeracion",
                    "spec": {"zones": {"bc": "{n} / {total}"}, "start": 10}})
        assert "11 / 12" in _guardar(client, doc_id, tmp_path)[1].get_text()


class TestCapasIndependientes:
    def test_numeracion_y_encabezado_conviven_y_se_quitan_por_separado(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        r1 = client.post(f"/pdf/stamps/{doc_id}", json={"capa": "encabezado", "spec": PIE})
        r2 = client.post(f"/pdf/stamps/{doc_id}", json={"capa": "numeracion", "spec": {"zones": {"bc": "- {n} -"}}})
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        r = client.post(f"/pdf/stamps/remove/{doc_id}", json={"capa": "encabezado"}).json()
        assert "removed" in r, r
        assert r["removed"] == 3 and r["stash_id"]
        texto = _guardar(client, doc_id, tmp_path)[0].get_text()
        assert "Proyecto Demo" not in texto and "- 1 -" in texto and "Contenido 1" in texto

    def test_el_estado_devuelve_lo_aplicado_y_sobrevive_al_guardado(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "marca", "spec": {"text": "COPIA", "opacity": 0.4}})
        _guardar(client, doc_id, tmp_path, "con-marca.pdf")
        otro = _abrir(client, str(tmp_path / "con-marca.pdf"))
        estado = client.get(f"/pdf/stamps/{otro}").json()
        assert estado["marca"]["text"] == "COPIA" and estado["marca"]["opacity"] == 0.4
        assert estado["encabezado"] is None

    def test_quitar_una_capa_que_no_existe_no_ensucia(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        r = client.post(f"/pdf/stamps/remove/{doc_id}", json={"capa": "marca"}).json()
        assert r["removed"] == 0
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False


class TestMarcaDeAgua:
    def test_centrada_detras_y_tamano_relativo(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path, paginas=1))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "marca",
                    "spec": {"text": "BORRADOR", "behind": True, "angle": 0, "fontsize": 0}})
        page = _guardar(client, doc_id, tmp_path)[0]
        caja = _lineas(page)["BORRADOR"]
        assert abs((caja.x0 + caja.x1) / 2 - 306) < 15, "centrada en la hoja"
        assert caja.width > 612 * 0.5, "el tamaño automático escala con la hoja"
        # Detrás: el flujo de la marca va antes que el del contenido.
        assert b"/OC" in page.parent.xref_stream(page.get_contents()[0])

    def test_mosaico_cubre_la_hoja_con_tope(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path, paginas=1, w=2592, h=1728))
        client.post(f"/pdf/stamps/{doc_id}", json={"capa": "marca",
                    "spec": {"text": "CONFIDENCIAL", "mode": "tile", "fontsize": 0}})
        n = _guardar(client, doc_id, tmp_path)[0].get_text().count("CONFIDENCIAL")
        assert 4 <= n <= 400


class TestVistaPrevia:
    def test_devuelve_png_sin_tocar_el_documento(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        r = client.post(f"/pdf/stamps/preview/{doc_id}", json={"capa": "encabezado", "spec": PIE,
                        "page_num": 1, "width": 300})
        assert r.status_code == 200 and r.headers["content-type"] == "image/png"
        assert fitz.Pixmap(r.content).width == 300
        assert client.get(f"/pdf/dirty/{doc_id}").json()["dirty"] is False

    def test_las_franjas_amplian_arriba_y_abajo_con_contenido(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path, w=2592, h=1728))
        for area in ("top", "bottom"):
            r = client.post(f"/pdf/stamps/preview/{doc_id}", json={"capa": "encabezado", "spec": PIE,
                            "width": 1600, "area": area})
            pix = fitz.Pixmap(r.content)
            assert pix.width == 1600 and pix.height < 400, area
            # Mayormente papel blanco, no un recorte negro.
            muestras = [pix.pixel(x, y) for x in range(0, pix.width, 97) for y in range(0, pix.height, 23)]
            assert sum(1 for m in muestras if sum(m) > 600) > len(muestras) * 0.8, area

    def test_pagina_fuera_de_rango_es_404(self, client, tmp_path):
        doc_id = _abrir(client, _pdf(tmp_path))
        r = client.post(f"/pdf/stamps/preview/{doc_id}", json={"capa": "marca", "spec": {"text": "x"}, "page_num": 9})
        assert r.status_code == 404
