"""Enlaces del documento: leer, crear, editar y quitar."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.pdf_service import pdf_service

router = APIRouter()


class Zona(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

    def a_tupla(self):
        return (self.x0, self.y0, self.x1, self.y1)


class CrearEnlaceRequest(BaseModel):
    page_num: int
    zona: Zona
    # Una dirección web O una página (base 0): ni las dos ni ninguna.
    uri: Optional[str] = Field(default=None, max_length=2048)
    target_page: Optional[int] = Field(default=None, ge=0)
    stash: bool = True


class EditarEnlaceRequest(BaseModel):
    page_num: int
    index: int = Field(ge=0)
    uri: Optional[str] = Field(default=None, max_length=2048)
    target_page: Optional[int] = Field(default=None, ge=0)
    zona: Optional[Zona] = None
    stash: bool = True


class QuitarEnlaceRequest(BaseModel):
    page_num: int
    index: int = Field(ge=0)
    stash: bool = True


def _o_422(f, *args, **kwargs):
    """El servicio avisa con ValueError de lo que el usuario puede corregir (dirección
    inválida, zona chica, página inexistente): es un 422 con el motivo, no un 500."""
    try:
        return f(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/links/{doc_id}/{page_num}")
def listar(doc_id: str, page_num: int):
    res = pdf_service.listar_enlaces(doc_id, page_num)
    if res is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"links": res}


@router.post("/links/{doc_id}")
def crear(doc_id: str, req: CrearEnlaceRequest):
    res = _o_422(pdf_service.crear_enlace, doc_id, req.page_num, req.zona.a_tupla(),
                 req.uri, req.target_page, stash=req.stash)
    if res is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"success": True, "stash_id": res["stash_id"] or None, "index": res["index"]}


@router.post("/links/update/{doc_id}")
def editar(doc_id: str, req: EditarEnlaceRequest):
    res = _o_422(pdf_service.editar_enlace, doc_id, req.page_num, req.index, req.uri, req.target_page,
                 req.zona.a_tupla() if req.zona else None, stash=req.stash)
    if res is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"success": True, "stash_id": res["stash_id"] or None, "index": res["index"]}


@router.post("/links/remove/{doc_id}")
def quitar(doc_id: str, req: QuitarEnlaceRequest):
    res = pdf_service.quitar_enlace(doc_id, req.page_num, req.index, stash=req.stash)
    if res is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"success": True, "stash_id": res["stash_id"] or None}
