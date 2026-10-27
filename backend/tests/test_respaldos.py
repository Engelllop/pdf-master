"""Respaldo del original del día, fuera de la carpeta del plano."""
import os
from datetime import date, timedelta

from app.services._pdf_respaldos import nombre_respaldo, podar, respaldar_original


def _archivo(tmp_path, nombre="A-101.pdf", contenido=b"v1"):
    carpeta = tmp_path / "proyecto"
    carpeta.mkdir(exist_ok=True)
    ruta = carpeta / nombre
    ruta.write_bytes(contenido)
    return ruta


def test_guarda_el_original_del_dia_y_no_lo_pisa(tmp_path, respaldos_aislados):
    ruta = _archivo(tmp_path)
    primero = respaldar_original(str(ruta))
    ruta.write_bytes(b"v2")
    segundo = respaldar_original(str(ruta))
    assert primero == segundo
    assert open(primero, "rb").read() == b"v1", "el segundo guardado del día no pisa el original"
    assert os.path.dirname(primero) == str(respaldos_aislados / date.today().isoformat())
    assert os.listdir(ruta.parent) == ["A-101.pdf"], "nada al lado del plano"


def test_al_dia_siguiente_guarda_el_de_ese_dia(tmp_path, respaldos_aislados):
    ruta = _archivo(tmp_path)
    hoy = date(2026, 10, 27)
    respaldar_original(str(ruta), hoy)
    ruta.write_bytes(b"v2")
    otro = respaldar_original(str(ruta), hoy + timedelta(days=1))
    assert open(otro, "rb").read() == b"v2"


def test_dos_archivos_con_el_mismo_nombre_no_se_pisan(tmp_path, respaldos_aislados):
    a = _archivo(tmp_path, contenido=b"proyecto 1")
    otra = tmp_path / "otro"
    otra.mkdir()
    b = otra / "A-101.pdf"
    b.write_bytes(b"proyecto 2")
    assert nombre_respaldo(str(a)) != nombre_respaldo(str(b))
    ra, rb = respaldar_original(str(a)), respaldar_original(str(b))
    assert open(ra, "rb").read() == b"proyecto 1" and open(rb, "rb").read() == b"proyecto 2"


def test_el_indice_dice_de_donde_salio_cada_copia(tmp_path, respaldos_aislados):
    ruta = _archivo(tmp_path)
    respaldar_original(str(ruta))
    indice = (respaldos_aislados / date.today().isoformat() / "indice.txt").read_text(encoding="utf-8")
    assert os.path.abspath(ruta) in indice


def test_poda_los_dias_viejos_y_respeta_el_tope_sin_borrar_hoy(tmp_path):
    raiz = tmp_path / "respaldos"
    hoy = date(2026, 10, 27)
    for d in (0, 1, 2, 40):
        dia = raiz / (hoy - timedelta(days=d)).isoformat()
        dia.mkdir(parents=True)
        (dia / "x.pdf").write_bytes(b"0" * 1000)
    (raiz / "no-es-fecha").mkdir()
    assert podar(str(raiz), hoy, dias=30, tope=10_000) == 1
    assert not (raiz / (hoy - timedelta(days=40)).isoformat()).exists()
    # Con un tope chico se van los más viejos, nunca el de hoy ni carpetas ajenas.
    podar(str(raiz), hoy, dias=30, tope=1500)
    assert sorted(p.name for p in raiz.iterdir()) == [hoy.isoformat(), "no-es-fecha"]


def test_el_endpoint_dice_donde_estan(client, respaldos_aislados):
    r = client.get("/pdf/backups").json()
    assert r["dir"] == str(respaldos_aislados) and r["days"] == 30
