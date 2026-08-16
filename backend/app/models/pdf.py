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
    layer: Optional[str] = None

class AnnotationList(BaseModel):
    annotations: List[Annotation]

class RotateRequest(BaseModel):
    page_num: int
    degrees: int

class DeletePagesRequest(BaseModel):
    pages: List[int]
    stash: bool = True

class RestorePagesRequest(BaseModel):
    stash_id: str
    at: List[int]

class RestoreDocumentRequest(BaseModel):
    stash_id: str

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
    stash: bool = True

class ReorderPagesRequest(BaseModel):
    new_order: List[int]

class WatermarkRequest(BaseModel):
    text: str
    color: str = "#888888"
    fontsize: float = 48.0
    angle: int = 45
    opacity: float = 0.3
    tiled: bool = True
    stash: bool = True

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
    stash: bool = True

class CropRequest(BaseModel):
    page_num: int
    top: float
    right: float
    bottom: float
    left: float
    stash: bool = True

class ReplacePageRequest(BaseModel):
    page_num: int
    stash_id: str

class RotatePagesRequest(BaseModel):
    pages: List[int]
    degrees: int

class HeaderFooterRequest(BaseModel):
    header: Optional[str] = None
    footer: Optional[str] = None
    fontsize: float = 10.0
    color: str = "#000000"
    stash: bool = True

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
    stash: bool = True

class MetadataRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    keywords: Optional[str] = None

class MetadataResult(BaseModel):
    success: bool = True
    previous: MetadataRequest

class SaveResult(BaseModel):
    success: bool
    path: Optional[str] = None
    stash_id: Optional[str] = None

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
    stash: bool = True

class FormFieldCreate(BaseModel):
    page_num: int
    field_type: str  # text | checkbox | radio | combo
    field_name: str = ""
    x: float
    y: float
    width: float
    height: float
    options: List[str] = []
    radio_value: Optional[str] = None
    stash: bool = True

class FormFieldResult(BaseModel):
    success: bool = True
    previous: str = ""
    stash_id: Optional[str] = None
    field_name: Optional[str] = None

class FormFieldTransform(BaseModel):
    xref: int
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    delete: bool = False
    stash: bool = True

class SavePasswordRequest(BaseModel):
    output_path: Optional[str] = None
    user_password: Optional[str] = None
    owner_password: Optional[str] = None
