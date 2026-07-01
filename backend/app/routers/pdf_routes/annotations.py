"""Anotaciones: sidecar, embed en el PDF y resumen de marcas."""
from fastapi import APIRouter, HTTPException

from app.models.pdf import AnnotationList, SaveResult
from app.services.pdf_service import pdf_service

router = APIRouter()


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

@router.post("/markup-summary/{doc_id}")
def markup_summary(doc_id: str, req: AnnotationList):
    result = pdf_service.generate_markup_summary(doc_id, req.annotations)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return result
