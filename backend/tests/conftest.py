import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
import pytest
from fastapi.testclient import TestClient

from main import app
from app.services.pdf_service import pdf_service


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _make_pdf(path, pages=3, text="Hola PDF Master", width=595, height=842):
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=width, height=height)
        page.insert_text((72, 72), f"{text} pagina {i + 1}", fontsize=14)
    doc.save(str(path))
    doc.close()
    return str(path)


@pytest.fixture
def pdf_factory(tmp_path):
    counter = {"n": 0}

    def factory(**kwargs):
        counter["n"] += 1
        return _make_pdf(tmp_path / f"doc{counter['n']}.pdf", **kwargs)

    return factory


@pytest.fixture
def open_doc(client, pdf_factory):
    """Abre un PDF de prueba y lo cierra al terminar."""
    opened = []

    def opener(**kwargs):
        path = pdf_factory(**kwargs)
        resp = client.post("/pdf/open", json={"file_path": path})
        assert resp.status_code == 200, resp.text
        info = resp.json()
        opened.append(info["doc_id"])
        return info

    yield opener

    for doc_id in opened:
        client.post(f"/pdf/close/{doc_id}")


@pytest.fixture(autouse=True)
def _reset_lru_cap():
    original = pdf_service._max_live_docs
    yield
    pdf_service._max_live_docs = original
