"""Edición de contenido: texto, imágenes, redacción, marca de agua, metadatos."""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models.pdf import (
    HeaderFooterRequest, InsertImageRequest, MetadataRequest, MetadataResult,
    RedactRequest, ReplaceTextRequest, SaveResult, WatermarkRequest,
)
from app.routers.pdf_routes._shared import _IMAGE_EXTS, _validate_input_file
from app.services.pdf_service import pdf_service

router = APIRouter()


class EditTextRequest(BaseModel):
    page_num: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    size: Optional[float] = None
    color: str = "#000000"
    font: Optional[str] = None
    stash: bool = True


class TransformImageRequest(BaseModel):
    page_num: int
    xref: int
    old: List[float]
    new: Optional[List[float]] = None
    delete: bool = False
    replace_path: Optional[str] = None
    stash: bool = True


@router.post("/header-footer/{doc_id}", response_model=SaveResult)
def add_header_footer(doc_id: str, req: HeaderFooterRequest):
    stash_id = pdf_service.add_header_footer(doc_id, req.header, req.footer, req.fontsize, req.color, stash=req.stash, pages=req.pages)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/insert-image/{doc_id}", response_model=SaveResult)
def insert_image(doc_id: str, req: InsertImageRequest):
    _validate_input_file(req.image_path, _IMAGE_EXTS)
    stash_id = pdf_service.insert_image(doc_id, req.page_num, req.x, req.y, req.width, req.height, req.image_path, stash=req.stash)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Page or image not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/watermark/{doc_id}", response_model=SaveResult)
def add_watermark(doc_id: str, req: WatermarkRequest):
    stash_id = pdf_service.add_watermark(doc_id, req.text, req.color, req.fontsize, req.angle, req.opacity, req.tiled, stash=req.stash, pages=req.pages)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/redact/{doc_id}", response_model=SaveResult)
def redact_area(doc_id: str, req: RedactRequest):
    stash_id = pdf_service.redact_area(doc_id, req.page_num, req.x, req.y, req.width, req.height, stash=req.stash)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/replace-text/{doc_id}")
def replace_text(doc_id: str, req: ReplaceTextRequest):
    count, stash_id, stash_page = pdf_service.replace_text(
        doc_id, req.query, req.replace, req.page_num, req.case_sensitive, req.replace_all, stash=req.stash,
    )
    return {"replaced": count, "stash_id": stash_id or None, "stash_page": stash_page}

@router.post("/metadata/{doc_id}", response_model=MetadataResult)
def set_metadata(doc_id: str, req: MetadataRequest):
    previous = pdf_service.set_metadata(doc_id, req.title, req.author, req.subject, req.keywords)
    if previous is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return MetadataResult(success=True, previous=MetadataRequest(**previous))

@router.post("/edit-text/{doc_id}", response_model=SaveResult)
def edit_text(doc_id: str, req: EditTextRequest):
    stash_id = pdf_service.edit_text_span(doc_id, req.page_num, req.x0, req.y0, req.x1, req.y1, req.text, req.size, req.color, req.font, stash=req.stash)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.get("/images/{doc_id}/{page_num}")
def list_page_images(doc_id: str, page_num: int):
    return {"images": pdf_service.list_page_images(doc_id, page_num)}

@router.post("/transform-image/{doc_id}", response_model=SaveResult)
def transform_image(doc_id: str, req: TransformImageRequest):
    if req.replace_path:
        _validate_input_file(req.replace_path, _IMAGE_EXTS)
    stash_id = pdf_service.transform_image(doc_id, req.page_num, req.xref, req.old, req.new, req.delete, req.replace_path, stash=req.stash)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Page or image not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/page-numbers/{doc_id}", response_model=SaveResult)
def add_page_numbers(doc_id: str, prefix: str = Query(""), start: int = Query(1), position: str = Query("bottom"),
                     stash: bool = Query(True), pages: Optional[List[int]] = Query(None)):
    """`pages` repetido (`?pages=0&pages=1`) limita la numeración a esas páginas;
    omitido, numera el documento entero."""
    stash_id = pdf_service.add_page_numbers(doc_id, prefix, start, position, stash=stash, pages=pages)
    if stash_id is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True, stash_id=stash_id or None)

@router.post("/redact-matches/{doc_id}")
def redact_matches(doc_id: str, query: str = Query(..., min_length=1), stash: bool = Query(True)):
    redacted, stash_id = pdf_service.redact_matches(doc_id, query, stash=stash)
    return {"redacted": redacted, "stash_id": stash_id or None}
