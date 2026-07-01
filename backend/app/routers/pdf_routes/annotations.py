"""Anotaciones: sidecar, embed en el PDF, resumen de marcas y XFDF."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models.pdf import AnnotationList, SaveResult
from app.routers.pdf_routes._shared import _validate_input_file, _validate_output_path
from app.services.pdf_service import pdf_service

router = APIRouter()


class ImportXfdfRequest(BaseModel):
    file_path: str


@router.get("/annotations/{doc_id}", response_model=AnnotationList)
def get_annotations(doc_id: str):
    anns = pdf_service.load_annotations(doc_id)
    return AnnotationList(annotations=anns)

@router.post("/annotations/{doc_id}", response_model=SaveResult)
def save_annotations(doc_id: str, req: AnnotationList):
    ok = pdf_service.save_annotations(doc_id, req.annotations)
    if not ok:
        raise HTTPException(status_code=400, detail="Save annotations failed")
    return SaveResult(success=True)

@router.post("/embed/{doc_id}", response_model=SaveResult)
def embed_annotations(doc_id: str, req: AnnotationList):
    ok = pdf_service.embed_annotations(doc_id, req.annotations)
    if not ok:
        raise HTTPException(status_code=400, detail="Embed annotations failed")
    return SaveResult(success=True)

@router.post("/export-xfdf/{doc_id}", response_model=SaveResult)
def export_xfdf(doc_id: str, req: AnnotationList, output_path: str = Query(...)):
    _validate_output_path(output_path, {'.xfdf'})
    if not pdf_service.export_xfdf(doc_id, req.annotations, output_path):
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)


@router.post("/import-xfdf/{doc_id}", response_model=AnnotationList)
def import_xfdf(doc_id: str, req: ImportXfdfRequest):
    _validate_input_file(req.file_path, {'.xfdf'})
    anns = pdf_service.import_xfdf(doc_id, req.file_path)
    if anns is None:
        raise HTTPException(status_code=400, detail="Import failed")
    return AnnotationList(annotations=anns)


@router.post("/markup-summary/{doc_id}")
def markup_summary(doc_id: str, req: AnnotationList):
    result = pdf_service.generate_markup_summary(doc_id, req.annotations)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return result
