"""Render de páginas: imágenes, tiles, miniaturas y bytes crudos del PDF."""
from fastapi import APIRouter, HTTPException, Query, Response

from app.models.pdf import PageRender, ThumbnailRender
from app.services.pdf_service import pdf_service

router = APIRouter()


@router.get("/page/{doc_id}/{page_num}", response_model=PageRender)
def get_page(doc_id: str, page_num: int, zoom: float = Query(1.0, ge=0.05, le=32)):
    render = pdf_service.render_page(doc_id, page_num, zoom)
    if not render:
        raise HTTPException(status_code=404, detail="Page not found")
    return render

@router.get("/page-info/{doc_id}/{page_num}")
def get_page_info(doc_id: str, page_num: int, zoom: float = Query(1.0, ge=0.05, le=32)):
    info = pdf_service.get_page_info(doc_id, page_num, zoom)
    if not info:
        raise HTTPException(status_code=404, detail="Page not found")
    return info

@router.get("/page-image/{doc_id}/{page_num}")
def get_page_image(doc_id: str, page_num: int, zoom: float = Query(1.0, ge=0.05, le=32)):
    img_bytes = pdf_service.get_page_image_bytes(doc_id, page_num, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Page not found")
    return Response(content=img_bytes, media_type="image/png")

@router.get("/raw/{doc_id}")
def get_raw_pdf(doc_id: str, v: int = Query(0)):
    data = pdf_service.get_pdf_bytes(doc_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(content=data, media_type="application/pdf")

@router.get("/tile/{doc_id}/{page_num}")
def get_tile(doc_id: str, page_num: int,
             x0: float = Query(...), y0: float = Query(...),
             x1: float = Query(...), y1: float = Query(...),
             zoom: float = Query(1.0, ge=0.05, le=32)):
    img_bytes = pdf_service.render_tile_bytes(doc_id, page_num, x0, y0, x1, y1, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Tile not found")
    return Response(content=img_bytes, media_type="image/png")

@router.get("/thumbnail/{doc_id}/{page_num}", response_model=ThumbnailRender)
def get_thumbnail(doc_id: str, page_num: int):
    thumb = pdf_service.render_thumbnail(doc_id, page_num)
    if not thumb:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return thumb
