from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import os
import fitz
from app.models.pdf import (
    OpenPdfRequest, PdfInfo, PageRender, ThumbnailRender,
    PdfOutlineItem, AnnotationList, RotateRequest, DeletePagesRequest,
    MergeRequest, SplitRequest, InsertTextRequest, SaveResult,
    TempFileResult, DirtyStatus, TextClipRequest, SavePasswordRequest,
    FormFieldUpdate, InsertImageRequest, ReorderPagesRequest,
    WatermarkRequest, CreateBlankRequest, RedactRequest, CropRequest,
    RotatePagesRequest, HeaderFooterRequest, OcrResult,
    ReplaceTextRequest, MetadataRequest, PageText, TextBlock,
)
from app.services.pdf_service import pdf_service

router = APIRouter()

@router.post("/open", response_model=PdfInfo)
def open_pdf(request: OpenPdfRequest):
    try:
        info = pdf_service.open_document(request.file_path, request.password)
        # Load persisted annotations
        anns = pdf_service.load_annotations(info.doc_id)
        # We'll return annotations in a separate call, but we could attach them here
        return info
    except fitz.PasswordError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/page/{doc_id}/{page_num}", response_model=PageRender)
def get_page(doc_id: str, page_num: int, zoom: float = Query(1.0)):
    render = pdf_service.render_page(doc_id, page_num, zoom)
    if not render:
        raise HTTPException(status_code=404, detail="Page not found")
    return render

@router.get("/page-info/{doc_id}/{page_num}")
def get_page_info(doc_id: str, page_num: int, zoom: float = Query(1.0)):
    info = pdf_service.get_page_info(doc_id, page_num, zoom)
    if not info:
        raise HTTPException(status_code=404, detail="Page not found")
    return info

