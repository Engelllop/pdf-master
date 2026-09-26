"""CORS: solo el renderer de Electron. En producción carga por file:// (Origin "null")
y en desarrollo desde el servidor de electron-vite (5173). Antes valía cualquier
puerto de localhost: cualquier página o servidor local podía hablar con el motor."""
import pytest


def _preflight(client, origin):
    return client.options("/pdf/open", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-pdfmaster-token",
    })


@pytest.mark.parametrize("origin", ["null", "http://localhost:5173", "http://127.0.0.1:5173"])
def test_el_renderer_de_electron_pasa(client, origin):
    r = _preflight(client, origin)
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin", [
    "http://localhost:3000", "http://127.0.0.1:8080", "http://localhost:51730",
    "http://localhost:5173.evil.com", "https://example.com",
])
def test_otro_origen_se_rechaza(client, origin):
    r = _preflight(client, origin)
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers
