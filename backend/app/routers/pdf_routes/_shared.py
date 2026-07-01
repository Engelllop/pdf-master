"""Validaciones compartidas por los routers de dominio."""
import os

from fastapi import HTTPException

_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff'}


def _validate_output_path(path: str, exts: set) -> None:
    """422 si la extensión no es la esperada o el directorio destino no existe."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in exts:
        raise HTTPException(status_code=422, detail=f"Extensión de salida no permitida: '{ext}' (se espera {', '.join(sorted(exts))})")
    directory = os.path.dirname(os.path.abspath(path))
    if not os.path.isdir(directory):
        raise HTTPException(status_code=422, detail=f"El directorio de salida no existe: {directory}")


def _validate_input_file(path: str, exts: set) -> None:
    """422 si el archivo de entrada no existe o no tiene la extensión esperada."""
    if not os.path.isfile(path):
        raise HTTPException(status_code=422, detail=f"El archivo no existe: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext not in exts:
        raise HTTPException(status_code=422, detail=f"Extensión no permitida: '{ext}' (se espera {', '.join(sorted(exts))})")
