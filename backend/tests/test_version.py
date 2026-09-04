import json
from pathlib import Path

import pytest

from app.core.config import ENGINE_VERSION
from main import app

REPO = Path(__file__).resolve().parents[2]
PACKAGE_JSON = REPO / "frontend" / "package.json"


def test_la_api_declara_la_version_del_motor():
    assert app.version == ENGINE_VERSION


def test_el_motor_va_a_la_par_del_producto():
    """En el .exe empaquetado no hay repo alrededor, asi que ahi se salta; en el
    repo (que es donde se sube la version antes de taggear) tiene que coincidir."""
    if not PACKAGE_JSON.exists():
        pytest.skip("sin repo alrededor: motor empaquetado")
    esperado = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["version"]
    assert ENGINE_VERSION == esperado, (
        f"El motor dice {ENGINE_VERSION} y el producto {esperado}: "
        "subi ENGINE_VERSION en backend/app/core/config.py"
    )
