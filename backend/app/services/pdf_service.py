import fitz  # PyMuPDF
import base64
import uuid
import json
import os
from typing import Dict, Optional, List
from app.models.pdf import PdfInfo, PageRender, ThumbnailRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings

class PdfService:
    def __init__(self):
        self._docs: Dict[str, fitz.Document] = {}
        self._infos: Dict[str, PdfInfo] = {}
        self._dirty: Dict[str, bool] = {}  # Track unsaved changes

    def open_document(self, file_path: str, password: Optional[str] = None) -> PdfInfo:
        doc = fitz.open(file_path)
        if doc.needs_pass:
            if not password:
                raise fitz.PasswordError("Document requires a password")
            auth_result = doc.authenticate(password)
            if not auth_result:
                raise fitz.PasswordError("Incorrect password")
        doc_id = str(uuid.uuid4())
        
        page_sizes = []
        for i in range(len(doc)):
            rect = doc.load_page(i).rect
            page_sizes.append(PageSize(page_num=i, width=rect.width, height=rect.height))
        
        info = PdfInfo(
            doc_id=doc_id,
            file_path=file_path,
            page_count=len(doc),
            title=doc.metadata.get("title"),
            author=doc.metadata.get("author"),
            subject=doc.metadata.get("subject"),
            current_page=0,
            page_sizes=page_sizes
        )
        
        self._docs[doc_id] = doc
        self._infos[doc_id] = info
        self._dirty[doc_id] = False
        return info

    def get_document(self, doc_id: str) -> Optional[fitz.Document]:
        return self._docs.get(doc_id)

    def get_info(self, doc_id: str) -> Optional[PdfInfo]:
        return self._infos.get(doc_id)

    def render_page(self, doc_id: str, page_num: int, zoom: float = 1.0) -> Optional[PageRender]:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return None
        
        page = doc.load_page(page_num)
        mat = fitz.Matrix(zoom * settings.RENDER_DPI / 72, zoom * settings.RENDER_DPI / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        
        img_data = pix.tobytes("png")
        img_b64 = base64.b64encode(img_data).decode('utf-8')
        
        return PageRender(
            page_num=page_num,
            image_base64=f"data:image/png;base64,{img_b64}",
            width=pix.width,
            height=pix.height,
            original_width=page.rect.width,
            original_height=page.rect.height
        )

    def render_thumbnail(self, doc_id: str, page_num: int) -> Optional[ThumbnailRender]:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return None
        
        page = doc.load_page(page_num)
        mat = fitz.Matrix(settings.THUMBNAIL_DPI / 72, settings.THUMBNAIL_DPI / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        
        img_data = pix.tobytes("png")
        img_b64 = base64.b64encode(img_data).decode('utf-8')
        
        return ThumbnailRender(
            page_num=page_num,
            image_base64=f"data:image/png;base64,{img_b64}",
            width=pix.width,
            height=pix.height
        )

    def get_outline(self, doc_id: str) -> List[PdfOutlineItem]:
        doc = self._docs.get(doc_id)
        if not doc:
            return []
        
        outline = doc.get_toc()
        result: List[PdfOutlineItem] = []
        stack: List[tuple] = []
        
        for item in outline:
            level, title, page = item[0], item[1], item[2] - 1
            node = PdfOutlineItem(title=title, page=page, children=[])
            
            while len(stack) >= level:
                stack.pop()
            
            if not stack:
                result.append(node)
            else:
                parent = stack[-1][1]
                if parent.children is None:
                    parent.children = []
                parent.children.append(node)
            
            stack.append((level, node))
        
        return result

    def search_text(self, doc_id: str, query: str, limit: int = 500) -> List[dict]:
        doc = self._docs.get(doc_id)
        if not doc:
            return []
        
        results = []
        for page_num in range(len(doc)):
            if len(results) >= limit:
                break
            page = doc.load_page(page_num)
            rects = page.search_for(query)
            for rect in rects:
                if len(results) >= limit:
                    break
                results.append({
                    "page": page_num,
                    "x": rect.x0,
                    "y": rect.y0,
                    "width": rect.width,
                    "height": rect.height
                })
        return results

    # --- Document operations ---

    def rotate_page(self, doc_id: str, page_num: int, degrees: int) -> bool:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        page.set_rotation((page.rotation + degrees) % 360)
        self._dirty[doc_id] = True
        return True

    def delete_pages(self, doc_id: str, pages: List[int]) -> bool:
        doc = self._docs.get(doc_id)
        if not doc:
            return False
        # Delete in reverse order to keep indices valid
        for p in sorted(pages, reverse=True):
            if 0 <= p < len(doc):
                doc.delete_page(p)
        info = self._infos.get(doc_id)
        if info:
            info.page_count = len(doc)
            info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
        self._dirty[doc_id] = True
        return True

    def merge_pdf(self, doc_id: str, source_path: str) -> bool:
        doc = self._docs.get(doc_id)
        if not doc or not os.path.exists(source_path):
            return False
        try:
            src = fitz.open(source_path)
            doc.insert_pdf(src)
            src.close()
            info = self._infos.get(doc_id)
            if info:
                info.page_count = len(doc)
                info.page_sizes = [PageSize(page_num=i, width=doc.load_page(i).rect.width, height=doc.load_page(i).rect.height) for i in range(len(doc))]
            self._dirty[doc_id] = True
            return True
        except Exception:
            return False

    def split_pages(self, doc_id: str, pages: List[int]) -> Optional[str]:
        doc = self._docs.get(doc_id)
        if not doc:
            return None
        new_doc = fitz.open()
        for p in pages:
            if 0 <= p < len(doc):
                new_doc.insert_pdf(doc, from_page=p, to_page=p)
        # Save to temp
        temp_path = os.path.join(os.path.dirname(doc.name), f"split_{uuid.uuid4().hex[:8]}.pdf")
        new_doc.save(temp_path)
        new_doc.close()
        return temp_path

    def compress(self, doc_id: str, output_path: str) -> bool:
        doc = self._docs.get(doc_id)
        if not doc:
            return False
        try:
            doc.save(output_path, garbage=4, deflate=True, clean=True)
            return True
        except Exception:
            return False

    def save(self, doc_id: str, output_path: Optional[str] = None) -> Optional[str]:
        doc = self._docs.get(doc_id)
        if not doc:
            return None
        save_path = output_path or doc.name
        try:
            # Atomic save: write to temp then rename to avoid corruption
            import tempfile
            dir_name = os.path.dirname(os.path.abspath(save_path))
            fd, temp_path = tempfile.mkstemp(suffix='.pdf', dir=dir_name)
            os.close(fd)
            doc.save(temp_path, garbage=4, deflate=True)
            # On Windows, remove existing file first to allow rename
            if os.path.exists(save_path):
                os.replace(temp_path, save_path)
            else:
                os.rename(temp_path, save_path)
            self._dirty[doc_id] = False
            return save_path
        except Exception as e:
            return None

    def insert_text(self, doc_id: str, page_num: int, x: float, y: float, text: str, color: str = "#000000", fontsize: float = 12) -> bool:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        # Parse hex color
        rgb = tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4)) if color.startswith('#') else (0, 0, 0)
        page.insert_text((x, y), text, fontsize=fontsize, color=rgb)
        self._dirty[doc_id] = True
        return True

    def insert_image(self, doc_id: str, page_num: int, x: float, y: float, width: float, height: float, image_path: str) -> bool:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc) or not os.path.exists(image_path):
            return False
        page = doc.load_page(page_num)
        rect = fitz.Rect(x, y, x + width, y + height)
        page.insert_image(rect, filename=image_path)
        self._dirty[doc_id] = True
        return True

    # --- Annotations persistence ---

    def _get_annotations_path(self, file_path: str) -> str:
        return file_path + ".pdfmaster.json"

    def load_annotations(self, doc_id: str) -> List[Annotation]:
        info = self._infos.get(doc_id)
        if not info:
            return []
        path = self._get_annotations_path(info.file_path)
        if not os.path.exists(path):
            return []
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return [Annotation(**ann) for ann in data.get('annotations', [])]
        except Exception:
            return []

    def save_annotations(self, doc_id: str, annotations: List[Annotation]) -> bool:
        info = self._infos.get(doc_id)
        if not info:
            return False
        path = self._get_annotations_path(info.file_path)
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump({"version": 1, "annotations": [ann.model_dump() for ann in annotations]}, f, indent=2)
            return True
        except Exception:
            return False

    def embed_annotations(self, doc_id: str, annotations: List[Annotation]) -> bool:
        doc = self._docs.get(doc_id)
        if not doc:
            return False
        
        def hex_to_rgb(color: Optional[str]):
            if not color or not color.startswith('#'):
                return (0, 0, 0)
            try:
                return tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4))
            except Exception:
                return (0, 0, 0)
        
        for ann in annotations:
            if ann.page < 0 or ann.page >= len(doc):
                continue
            page = doc.load_page(ann.page)
            color = hex_to_rgb(ann.color)
            
            if ann.type == 'highlight':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_highlight_annot(rect)
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
            elif ann.type == 'underline':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_underline_annot(rect)
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
            elif ann.type == 'strikethrough':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_strikeout_annot(rect)
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
            elif ann.type == 'rect':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                page.draw_rect(rect, color=color, width=ann.lineWidth or 2)
            elif ann.type == 'circle':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                page.draw_oval(rect, color=color, width=ann.lineWidth or 2)
            elif ann.type == 'arrow':
                x1, y1 = ann.x, ann.y
                x2, y2 = ann.x + (ann.width or 0), ann.y + (ann.height or 0)
                page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=color, width=ann.lineWidth or 2)
                # Arrowhead
                angle = fitz.utils.degrees(fitz.utils.atan2(y2 - y1, x2 - x1))
                head_len = 10
                p1 = fitz.Point(x2, y2)
                p2 = fitz.Point(x2 - head_len * fitz.utils.cos(angle - 30), y2 - head_len * fitz.utils.sin(angle - 30))
                p3 = fitz.Point(x2 - head_len * fitz.utils.cos(angle + 30), y2 - head_len * fitz.utils.sin(angle + 30))
                page.draw_polygon([p1, p2, p3], color=color, fill=color)
            elif ann.type == 'draw':
                if ann.points and len(ann.points) > 1:
                    pts = [fitz.Point(p.x, p.y) for p in ann.points]
                    page.draw_polyline(pts, color=color, width=ann.lineWidth or 2)
            elif ann.type == 'text':
                page.insert_text((ann.x, ann.y + 14), ann.text or '', fontsize=14, color=color)
            elif ann.type == 'note':
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or 'Nota')
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
        
        self._dirty[doc_id] = True
        return True

    def get_page_text(self, doc_id: str, page_num: int) -> str:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return ""
        page = doc.load_page(page_num)
        return page.get_text()

    def export_word(self, doc_id: str) -> Optional[dict]:
        doc = self._docs.get(doc_id)
        if not doc:
            return None
        try:
            from docx import Document
            from docx.shared import Pt
            import io
            import base64
            document = Document()
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    for line in text.split('\n'):
                        if line.strip():
                            p = document.add_paragraph(line.strip())
                            p.style.font.size = Pt(11)
                if page_num < len(doc) - 1:
                    document.add_page_break()
            buffer = io.BytesIO()
            document.save(buffer)
            buffer.seek(0)
            data = buffer.read()
            return {
                "filename": os.path.basename(doc.name).replace('.pdf', '.docx'),
                "data_base64": base64.b64encode(data).decode('utf-8'),
            }
        except Exception as e:
            print("Export word error:", e)
            return None

    def get_form_fields(self, doc_id: str, page_num: int) -> List[dict]:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return []
        page = doc.load_page(page_num)
        widgets = page.widgets()
        results = []
        for widget in widgets:
            results.append({
                "field_name": widget.field_name,
                "field_type": widget.field_type_string,
                "field_flags": widget.field_flags,
                "rect": {
                    "x": widget.rect.x0,
                    "y": widget.rect.y0,
                    "width": widget.rect.width,
                    "height": widget.rect.height,
                },
                "value": widget.field_value or "",
                "options": widget.choice_values or [],
            })
        return results

    def set_form_field(self, doc_id: str, page_num: int, field_name: str, value: str) -> bool:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return False
        page = doc.load_page(page_num)
        widgets = page.widgets()
        for widget in widgets:
            if widget.field_name == field_name:
                widget.field_value = value
                widget.update()
                self._dirty[doc_id] = True
                return True
        return False

    def get_text_clip(self, doc_id: str, page_num: int, x: float, y: float, w: float, h: float) -> str:
        doc = self._docs.get(doc_id)
        if not doc or page_num < 0 or page_num >= len(doc):
            return ""
        page = doc.load_page(page_num)
        rect = fitz.Rect(x, y, x + w, y + h)
        return page.get_text("text", clip=rect)

    def save_with_password(self, doc_id: str, output_path: Optional[str] = None, user_password: Optional[str] = None, owner_password: Optional[str] = None) -> Optional[str]:
        doc = self._docs.get(doc_id)
        if not doc:
            return None
        save_path = output_path or doc.name
        try:
            import tempfile
            dir_name = os.path.dirname(os.path.abspath(save_path))
            fd, temp_path = tempfile.mkstemp(suffix='.pdf', dir=dir_name)
            os.close(fd)
            if user_password or owner_password:
                doc.save(temp_path, garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=user_password or '', owner_pw=owner_password or user_password or '')
            else:
                doc.save(temp_path, garbage=4, deflate=True)
            if os.path.exists(save_path):
                os.replace(temp_path, save_path)
            else:
                os.rename(temp_path, save_path)
            self._dirty[doc_id] = False
            return save_path
        except Exception:
            return None

    def close_document(self, doc_id: str) -> bool:
        doc = self._docs.pop(doc_id, None)
        if doc:
            doc.close()
        self._infos.pop(doc_id, None)
        self._dirty.pop(doc_id, None)
        return doc is not None

pdf_service = PdfService()
