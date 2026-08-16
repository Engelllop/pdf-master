"""Lectura: texto, spans, búsqueda, outline, snap-points, OCR y comparación."""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.pdf import OcrResult, PdfOutlineItem, TextClipRequest
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.get("/outline/{doc_id}", response_model=List[PdfOutlineItem])
def get_outline(doc_id: str):
    return pdf_service.get_outline(doc_id)

@router.post("/outline/{doc_id}")
def set_outline(doc_id: str, items: List[dict]):
    if not pdf_service.set_outline(doc_id, items):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "ok"}

@router.get("/search/{doc_id}")
def search_pdf(doc_id: str, query: str = Query(..., min_length=1), limit: int = Query(500, ge=1, le=5000)):
    return pdf_service.search_text(doc_id, query, limit)

@router.get("/ocr/{doc_id}/{page_num}", response_model=OcrResult)
def ocr_page(doc_id: str, page_num: int):
    text = pdf_service.ocr_page(doc_id, page_num)
    if text is None:
        raise HTTPException(status_code=400, detail="OCR failed or Tesseract not installed")
    return OcrResult(text=text)

@router.get("/text/{doc_id}/{page_num}")
def get_page_text(doc_id: str, page_num: int):
    data = pdf_service.get_page_text_data(doc_id, page_num)
    if data is None:
        raise HTTPException(status_code=404, detail="Document or page not found")
    return data

@router.post("/text-clip/{doc_id}/{page_num}")
def get_text_clip(doc_id: str, page_num: int, req: TextClipRequest):
    text = pdf_service.get_text_clip(doc_id, page_num, req.x, req.y, req.width, req.height)
    return {"text": text}

@router.get("/spans/{doc_id}/{page_num}")
def get_page_spans(doc_id: str, page_num: int):
    return {"spans": pdf_service.get_page_spans(doc_id, page_num)}

@router.get("/snap-points/{doc_id}/{page_num}")
def get_snap_points(doc_id: str, page_num: int):
    points = pdf_service.get_snap_points(doc_id, page_num)
    if points is None:
        raise HTTPException(status_code=404, detail="Document or page not found")
    return {"points": points}

@router.get("/compare-text/{doc_id_a}/{doc_id_b}")
def compare_text(doc_id_a: str, doc_id_b: str):
    result = pdf_service.compare_text(doc_id_a, doc_id_b)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return result

@router.get("/ocr-available")
def ocr_available():
    return {"available": pdf_service.ocr_available()}

@router.post("/make-searchable/{doc_id}")
def make_searchable(doc_id: str, page: Optional[int] = Query(None), stash: bool = Query(True)):
    pages = [page] if page is not None else None
    words, stash_id, stash_page = pdf_service.make_searchable(doc_id, pages, stash=stash)
    if words == -1:
        raise HTTPException(status_code=503, detail="Tesseract OCR no está instalado")
    return {"words": words, "stash_id": stash_id or None, "stash_page": stash_page}
