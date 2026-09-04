"""La miga de pan que identifica la peticion que mata al motor.

Un segfault de MuPDF se lleva el proceso sin traza y uvicorn solo escribe la linea
de acceso AL TERMINAR, asi que la peticion culpable no dejaba rastro. Se guarda
antes de ejecutarla y se reporta en el arranque siguiente.
"""
import re
import main as engine


class TestBreadcrumb:
    def test_se_borra_cuando_la_peticion_termina_bien(self, client, open_doc):
        info = open_doc(pages=1)
        assert client.get(f"/pdf/page-info/{info['doc_id']}/0?zoom=1.0").status_code == 200
        assert engine.BREADCRUMB.read_text(encoding="utf-8") == ""

    def test_el_health_check_no_pisa_la_miga(self, client):
        engine._write_breadcrumb("POST /pdf/watermark/abc?")
        assert client.get("/pdf/health").status_code == 200
        assert "watermark" in engine.BREADCRUMB.read_text(encoding="utf-8")
        engine._write_breadcrumb("")

    def test_guarda_metodo_ruta_y_query(self, client, open_doc, monkeypatch):
        """Lo que queda escrito mientras la peticion corre es lo que se veria tras
        un crash: el id de la operacion, metodo, ruta y query."""
        seen = {}

        original = engine._write_breadcrumb

        def spy(text):
            if text:
                seen["text"] = text
            original(text)

        monkeypatch.setattr(engine, "_write_breadcrumb", spy)
        info = open_doc(pages=1)
        client.get(f"/pdf/page-info/{info['doc_id']}/0?zoom=1.5")
        assert re.match(r"^\[[0-9a-f]{8}\] GET /pdf/page-info/", seen["text"]), seen["text"]
        assert seen["text"].endswith("?zoom=1.5")

    def test_al_arrancar_reporta_y_limpia_la_miga_pendiente(self, caplog):
        engine._write_breadcrumb("POST /pdf/compress/abc?output_path=x.pdf")
        with caplog.at_level("ERROR"):
            engine._report_previous_crash()
        assert "EL MOTOR ANTERIOR MURIO" in caplog.text
        assert "/pdf/compress/abc" in caplog.text
        assert not engine.BREADCRUMB.exists()
