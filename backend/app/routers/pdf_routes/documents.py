"""Ciclo de vida del documento: abrir/guardar/cerrar, merge/split, contraseñas."""
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.config import settings
from app.models.pdf import (
    CreateBlankRequest, DirtyStatus, MergeRequest, OpenPdfRequest, PdfInfo,
    SavePasswordRequest, SaveResult, SplitRequest, TempFileResult,
)
from app.routers.pdf_routes._shared import _IMAGE_EXTS, _validate_input_file, _validate_output_path
from app.services.pdf_service import PasswordRequiredError, pdf_service

router = APIRouter()


class ImagesToPdfRequest(BaseModel):
    images: List[str]
    output_path: str


@router.post("/open", response_model=PdfInfo)
def open_pdf(request: OpenPdfRequest):
    _validate_input_file(request.file_path, {'.pdf'})
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if os.path.getsize(request.file_path) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"El PDF supera el tope de {settings.MAX_FILE_SIZE_MB} MB",
        )
    try:
        info = pdf_service.open_document(request.file_path, request.password)
        return info
    except PasswordRequiredError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/info/{doc_id}", response_model=PdfInfo)
def get_info(doc_id: str):
    """Info actual del doc en memoria (page_count/page_sizes reflejan merges,
    borrados, etc. aún sin guardar), sin reabrir el archivo desde disco."""
    info = pdf_service.get_info(doc_id)
    if not info:
        raise HTTPException(status_code=404, detail="Document not found")
    return info

@router.get("/dirty/{doc_id}", response_model=DirtyStatus)
def get_dirty(doc_id: str):
    return DirtyStatus(dirty=pdf_service._dirty.get(doc_id, False))

@router.post("/merge/{doc_id}", response_model=SaveResult)
def merge_pdf(doc_id: str, req: MergeRequest):
    _validate_input_file(req.source_path, {'.pdf'})
    ok = pdf_service.merge_pdf(doc_id, req.source_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Merge failed")
    return SaveResult(success=True)

@router.post("/split/{doc_id}", response_model=TempFileResult)
def split_pdf(doc_id: str, req: SplitRequest, output_path: Optional[str] = Query(None)):
    if output_path:
        _validate_output_path(output_path, {'.pdf'})
    path = pdf_service.split_pages(doc_id, req.pages, output_path)
    if not path:
        raise HTTPException(status_code=400, detail="Split failed")
    return TempFileResult(temp_path=path)

@router.post("/compress/{doc_id}", response_model=SaveResult)
def compress_pdf(doc_id: str, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.pdf'})
    sizes = pdf_service.compress(doc_id, output_path)
    if not sizes:
        raise HTTPException(status_code=400, detail="Compress failed")
    return SaveResult(success=True, path=output_path, **sizes)

@router.get("/disk-state/{doc_id}")
def disk_state(doc_id: str):
    """Fecha y tamaño del archivo en disco, para detectar que alguien más lo tocó
    mientras estaba abierto."""
    estado = pdf_service.disk_state(doc_id)
    if estado is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return estado

@router.post("/save/{doc_id}", response_model=SaveResult)
def save_pdf(doc_id: str, output_path: Optional[str] = Query(None), backup: bool = Query(False)):
    if output_path:
        _validate_output_path(output_path, {'.pdf'})
    res = pdf_service.save(doc_id, output_path, backup=backup)
    if not res:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=res.path, backup_failed=not res.backup_ok)

@router.post("/create-blank", response_model=PdfInfo)
def create_blank(req: CreateBlankRequest):
    _validate_output_path(req.output_path, {'.pdf'})
    info = pdf_service.create_blank_pdf(req.output_path, req.page_width, req.page_height, req.page_count)
    if not info:
        raise HTTPException(status_code=400, detail="Failed to create blank PDF")
    return info

@router.post("/save-password/{doc_id}", response_model=SaveResult)
def save_with_password(doc_id: str, req: SavePasswordRequest):
    if req.output_path:
        _validate_output_path(req.output_path, {'.pdf'})
    res = pdf_service.save_with_password(doc_id, req.output_path, req.user_password,
                                         req.owner_password, backup=req.backup)
    if not res:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=res.path, backup_failed=not res.backup_ok)

@router.post("/remove-password/{doc_id}", response_model=SaveResult)
def remove_password(doc_id: str, output_path: Optional[str] = Query(None), backup: bool = Query(False)):
    if output_path:
        _validate_output_path(output_path, {'.pdf'})
    res = pdf_service.remove_password(doc_id, output_path, backup=backup)
    if not res:
        raise HTTPException(status_code=400, detail="Remove failed")
    return SaveResult(success=True, path=res.path, backup_failed=not res.backup_ok)

@router.post("/images-to-pdf", response_model=SaveResult)
def images_to_pdf(req: ImagesToPdfRequest):
    _validate_output_path(req.output_path, {'.pdf'})
    for p in req.images:
        _validate_input_file(p, _IMAGE_EXTS)
    if not pdf_service.images_to_pdf(req.images, req.output_path):
        raise HTTPException(status_code=400, detail="Conversion failed")
    return SaveResult(success=True, path=req.output_path)

@router.get("/health")
async def health_check():
    # Stays on the event loop (not the threadpool) so it answers instantly even while
    # CPU-bound render handlers saturate the threadpool.
    return {"status": "ok"}

@router.post("/close/{doc_id}")
def close_pdf(doc_id: str):
    success = pdf_service.close_document(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "closed"}
