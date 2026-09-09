"""El puerto que elige Electron, y lo que el motor suelta al cerrar un documento."""
import os

import pytest

import main
from app.core.config import settings
from app.services.pdf_service import pdf_service


@pytest.fixture
def sin_env_puerto():
    previo = os.environ.get("PDFMASTER_PORT")
    os.environ.pop("PDFMASTER_PORT", None)
    yield
    if previo is None:
        os.environ.pop("PDFMASTER_PORT", None)
    else:
        os.environ["PDFMASTER_PORT"] = previo


class TestPuerto:
    """El 8745 fijo no tenia plan B: si lo tenia un programa ajeno, el bind fallaba y
    la app quedaba abierta sin motor. Ahora Electron elige y lo pasa por el entorno."""

    def test_usa_el_que_le_pasa_electron(self, sin_env_puerto):
        os.environ["PDFMASTER_PORT"] = "8748"
        assert main._puerto() == 8748

    def test_sin_variable_vale_el_de_siempre(self, sin_env_puerto):
        assert main._puerto() == settings.API_PORT

    def test_una_variable_vacia_no_cuenta(self, sin_env_puerto):
        os.environ["PDFMASTER_PORT"] = ""
        assert main._puerto() == settings.API_PORT

    @pytest.mark.parametrize("basura", ["ocho mil", "-1", "0", "99999", "8745.5", "8745 "])
    def test_basura_cae_al_de_siempre_en_vez_de_reventar(self, sin_env_puerto, basura):
        # Un ValueError aca mata el motor antes de escuchar, y el sintoma en pantalla
        # es "motor desconectado" sin nada mas.
        os.environ["PDFMASTER_PORT"] = basura
        assert main._puerto() == settings.API_PORT


class TestCierreLiberaCaches:
    """`close_document` vaciaba los documentos y las contrasenas pero NO los bitmaps:
    hasta 150 renders y 60 mallas de snap del documento cerrado seguian en RAM hasta
    que el LRU los desplazara, o sea que abrir y cerrar planos hacia crecer la memoria
    del motor sin un solo documento abierto."""

    @staticmethod
    def _claves(doc_id: str) -> tuple[list, list]:
        return (
            [k for k in pdf_service._render_cache if k[0] == doc_id],
            [k for k in pdf_service._snap_cache if k[0] == doc_id],
        )

    def test_los_bitmaps_de_la_pagina_se_sueltan(self, client, pdf_factory):
        info = client.post("/pdf/open", json={"file_path": pdf_factory(pages=2)}).json()
        doc_id = info["doc_id"]

        assert client.get(f"/pdf/page/{doc_id}/0?zoom=1.0").status_code == 200
        assert client.get(f"/pdf/page/{doc_id}/1?zoom=1.0").status_code == 200
        renders, _ = self._claves(doc_id)
        assert renders, "el render no dejo nada en cache: el test no probaria nada"

        assert client.post(f"/pdf/close/{doc_id}").status_code == 200
        renders, snaps = self._claves(doc_id)
        assert renders == []
        assert snaps == []

    def test_las_mallas_de_snap_tambien(self, client, pdf_factory):
        info = client.post("/pdf/open", json={"file_path": pdf_factory(pages=1)}).json()
        doc_id = info["doc_id"]

        assert client.get(f"/pdf/snap-points/{doc_id}/0").status_code == 200
        _, snaps = self._claves(doc_id)
        assert snaps, "el snap no dejo nada en cache: el test no probaria nada"

        client.post(f"/pdf/close/{doc_id}")
        assert self._claves(doc_id) == ([], [])

    def test_no_se_lleva_los_caches_de_los_demas(self, client, pdf_factory):
        uno = client.post("/pdf/open", json={"file_path": pdf_factory(pages=1)}).json()["doc_id"]
        dos = client.post("/pdf/open", json={"file_path": pdf_factory(pages=1)}).json()["doc_id"]
        client.get(f"/pdf/page/{uno}/0?zoom=1.0")
        client.get(f"/pdf/page/{dos}/0?zoom=1.0")

        client.post(f"/pdf/close/{uno}")

        assert self._claves(uno) == ([], [])
        renders_dos, _ = self._claves(dos)
        assert renders_dos, "cerrar uno no puede invalidar el bitmap del que sigue abierto"
        client.post(f"/pdf/close/{dos}")

    def test_cerrar_algo_que_no_existe_no_revienta(self, client):
        assert client.post("/pdf/close/no-existe").status_code == 404
