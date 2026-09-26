"""Hallazgos de la auditoría del motor: escrituras que no pasaban por el guardado
atómico, un fitz.Document que quedaba abierto, fallos silenciosos al estampar marcas,
marcas de un XFDF que se perdían sin decirlo y métodos que tocaban MuPDF sin el lock."""
import logging

import fitz
import pytest

from app.models.pdf import Annotation
from app.services import _pdf_pages
from app.services.pdf_service import pdf_service


def _espiar_guardado(monkeypatch):
    rutas = []
    original = pdf_service._guardar_atomico

    def espia(save_path, backup, escribir):
        rutas.append(save_path)
        return original(save_path, backup, escribir)

    monkeypatch.setattr(pdf_service, "_guardar_atomico", espia)
    return rutas


class TestEscriturasAtomicas:
    def test_guardar_pagina_como_png_es_atomico(self, client, open_doc, tmp_path, monkeypatch):
        """Escribía con open() directo: un fallo a mitad dejaba truncado el PNG que el
        usuario había elegido sobrescribir."""
        doc_id = open_doc(pages=1)["doc_id"]
        out = str(tmp_path / "pagina.png")
        rutas = _espiar_guardado(monkeypatch)
        r = client.post(f"/pdf/save-page-image/{doc_id}/0?output_path={out}")
        assert r.status_code == 200, r.text
        assert rutas == [out]
        with open(out, "rb") as fh:
            assert fh.read(8) == b"\x89PNG\r\n\x1a\n"

    def test_exportar_xfdf_es_atomico(self, client, open_doc, tmp_path, monkeypatch):
        doc_id = open_doc(pages=1)["doc_id"]
        out = str(tmp_path / "marcas.xfdf")
        rutas = _espiar_guardado(monkeypatch)
        anns = {"annotations": [{"id": "r1", "type": "rect", "page": 0, "x": 1, "y": 2,
                                 "width": 30, "height": 20, "color": "#ff0000"}]}
        assert client.post(f"/pdf/export-xfdf/{doc_id}?output_path={out}", json=anns).status_code == 200
        assert rutas == [out]
        assert "<xfdf" in open(out, encoding="utf-8").read()


class TestUnirCierraLaFuente:
    def test_si_insertar_falla_la_fuente_queda_cerrada(self, open_doc, pdf_factory, monkeypatch):
        doc_id = open_doc(pages=1)["doc_id"]
        fuente = pdf_factory(pages=1)
        abiertas = []
        abrir = fitz.open

        def abrir_y_anotar(*args, **kwargs):
            doc = abrir(*args, **kwargs)
            if args and args[0] == fuente:
                abiertas.append(doc)
            return doc

        def insertar_roto(self, *args, **kwargs):
            raise RuntimeError("insert_pdf roto")

        monkeypatch.setattr(_pdf_pages.fitz, "open", abrir_y_anotar)
        monkeypatch.setattr(fitz.Document, "insert_pdf", insertar_roto)
        assert pdf_service.merge_pdf(doc_id, fuente) is False
        assert len(abiertas) == 1 and abiertas[0].is_closed


class _AnotRota:
    """Anotación en la que falla todo lo que se le intenta poner."""
    xref = 0
    parent = None

    def __getattr__(self, nombre):
        def falla(*args, **kwargs):
            raise RuntimeError(f"{nombre} roto")
        return falla


class TestFallosAlEstamparNoSonSilenciosos:
    def test_estilo_y_metadatos_fallidos_quedan_en_el_log(self, caplog):
        ann = Annotation(id="m-rota", type="rect", page=0, x=0, y=0, opacity=0.5)
        with caplog.at_level(logging.WARNING, logger="pdfmaster"):
            # Sigue sin reventar: una marca a medio estilar se guarda igual.
            pdf_service._style_annot(_AnotRota(), ann, (1, 0, 0))
            pdf_service._stamp_markup(_AnotRota(), ann)
        avisos = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(avisos) >= 5
        assert all("m-rota" in r.getMessage() and "rect" in r.getMessage() for r in avisos)
        assert all(r.exc_info for r in avisos)


