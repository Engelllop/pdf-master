def test_toda_respuesta_lleva_un_id_de_operacion(client, tmp_path):
    """El id casa lo que el usuario ve con la linea del log; sin el, un 'se congelo
    al guardar' no se puede rastrear."""
    r = client.post("/pdf/open", json={"file_path": str(tmp_path / "no-existe.pdf")})
    assert "x-request-id" in r.headers
    assert len(r.headers["x-request-id"]) == 8


def test_el_health_no_gasta_id(client):
    """Se repite cada 10 s: ni miga de pan ni id, o el log es solo health-checks."""
    r = client.get("/pdf/health")
    assert r.status_code == 200
    assert "x-request-id" not in r.headers
