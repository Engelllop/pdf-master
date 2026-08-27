"""Render de páginas: imágenes, tiles, miniaturas y bytes crudos del PDF."""
from fastapi import APIRouter, HTTPException, Query, Response

from app.models.pdf import PageRender, SaveResult
from app.routers.pdf_routes._shared import _validate_output_path
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
def get_raw_pdf(doc_id: str, v: int = Query(0), marks: bool = Query(False)):
    """marks=1 devuelve una copia con las marcas pendientes dibujadas (impresión).
    El render del visor pide marks=0: las marcas las pinta el overlay editable y
    dibujarlas también aquí las mostraría dos veces."""
    data = pdf_service.get_pdf_bytes_with_marks(doc_id) if marks else pdf_service.get_pdf_bytes(doc_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(content=data, media_type="application/pdf")

@router.post("/save-page-image/{doc_id}/{page_num}", response_model=SaveResult)
def save_page_image(doc_id: str, page_num: int, output_path: str = Query(...),
                    zoom: float = Query(2.0, ge=0.05, le=32)):
    """Escribe la página como PNG donde el usuario eligió. Antes el frontend bajaba el
    blob a la carpeta de descargas y revocaba su URL en la misma línea del clic, así
    que a veces no llegaba a escribirse nada — y el aviso decía que sí."""
    _validate_output_path(output_path, {'.png'})
    img_bytes = pdf_service.get_page_image_bytes(doc_id, page_num, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Page not found")
    with open(output_path, 'wb') as fh:
        fh.write(img_bytes)
    return SaveResult(success=True, path=output_path)

@router.get("/tile/{doc_id}/{page_num}")
def get_tile(doc_id: str, page_num: int,
             x0: float = Query(...), y0: float = Query(...),
             x1: float = Query(...), y1: float = Query(...),
             zoom: float = Query(1.0, ge=0.05, le=32)):
    img_bytes = pdf_service.render_tile_bytes(doc_id, page_num, x0, y0, x1, y1, zoom)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Tile not found")
    return Response(content=img_bytes, media_type="image/png")
