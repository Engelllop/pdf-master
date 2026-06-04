from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import os
import fitz
from app.models.pdf import (
    OpenPdfRequest, PdfInfo, PageRender, ThumbnailRender,
    PdfOutlineItem, AnnotationList, RotateRequest, DeletePagesRequest,
    MergeRequest, SplitRequest, InsertTextRequest, SaveResult,
    TempFileResult, DirtyStatus, TextClipRequest, SavePasswordRequest,
    FormFieldUpdate,
)
from app.services.pdf_service import pdf_service

router = APIRouter()

@router.post("/open", response_model=PdfInfo)
async def open_pdf(request: OpenPdfRequest):
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
async def get_page(doc_id: str, page_num: int, zoom: float = Query(1.0)):
    render = pdf_service.render_page(doc_id, page_num, zoom)
    if not render:
        raise HTTPException(status_code=404, detail="Page not found")
    return render

@router.get("/thumbnail/{doc_id}/{page_num}", response_model=ThumbnailRender)
async def get_thumbnail(doc_id: str, page_num: int):
    thumb = pdf_service.render_thumbnail(doc_id, page_num)
    if not thumb:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return thumb

@router.get("/outline/{doc_id}", response_model=List[PdfOutlineItem])
async def get_outline(doc_id: str):
    return pdf_service.get_outline(doc_id)

@router.get("/search/{doc_id}")
async def search_pdf(doc_id: str, query: str = Query(..., min_length=1), limit: int = Query(500, ge=1, le=5000)):
    return pdf_service.search_text(doc_id, query, limit)

@router.get("/dirty/{doc_id}", response_model=DirtyStatus)
async def get_dirty(doc_id: str):
    return DirtyStatus(dirty=pdf_service._dirty.get(doc_id, False))

# --- Document operations ---

@router.post("/rotate/{doc_id}", response_model=SaveResult)
async def rotate_page(doc_id: str, req: RotateRequest):
    ok = pdf_service.rotate_page(doc_id, req.page_num, req.degrees)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

@router.post("/delete-pages/{doc_id}", response_model=SaveResult)
async def delete_pages(doc_id: str, req: DeletePagesRequest):
    ok = pdf_service.delete_pages(doc_id, req.pages)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return SaveResult(success=True)

@router.post("/merge/{doc_id}", response_model=SaveResult)
async def merge_pdf(doc_id: str, req: MergeRequest):
    ok = pdf_service.merge_pdf(doc_id, req.source_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Merge failed")
    return SaveResult(success=True)

@router.post("/split/{doc_id}", response_model=TempFileResult)
async def split_pdf(doc_id: str, req: SplitRequest):
    path = pdf_service.split_pages(doc_id, req.pages)
    if not path:
        raise HTTPException(status_code=400, detail="Split failed")
    return TempFileResult(temp_path=path)

@router.post("/compress/{doc_id}", response_model=SaveResult)
async def compress_pdf(doc_id: str, output_path: str = Query(...)):
    ok = pdf_service.compress(doc_id, output_path)
    if not ok:
        raise HTTPException(status_code=400, detail="Compress failed")
    return SaveResult(success=True, path=output_path)

@router.post("/save/{doc_id}", response_model=SaveResult)
async def save_pdf(doc_id: str, output_path: Optional[str] = Query(None)):
    path = pdf_service.save(doc_id, output_path)
    if not path:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=path)

@router.post("/insert-text/{doc_id}", response_model=SaveResult)
async def insert_text(doc_id: str, req: InsertTextRequest):
    ok = pdf_service.insert_text(doc_id, req.page_num, req.x, req.y, req.text, req.color, req.fontsize)
    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")
    return SaveResult(success=True)

# --- Annotations ---

@router.get("/annotations/{doc_id}", response_model=AnnotationList)
async def get_annotations(doc_id: str):
    anns = pdf_service.load_annotations(doc_id)
    return AnnotationList(annotations=anns)

@router.post("/annotations/{doc_id}", response_model=SaveResult)
async def save_annotations(doc_id: str, req: AnnotationList):
    ok = pdf_service.save_annotations(doc_id, req.annotations)
    if not ok:
        raise HTTPException(status_code=400, detail="Save annotations failed")
    return SaveResult(success=True)

@router.post("/embed/{doc_id}", response_model=SaveResult)
async def embed_annotations(doc_id: str, req: AnnotationList):
    ok = pdf_service.embed_annotations(doc_id, req.annotations)
    if not ok:
        raise HTTPException(status_code=400, detail="Embed annotations failed")
    return SaveResult(success=True)

@router.get("/text/{doc_id}/{page_num}")
async def get_page_text(doc_id: str, page_num: int):
    text = pdf_service.get_page_text(doc_id, page_num)
    return {"text": text}

@router.post("/text-clip/{doc_id}/{page_num}")
async def get_text_clip(doc_id: str, page_num: int, req: TextClipRequest):
    text = pdf_service.get_text_clip(doc_id, page_num, req.x, req.y, req.width, req.height)
    return {"text": text}

@router.post("/save-password/{doc_id}", response_model=SaveResult)
async def save_with_password(doc_id: str, req: SavePasswordRequest):
    path = pdf_service.save_with_password(doc_id, req.output_path, req.user_password, req.owner_password)
    if not path:
        raise HTTPException(status_code=400, detail="Save failed")
    return SaveResult(success=True, path=path)

@router.get("/export-word/{doc_id}")
async def export_word(doc_id: str):
    result = pdf_service.export_word(doc_id)
    if not result:
        raise HTTPException(status_code=400, detail="Export failed")
    return result

@router.get("/widgets/{doc_id}/{page_num}")
async def get_widgets(doc_id: str, page_num: int):
    return pdf_service.get_form_fields(doc_id, page_num)

@router.post("/widgets/{doc_id}/{page_num}", response_model=SaveResult)
async def update_widget(doc_id: str, page_num: int, req: FormFieldUpdate):
    ok = pdf_service.set_form_field(doc_id, page_num, req.field_name, req.value)
    if not ok:
        raise HTTPException(status_code=404, detail="Field not found")
    return SaveResult(success=True)

@router.get("/health")
async def health_check():
    return {"status": "ok"}

@router.post("/close/{doc_id}")
async def close_pdf(doc_id: str):
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
