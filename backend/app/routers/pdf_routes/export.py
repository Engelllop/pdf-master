"""Exportación a otros formatos: Word, Excel, PowerPoint, TXT, HTML."""
from fastapi import APIRouter, HTTPException, Query

from app.models.pdf import SaveResult
from app.routers.pdf_routes._shared import _validate_output_path
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.post("/export-excel/{doc_id}", response_model=SaveResult)
def export_excel(doc_id: str, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.xlsx'})
    ok = pdf_service.export_excel(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)

@router.post("/export-pptx/{doc_id}", response_model=SaveResult)
def export_pptx(doc_id: str, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.pptx'})
    ok = pdf_service.export_pptx(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)

@router.get("/export-word/{doc_id}")
def export_word(doc_id: str):
    result = pdf_service.export_word(doc_id)
    if not result:
        raise HTTPException(status_code=400, detail="Export failed")
    return result

@router.post("/export-txt/{doc_id}", response_model=SaveResult)
def export_txt(doc_id: str, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.txt'})
    if not pdf_service.export_txt(doc_id, output_path):
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)

@router.post("/export-html/{doc_id}", response_model=SaveResult)
def export_html(doc_id: str, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.html', '.htm'})
    if not pdf_service.export_html(doc_id, output_path):
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)
