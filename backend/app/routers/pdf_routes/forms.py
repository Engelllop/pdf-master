"""Formularios: lectura y escritura de widgets."""
from fastapi import APIRouter, HTTPException

from app.models.pdf import FormFieldCreate, FormFieldResult, FormFieldTransform, FormFieldUpdate
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.get("/widgets/{doc_id}/{page_num}")
def get_widgets(doc_id: str, page_num: int):
    return pdf_service.get_form_fields(doc_id, page_num)

@router.post("/widgets/{doc_id}", response_model=FormFieldResult)
def create_widget(doc_id: str, req: FormFieldCreate):
    result = pdf_service.add_form_field(
        doc_id, req.page_num, req.field_type, req.field_name,
        req.x, req.y, req.width, req.height,
        options=req.options, radio_value=req.radio_value, stash=req.stash,
    )
    if result is None:
        raise HTTPException(status_code=400, detail="No se pudo crear el campo")
    name, stash_id = result
    return FormFieldResult(success=True, field_name=name, stash_id=stash_id or None)

@router.post("/widgets/{doc_id}/{page_num}/transform", response_model=FormFieldResult)
def transform_widget(doc_id: str, page_num: int, req: FormFieldTransform):
    stash_id = pdf_service.transform_form_field(
        doc_id, page_num, req.xref, req.x, req.y, req.width, req.height,
        delete=req.delete, stash=req.stash,
    )
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Field not found")
    return FormFieldResult(success=True, stash_id=stash_id or None)

@router.post("/widgets/{doc_id}/{page_num}", response_model=FormFieldResult)
def update_widget(doc_id: str, page_num: int, req: FormFieldUpdate):
    result = pdf_service.set_form_field(doc_id, page_num, req.field_name, req.value, stash=req.stash)
    if result is None:
        raise HTTPException(status_code=404, detail="Field not found")
    previous, stash_id = result
    return FormFieldResult(success=True, previous=previous, stash_id=stash_id or None)