@router.get("/page-image/{doc_id}/{page_num}")
def get_page_image(doc_id: str, page_num: int, zoom: float = Query(1.0)):
    img_bytes = pdf_service.get_page_image_bytes(doc_id, page_num, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Page not found")
    from fastapi import Response
    return Response(content=img_bytes, media_type="image/png")

@router.get("/tile/{doc_id}/{page_num}")
def get_tile(doc_id: str, page_num: int,
             x0: float = Query(...), y0: float = Query(...),
             x1: float = Query(...), y1: float = Query(...),
             zoom: float = Query(1.0)):
    img_bytes = pdf_service.render_tile_bytes(doc_id, page_num, x0, y0, x1, y1, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Tile not found")
    from fastapi import Response
    return Response(content=img_bytes, media_type="image/png")

@router.get("/thumbnail/{doc_id}/{page_num}", response_model=ThumbnailRender)
def get_thumbnail(doc_id: str, page_num: int):
    thumb = pdf_service.render_thumbnail(doc_id, page_num)
    if not thumb:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return thumb

@router.get("/outline/{doc_id}", response_model=List[PdfOutlineItem])
def get_outline(doc_id: str):
    return pdf_service.get_outline(doc_id)

@router.get("/search/{doc_id}")
def search_pdf(doc_id: str, query: str = Query(..., min_length=1), limit: int = Query(500, ge=1, le=5000)):
    return pdf_service.search_text(doc_id, query, limit)

@router.get("/dirty/{doc_id}", response_model=DirtyStatus)
def get_dirty(doc_id: str):
    return DirtyStatus(dirty=pdf_service._dirty.get(doc_id, False))

# --- Document operations ---

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

@router.post("/header-footer/{doc_id}", response_model=SaveResult)
def add_header_footer(doc_id: str, req: HeaderFooterRequest):
    ok = pdf_service.add_header_footer(doc_id, req.header, req.footer, req.fontsize, req.color)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/delete-pages/{doc_id}", response_model=SaveResult)
def delete_pages(doc_id: str, req: DeletePagesRequest):
    ok = pdf_service.delete_pages(doc_id, req.pages)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/merge/{doc_id}", response_model=SaveResult)
def merge_pdf(doc_id: str, req: MergeRequest):
    ok = pdf_service.merge_pdf(doc_id, req.source_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Merge failed")
    return SaveResult(success=True)

@router.post("/split/{doc_id}", response_model=TempFileResult)
def split_pdf(doc_id: str, req: SplitRequest, output_path: Optional[str] = Query(None)):
    if output_path and not _is_safe_path(os.path.dirname(output_path) or os.getcwd(), output_path):
        raise HTTPException(status_code=400, detail="Invalid output path")
    path = pdf_service.split_pages(doc_id, req.pages, output_path)
    if not path:
        raise HTTPException(status_code=400, detail="Split failed")
    return TempFileResult(temp_path=path)

@router.post("/compress/{doc_id}", response_model=SaveResult)
def compress_pdf(doc_id: str, output_path: str = Query(...)):
    ok = pdf_service.compress(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Compress failed")
    return SaveResult(success=True, path=output_path)

@router.post("/save/{doc_id}", response_model=SaveResult)
def save_pdf(doc_id: str, output_path: Optional[str] = Query(None)):
    path = pdf_service.save(doc_id, output_path)
    if not path:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=path)

@router.post("/insert-text/{doc_id}", response_model=SaveResult)
def insert_text(doc_id: str, req: InsertTextRequest):
    ok = pdf_service.insert_text(doc_id, req.page_num, req.x, req.y, req.text, req.color, req.fontsize)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

@router.post("/insert-image/{doc_id}", response_model=SaveResult)
def insert_image(doc_id: str, req: InsertImageRequest):
    ok = pdf_service.insert_image(doc_id, req.page_num, req.x, req.y, req.width, req.height, req.image_path)
    if not ok:
        raise HTTPException(status_code=404, detail="Page or image not found")
    return SaveResult(success=True)

@router.post("/reorder/{doc_id}", response_model=SaveResult)
def reorder_pages(doc_id: str, req: ReorderPagesRequest):
    ok = pdf_service.reorder_pages(doc_id, req.new_order)
    if not ok:
        raise HTTPException(status_code=400, detail="Reorder failed")
    return SaveResult(success=True)

@router.post("/watermark/{doc_id}", response_model=SaveResult)
def add_watermark(doc_id: str, req: WatermarkRequest):
    ok = pdf_service.add_watermark(doc_id, req.text, req.color, req.fontsize, req.angle, req.opacity)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/create-blank", response_model=PdfInfo)
def create_blank(req: CreateBlankRequest):
    if not _is_safe_path(os.path.dirname(req.output_path) or os.getcwd(), req.output_path):
        raise HTTPException(status_code=400, detail="Invalid output path")
    info = pdf_service.create_blank_pdf(req.output_path, req.page_width, req.page_height, req.page_count)
    if not info:
        raise HTTPException(status_code=400, detail="Failed to create blank PDF")
    return info

@router.post("/redact/{doc_id}", response_model=SaveResult)
def redact_area(doc_id: str, req: RedactRequest):
    ok = pdf_service.redact_area(doc_id, req.page_num, req.x, req.y, req.width, req.height)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

@router.post("/crop/{doc_id}", response_model=SaveResult)
def crop_page(doc_id: str, req: CropRequest):
    ok = pdf_service.crop_page(doc_id, req.page_num, req.top, req.right, req.bottom, req.left)
    if not ok:
        raise HTTPException(status_code=400, detail="Crop failed")
    return SaveResult(success=True)

@router.post("/export-excel/{doc_id}", response_model=SaveResult)
def export_excel(doc_id: str, output_path: str = Query(...)):
    if not _is_safe_path(os.path.dirname(output_path) or os.getcwd(), output_path):
        raise HTTPException(status_code=400, detail="Invalid output path")
    ok = pdf_service.export_excel(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)

@router.post("/export-pptx/{doc_id}", response_model=SaveResult)
def export_pptx(doc_id: str, output_path: str = Query(...)):
    if not _is_safe_path(os.path.dirname(output_path) or os.getcwd(), output_path):
        raise HTTPException(status_code=400, detail="Invalid output path")
    ok = pdf_service.export_pptx(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Export failed")
    return SaveResult(success=True, path=output_path)

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

@router.post("/replace-text/{doc_id}")
def replace_text(doc_id: str, req: ReplaceTextRequest):
    count = pdf_service.replace_text(doc_id, req.query, req.replace, req.page_num, req.case_sensitive, req.replace_all)
    return {"replaced": count}

@router.post("/metadata/{doc_id}", response_model=SaveResult)
def set_metadata(doc_id: str, req: MetadataRequest):
    ok = pdf_service.set_metadata(doc_id, req.title, req.author, req.subject, req.keywords)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

# --- Annotations ---

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

@router.post("/text-clip/{doc_id}/{page_num}")
def get_text_clip(doc_id: str, page_num: int, req: TextClipRequest):
    text = pdf_service.get_text_clip(doc_id, page_num, req.x, req.y, req.width, req.height)
    return {"text": text}

@router.get("/spans/{doc_id}/{page_num}")
def get_page_spans(doc_id: str, page_num: int):
    return {"spans": pdf_service.get_page_spans(doc_id, page_num)}

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

@router.post("/page-numbers/{doc_id}", response_model=SaveResult)
def add_page_numbers(doc_id: str, prefix: str = Query(""), start: int = Query(1), position: str = Query("bottom")):
    if not pdf_service.add_page_numbers(doc_id, prefix, start, position):
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/redact-matches/{doc_id}")
def redact_matches(doc_id: str, query: str = Query(..., min_length=1)):
    return {"redacted": pdf_service.redact_matches(doc_id, query)}

@router.post("/markup-summary/{doc_id}")
def markup_summary(doc_id: str, req: AnnotationList):
    result = pdf_service.generate_markup_summary(doc_id, req.annotations)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return result

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
def make_searchable(doc_id: str, page: Optional[int] = Query(None)):
    pages = [page] if page is not None else None
    words = pdf_service.make_searchable(doc_id, pages)
    if words == -1:
        raise HTTPException(status_code=503, detail="Tesseract OCR no está instalado")
    return {"words": words}

@router.post("/save-password/{doc_id}", response_model=SaveResult)
def save_with_password(doc_id: str, req: SavePasswordRequest):
    path = pdf_service.save_with_password(doc_id, req.output_path, req.user_password, req.owner_password)
    if not path:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=path)

@router.get("/export-word/{doc_id}")
def export_word(doc_id: str):
    result = pdf_service.export_word(doc_id)
    if not result:
        raise HTTPException(status_code=400, detail="Export failed")
    return result

@router.get("/widgets/{doc_id}/{page_num}")
def get_widgets(doc_id: str, page_num: int):
    return pdf_service.get_form_fields(doc_id, page_num)

@router.post("/widgets/{doc_id}/{page_num}", response_model=SaveResult)
def update_widget(doc_id: str, page_num: int, req: FormFieldUpdate):
    ok = pdf_service.set_form_field(doc_id, page_num, req.field_name, req.value)
    if not ok:
        raise HTTPException(status_code=404, detail="Field not found")
    return SaveResult(success=True)

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

def _is_safe_path(base_dir: str, target_path: str) -> bool:
    """Prevent directory traversal by ensuring target is within base_dir."""
    try:
        real_base = os.path.realpath(base_dir)
        real_target = os.path.realpath(target_path)
        return os.path.commonpath([real_base, real_target]) == real_base
    except ValueError:
        return False

# Patch save endpoints to validate output paths
_original_save = pdf_service.save
_original_compress = pdf_service.compress

def _safe_save(doc_id: str, output_path: Optional[str] = None) -> Optional[str]:
    if output_path and not _is_safe_path(os.path.dirname(output_path) or os.getcwd(), output_path):
        return None
    return _original_save(doc_id, output_path)

def _safe_compress(doc_id: str, output_path: str) -> bool:
    if not _is_safe_path(os.path.dirname(output_path) or os.getcwd(), output_path):
        return False
    return _original_compress(doc_id, output_path)

pdf_service.save = _safe_save
pdf_service.compress = _safe_compress
