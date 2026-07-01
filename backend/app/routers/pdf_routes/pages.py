"""Operaciones sobre páginas: rotar, borrar, reordenar, duplicar, insertar, recortar."""
from fastapi import APIRouter, HTTPException, Query

from app.models.pdf import (
    CropRequest, DeletePagesRequest, ReorderPagesRequest, RotatePagesRequest,
    RotateRequest, SaveResult,
)
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.post("/rotate/{doc_id}", response_model=SaveResult)
def rotate_page(doc_id: str, req: RotateRequest):
    ok = pdf_service.rotate_page(doc_id, req.page_num, req.degrees)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

@router.post("/rotate-all/{doc_id}", response_model=SaveResult)
def rotate_all_pages(doc_id: str, req: RotateRequest):
    ok = pdf_service.rotate_all_pages(doc_id, req.degrees)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/rotate-pages/{doc_id}", response_model=SaveResult)
def rotate_pages(doc_id: str, req: RotatePagesRequest):
    ok = pdf_service.rotate_pages(doc_id, req.pages, req.degrees)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/delete-pages/{doc_id}", response_model=SaveResult)
def delete_pages(doc_id: str, req: DeletePagesRequest):
    ok = pdf_service.delete_pages(doc_id, req.pages)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/reorder/{doc_id}", response_model=SaveResult)
def reorder_pages(doc_id: str, req: ReorderPagesRequest):
    ok = pdf_service.reorder_pages(doc_id, req.new_order)
    if not ok:
        raise HTTPException(status_code=400, detail="Reorder failed")
    return SaveResult(success=True)

@router.post("/crop/{doc_id}", response_model=SaveResult)
def crop_page(doc_id: str, req: CropRequest):
    ok = pdf_service.crop_page(doc_id, req.page_num, req.top, req.right, req.bottom, req.left)
    if not ok:
        raise HTTPException(status_code=400, detail="Crop failed")
    return SaveResult(success=True)

@router.post("/duplicate-page/{doc_id}", response_model=SaveResult)
def duplicate_page(doc_id: str, page_num: int = Query(...)):
    if not pdf_service.duplicate_page(doc_id, page_num):
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

@router.post("/insert-blank/{doc_id}", response_model=SaveResult)
def insert_blank(doc_id: str, index: int = Query(...), width: float = Query(595), height: float = Query(842)):
    if not pdf_service.insert_blank_page(doc_id, index, width, height):
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)
