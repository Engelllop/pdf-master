"""Formularios: lectura y escritura de widgets."""
from fastapi import APIRouter, HTTPException

from app.models.pdf import FormFieldUpdate, SaveResult
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.get("/widgets/{doc_id}/{page_num}")
def get_widgets(doc_id: str, page_num: int):
    return pdf_service.get_form_fields(doc_id, page_num)

@router.post("/widgets/{doc_id}/{page_num}", response_model=SaveResult)
def update_widget(doc_id: str, page_num: int, req: FormFieldUpdate):
    ok = pdf_service.set_form_field(doc_id, page_num, req.field_name, req.value)
    if not ok:
        raise HTTPException(status_code=404, detail="Field not found")
    return SaveResult(success=True)
