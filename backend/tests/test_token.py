"""El token Electron<->motor: que rechazar no se confunda con "pide contrasena"."""
import main as engine


def test_token_invalido_es_403(client, monkeypatch):
    """401 es el PDF pidiendo contrasena y el visor lo trata como tal: con los dos
    en 401, hablarle a OTRO motor (otra instalacion tomando el 8745) se veia en
    pantalla como "PDF protegido"."""
    monkeypatch.setattr(engine, "_API_TOKEN", "secreto")
    r = client.post("/pdf/open", json={"file_path": "C:/no/importa.pdf"})
    assert r.status_code == 403
    assert r.json()["detail"] == "unauthorized"


def test_con_el_token_correcto_pasa(client, monkeypatch):
    monkeypatch.setattr(engine, "_API_TOKEN", "secreto")
    r = client.post(
        "/pdf/open",
        json={"file_path": "C:/no/existe.pdf"},
        headers={"x-pdfmaster-token": "secreto"},
    )
    assert r.status_code == 422  # llego al handler: la ruta no existe


def test_el_health_sigue_abierto(client, monkeypatch):
    """El main lo consulta cada 10 s para saber si el motor esta vivo; si exigiera
    token, un motor ajeno se veria como motor caido en vez de como conflicto."""
    monkeypatch.setattr(engine, "_API_TOKEN", "secreto")
    assert client.get("/pdf/health").status_code == 200
