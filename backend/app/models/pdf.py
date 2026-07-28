from pydantic import BaseModel
from typing import Optional, List

class PageSize(BaseModel):
    page_num: int
    width: float
    height: float

class OpenPdfRequest(BaseModel):
    file_path: str
    password: Optional[str] = None

class PdfInfo(BaseModel):
    doc_id: str
    file_path: str
    page_count: int
    title: Optional[str] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    current_page: int = 0
    page_sizes: List[PageSize] = []

class PageRender(BaseModel):
    page_num: int
    image_base64: str
    width: int
    height: int
    original_width: float
    original_height: float

class ThumbnailRender(BaseModel):
    page_num: int
    image_base64: str
    width: int
    height: int

class PdfOutlineItem(BaseModel):
    title: str
    page: int
    children: Optional[List["PdfOutlineItem"]] = None

PdfOutlineItem.model_rebuild()

class MeasurementData(BaseModel):
    value: float
    unit: str
    label: str

class Reply(BaseModel):
    id: str
    author: Optional[str] = None
    text: str
    at: float

class Annotation(BaseModel):
    id: str
    type: str
    page: int
    x: float
    y: float
    width: Optional[float] = None
    height: Optional[float] = None
    color: Optional[str] = None
    text: Optional[str] = None
    points: Optional[List[dict]] = None
    lineWidth: Optional[float] = None
    lineStyle: Optional[str] = None
    opacity: Optional[float] = None
    fillColor: Optional[str] = None
    fillOpacity: Optional[float] = None
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None
    measurement: Optional[MeasurementData] = None
    rotation: Optional[float] = None
    imageData: Optional[str] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    align: Optional[str] = None
    lineHeight: Optional[float] = None
    listStyle: Optional[str] = None
    symbol: Optional[str] = None
    # Metadatos de revisión (v1.12): quién marcó, cuándo, si está resuelta y el hilo
    # de respuestas. Opcionales para no romper sidecars antiguos.
    author: Optional[str] = None
    createdAt: Optional[float] = None
    modifiedAt: Optional[float] = None
    status: Optional[str] = None
    replies: Optional[List[Reply]] = None

class AnnotationList(BaseModel):
    annotations: List[Annotation]

class RotateRequest(BaseModel):
    page_num: int
    degrees: int

class DeletePagesRequest(BaseModel):
    pages: List[int]

class MergeRequest(BaseModel):
    source_path: str

class SplitRequest(BaseModel):
    pages: List[int]

class InsertImageRequest(BaseModel):
    page_num: int
    x: float
    y: float
    width: float
    height: float
    image_path: str

class ReorderPagesRequest(BaseModel):
    new_order: List[int]

class WatermarkRequest(BaseModel):
    text: str
    color: str = "#888888"
    fontsize: float = 48.0
    angle: int = 45
    opacity: float = 0.3
    tiled: bool = True

class CreateBlankRequest(BaseModel):
    output_path: str
    page_width: float = 595.0
    page_height: float = 842.0
    page_count: int = 1

class RedactRequest(BaseModel):
    page_num: int
    x: float
    y: float
    width: float
    height: float

class CropRequest(BaseModel):
    page_num: int
    top: float
    right: float
    bottom: float
    left: float

class RotatePagesRequest(BaseModel):
    pages: List[int]
    degrees: int

class HeaderFooterRequest(BaseModel):
    header: Optional[str] = None
    footer: Optional[str] = None
    fontsize: float = 10.0
    color: str = "#000000"

class OcrResult(BaseModel):
    text: str

class TextBlock(BaseModel):
    x: float
    y: float
    width: float
    height: float
    text: str

class PageText(BaseModel):
    blocks: List[TextBlock]

class ReplaceTextRequest(BaseModel):
    query: str
    replace: str
    page_num: Optional[int] = None
    case_sensitive: bool = False
    replace_all: bool = True

class MetadataRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    keywords: Optional[str] = None

class SaveResult(BaseModel):
    success: bool
    path: Optional[str] = None

class TempFileResult(BaseModel):
    temp_path: str

class DirtyStatus(BaseModel):
    dirty: bool

class TextClipRequest(BaseModel):
    x: float
    y: float
    width: float
    height: float

class FormFieldUpdate(BaseModel):
    field_name: str
    value: str

class SavePasswordRequest(BaseModel):
    output_path: Optional[str] = None
    user_password: Optional[str] = None
    owner_password: Optional[str] = None
