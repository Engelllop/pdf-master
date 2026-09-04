"""Validaciones compartidas por los routers de dominio."""
import os

from fastapi import HTTPException

_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff'}

_NULO = chr(0)


def _reject_null_bytes(path: str) -> None:
    """Un byte nulo en la ruta revienta `open()` con ValueError (un 500 sin
    explicacion) y en las APIs de C corta la cadena antes de la extension que se
    acaba de validar."""
    if _NULO in path:
        raise HTTPException(status_code=422, detail="Ruta invalida")


def _validate_output_path(path: str, exts: set) -> None:
    """422 si la extensión no es la esperada o el directorio destino no existe."""
    _reject_null_bytes(path)
    # El motor empaquetado corre con el cwd que le deje Windows: una ruta relativa no
    # escribe "al lado del PDF", escribe donde nadie la va a encontrar.
    if not os.path.isabs(path):
        raise HTTPException(status_code=422, detail=f"La ruta de salida debe ser absoluta: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext not in exts:
        raise HTTPException(status_code=422, detail=f"Extensión de salida no permitida: '{ext}' (se espera {', '.join(sorted(exts))})")
    directory = os.path.dirname(os.path.abspath(path))
    if not os.path.isdir(directory):
        raise HTTPException(status_code=422, detail=f"El directorio de salida no existe: {directory}")


def _validate_input_file(path: str, exts: set) -> None:
    """422 si el archivo de entrada no existe o no tiene la extensión esperada."""
    _reject_null_bytes(path)
    if not os.path.isfile(path):
        raise HTTPException(status_code=422, detail=f"El archivo no existe: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext not in exts:
        raise HTTPException(status_code=422, detail=f"Extensión no permitida: '{ext}' (se espera {', '.join(sorted(exts))})")