class TestXfdfDiceCuantasSeSaltaron:
    def test_las_marcas_ilegibles_se_cuentan(self, client, open_doc, tmp_path):
        """Una marca que no se podía leer solo quedaba en el log: el usuario creía haber
        importado la revisión entera."""
        doc_id = open_doc(pages=1)["doc_id"]
        ruta = tmp_path / "rota.xfdf"
        ruta.write_text(
            '''<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/"><annots>
<square page="0" name="ok" rect="10,700,110,740" color="#FF0000"/>
<square page="0" name="rota1" rect="a,b,c,d" color="#FF0000"/>
<circle page="x" name="rota2" rect="10,10,20,20"/>
</annots></xfdf>''', encoding="utf-8")
        r = client.post(f"/pdf/import-xfdf/{doc_id}", json={"file_path": str(ruta)})
        assert r.status_code == 200, r.text
        body = r.json()
        assert [a["id"] for a in body["annotations"]] == ["ok"]
        assert body["skipped"] == 2

    def test_sin_fallos_skipped_es_cero(self, client, open_doc, tmp_path):
        doc_id = open_doc(pages=1)["doc_id"]
        ruta = tmp_path / "bien.xfdf"
        ruta.write_text(
            '''<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/"><annots>
<square page="0" name="ok" rect="10,700,110,740" color="#FF0000"/>
</annots></xfdf>''', encoding="utf-8")
        body = client.post(f"/pdf/import-xfdf/{doc_id}", json={"file_path": str(ruta)}).json()
        assert body["skipped"] == 0 and len(body["annotations"]) == 1


def _png(tmp_path):
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 4, 4), False)
    ruta = str(tmp_path / "img.png")
    pix.save(ruta)
    return ruta


# (nombre, llamada). Las que necesitan un stash lo sacan primero de otra operación.
METODOS = [
    ("rotate_page", lambda s, d, t: s.rotate_page(d, 0, 90)),
    ("rotate_all_pages", lambda s, d, t: s.rotate_all_pages(d, 90)),
    ("rotate_pages", lambda s, d, t: s.rotate_pages(d, [0], 90)),
    ("reorder_pages", lambda s, d, t: s.reorder_pages(d, [1, 0])),
    ("delete_pages", lambda s, d, t: s.delete_pages(d, [1])),
    ("restore_pages", lambda s, d, t: s.restore_pages(d, s._stash_pages(s._docs[d], [0]), [0])),
    ("merge_pdf", lambda s, d, t: s.merge_pdf(d, t["fuente"])),
    ("crop_page", lambda s, d, t: s.crop_page(d, 0, 5, 5, 5, 5)),
    ("replace_page", lambda s, d, t: s.replace_page(d, 0, s._stash_pages(s._docs[d], [0]))),
    ("get_text_clip", lambda s, d, t: s.get_text_clip(d, 0, 0, 0, 100, 100)),
    ("ocr_page", lambda s, d, t: s.ocr_page(d, 99)),
    ("add_watermark", lambda s, d, t: s.add_watermark(d, "X")),
    ("redact_area", lambda s, d, t: s.redact_area(d, 0, 10, 10, 20, 20)),
    ("insert_image", lambda s, d, t: s.insert_image(d, 0, 10, 10, 20, 20, t["png"])),
    ("add_header_footer", lambda s, d, t: s.add_header_footer(d, header="h")),
    ("replace_text", lambda s, d, t: s.replace_text(d, "Hola", "Chau")),
    ("set_metadata", lambda s, d, t: s.set_metadata(d, title="t")),
    ("export_pptx", lambda s, d, t: s.export_pptx(d, t["dir"] + "/x.pptx")),
    ("export_txt", lambda s, d, t: s.export_txt(d, t["dir"] + "/x.txt")),
    ("export_html", lambda s, d, t: s.export_html(d, t["dir"] + "/x.html")),
    ("export_word", lambda s, d, t: s.export_word(d)),
    ("get_form_fields", lambda s, d, t: s.get_form_fields(d, 0)),
    ("_import_native", lambda s, d, t: s._import_native(d)),
    ("embed_annotations", lambda s, d, t: s.embed_annotations(d, [])),
]


class TestTodoAccesoAMuPdfConLock:
    """MuPDF no es thread-safe. Estos métodos solo estaban serializados por el
    threadpool de un worker de main.py: llamados desde otro sitio (un test, un script,
    un cambio del limitador) entraban a MuPDF a la vez."""

    @pytest.mark.parametrize("nombre,llamada", METODOS, ids=[m[0] for m in METODOS])
    def test_acquire_se_llama_con_el_lock_tomado(self, open_doc, pdf_factory, tmp_path, monkeypatch, nombre, llamada):
        doc_id = open_doc(pages=2)["doc_id"]
        extra = {"fuente": pdf_factory(pages=1), "png": _png(tmp_path), "dir": str(tmp_path)}
        con_lock = []
        acquire = pdf_service._acquire

        def acquire_vigilado(did):
            con_lock.append(pdf_service._lock._is_owned())
            return acquire(did)

        monkeypatch.setattr(pdf_service, "_acquire", acquire_vigilado)
        llamada(pdf_service, doc_id, extra)
        assert con_lock, f"{nombre} no llamó a _acquire"
        assert all(con_lock), f"{nombre} tocó el documento sin el lock"
