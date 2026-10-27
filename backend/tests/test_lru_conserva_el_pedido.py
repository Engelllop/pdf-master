"""La limpieza de memoria nunca cierra el documento que se está pidiendo.

Con más documentos con cambios sin guardar que el tope de vivos, el único limpio era
el recién pedido: se cerraba y la operación respondía «documento no encontrado» sobre
un PDF abierto. Lo destapó la batería completa al sumar tests que dejan documentos
sucios."""
import fitz

from app.services.pdf_service import pdf_service


def test_con_todos_los_demas_sucios_el_pedido_sigue_vivo(client, tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_service, "_max_live_docs", 3)
    ids = []
    for k in range(5):
        path = str(tmp_path / f"d{k}.pdf")
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), f"doc {k}")
        doc.save(path)
        doc.close()
        ids.append(client.post("/pdf/open", json={"file_path": path}).json()["doc_id"])
    # Los cuatro primeros quedan con cambios sin guardar.
    for did in ids[:4]:
        assert client.post(f"/pdf/stamps/{did}", json={"capa": "marca", "spec": {"text": "X"}}).status_code == 200
    # El quinto (limpio, quizá ya liberado) tiene que poder usarse.
    r = client.post(f"/pdf/stamps/{ids[4]}", json={"capa": "marca", "spec": {"text": "Y"}})
    assert r.status_code == 200, r.text
    assert client.get(f"/pdf/dirty/{ids[4]}").json()["dirty"] is True
