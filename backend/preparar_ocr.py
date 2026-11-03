"""Arma `backend/ocr/tesseract/`: el Tesseract que viaja dentro de la app.

    python preparar_ocr.py                       # toma el instalado en Program Files
    python preparar_ocr.py --origen D:\\Tesseract-OCR --datos D:\\tessdata_fast

Copia `tesseract.exe` con las DLL que realmente necesita (se siguen los imports; hace falta
`pip install pefile`, o `--todo` para copiarlas todas) y los idiomas `spa` y `eng` del
repositorio oficial `tessdata_fast` (rápidos y chicos: 2 + 4 MB; con `--best` los de máxima
calidad, 14 + 15 MB y más lentos). La carpeta NO va en git (≈120 MB): la crea cada quien
antes de compilar el motor y `pdf-engine.spec` la empaqueta.

Tesseract es Apache 2.0; el instalador de Windows lo publica la Universidad de Mannheim
(github.com/UB-Mannheim/tesseract). Hay que dejar su licencia junto a los binarios (se copia).
"""
import argparse
import os
import shutil
import sys
import urllib.request
from pathlib import Path

IDIOMAS = ("spa", "eng")
DESTINO = Path(__file__).resolve().parent / "ocr" / "tesseract"


def cierre_de_dll(origen: Path) -> list[str]:
    import pefile  # solo al preparar

    dlls = {f.lower(): f for f in os.listdir(origen) if f.lower().endswith(".dll")}

    def imports(nombre: str) -> list[str]:
        pe = pefile.PE(str(origen / nombre), fast_load=True)
        pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]])
        return [e.dll.decode().lower() for e in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])]

    vistos: set[str] = set()
    pendientes = ["tesseract.exe"]
    while pendientes:
        f = pendientes.pop()
        if f in vistos:
            continue
        vistos.add(f)
        pendientes += [i for i in imports(dlls.get(f, f)) if i in dlls]
    return sorted(dlls.get(f, f) for f in vistos)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origen", default=r"C:\Program Files\Tesseract-OCR", help="carpeta de un Tesseract instalado")
    ap.add_argument("--datos", help="carpeta con spa.traineddata y eng.traineddata (si no, se descargan)")
    ap.add_argument("--best", action="store_true", help="idiomas de máxima calidad (más pesados y lentos)")
    ap.add_argument("--todo", action="store_true", help="copiar todas las DLL en vez del cierre de imports")
    a = ap.parse_args()

    origen = Path(a.origen)
    if not (origen / "tesseract.exe").is_file():
        print(f"No encuentro tesseract.exe en {origen}", file=sys.stderr)
        return 1
    if DESTINO.exists():
        shutil.rmtree(DESTINO)
    (DESTINO / "tessdata").mkdir(parents=True)

    archivos = sorted(f for f in os.listdir(origen) if f.lower().endswith(".dll")) + ["tesseract.exe"] if a.todo \
        else cierre_de_dll(origen)
    for f in archivos:
        shutil.copy2(origen / f, DESTINO / f)
    for lic in ("LICENSE", "LICENSE.txt", "doc/LICENSE"):
        if (origen / lic).is_file():
            shutil.copy2(origen / lic, DESTINO / "LICENSE-tesseract.txt")
            break
    if not (DESTINO / "LICENSE-tesseract.txt").exists():
        (DESTINO / "LICENSE-tesseract.txt").write_text(
            "Tesseract OCR — Apache License 2.0 — https://github.com/tesseract-ocr/tesseract\n"
            "Binarios de Windows: Universidad de Mannheim — https://github.com/UB-Mannheim/tesseract\n",
            encoding="utf-8")

    calidad = "best" if a.best else "fast"
    for idioma in IDIOMAS:
        destino = DESTINO / "tessdata" / f"{idioma}.traineddata"
        if a.datos and (Path(a.datos) / f"{idioma}.traineddata").is_file():
            shutil.copy2(Path(a.datos) / f"{idioma}.traineddata", destino)
        else:
            url = f"https://github.com/tesseract-ocr/tessdata_{calidad}/raw/main/{idioma}.traineddata"
            print("descargando", url)
            urllib.request.urlretrieve(url, destino)
    total = sum(f.stat().st_size for f in DESTINO.rglob("*") if f.is_file())
    print(f"listo: {DESTINO} ({len(archivos)} binarios, {total / 1e6:.0f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
