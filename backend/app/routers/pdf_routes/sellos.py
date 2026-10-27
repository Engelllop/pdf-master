"""Sellos de página en capa propia: encabezado y pie, numeración y marca de agua."""
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.services.pdf_service import pdf_service

router = APIRouter()

Capa = Literal["encabezado", "numeracion", "marca"]


class SelloSpec(BaseModel):
    # Encabezado y pie / numeración: texto por zona (tl, tc, tr, bl, bc, br) con
    # variables {n} {n:6} {total} {fecha} {archivo}.
    zones: Dict[str, str] = Field(default_factory=dict)
    start: int = 1
    margin_x: float = 36
    margin_top: float = 28
    margin_bottom: float = 28
    # Marca de agua.
    text: str = ""
    mode: Literal["center", "tile"] = "center"
    angle: float = 45
    behind: bool = False
    # Comunes. `fontsize` 0 en la marca de agua = relativo a la hoja.
    fontsize: float = 10
    font: str = "Helvetica"
    bold: bool = False
    color: str = "#000000"
    opacity: float = Field(1.0, ge=0.05, le=1.0)


class AplicarSelloRequest(BaseModel):
    capa: Capa
    spec: SelloSpec
    pages: Optional[List[int]] = None
    stash: bool = True


class QuitarSelloRequest(BaseModel):
    capa: Capa
    stash: bool = True


class VistaPreviaRequest(BaseModel):
    capa: Capa
    spec: SelloSpec
    page_num: int = 0
    width: int = Field(640, ge=120, le=2400)
    area: Literal["full", "top", "bottom"] = "full"


@router.get("/stamps/{doc_id}")
def estado(doc_id: str):
    res = pdf_service.estado_sellos(doc_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return res


@router.post("/stamps/{doc_id}")
def aplicar(doc_id: str, req: AplicarSelloRequest):
    stash_id = pdf_service.aplicar_sello(doc_id, req.capa, req.spec.model_dump(), req.pages, stash=req.stash)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "stash_id": stash_id or None}


@router.post("/stamps/remove/{doc_id}")
def quitar(doc_id: str, req: QuitarSelloRequest):
    res = pdf_service.quitar_sello(doc_id, req.capa, stash=req.stash)
    if res is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "stash_id": res["stash_id"] or None, "removed": res["removed"]}


@router.post("/stamps/preview/{doc_id}")
def vista_previa(doc_id: str, req: VistaPreviaRequest):
    png = pdf_service.vista_previa_sello(doc_id, req.page_num, req.capa, req.spec.model_dump(), req.width, req.area)
    if png is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return Response(content=png, media_type="image/png")
