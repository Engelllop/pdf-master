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
    measurement: Optional[MeasurementData] = None

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

class InsertTextRequest(BaseModel):
    page_num: int
    x: float
    y: float
    text: str
    color: str = "#000000"
    fontsize: float = 12.0

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
