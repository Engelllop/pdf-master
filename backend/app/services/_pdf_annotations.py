import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, ThumbnailRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")


class AnnotationsMixin:
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
            logger.exception("Sidecar de anotaciones corrupto: %s", path)
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
            logger.exception("No se pudo escribir el sidecar %s", path)
            return False

    def embed_annotations(self, doc_id: str, annotations: List[Annotation]) -> bool:
        doc = self._acquire(doc_id)
        if not doc:
            return False
        self._invalidate_render_cache(doc_id)
        
        def hex_to_rgb(color: Optional[str]):
            if not color or not color.startswith('#'):
                return (0, 0, 0)
            try:
                return tuple(int(color.lstrip('#')[i:i+2], 16) / 255.0 for i in (0, 2, 4))
            except Exception:
                return (0, 0, 0)

        def dashes_for(ann: Annotation) -> Optional[str]:
            lw = ann.lineWidth or 2
            if ann.lineStyle == 'dashed':
                return f"[{lw * 3:.1f} {lw * 2:.1f}] 0"
            if ann.lineStyle == 'dotted':
                return f"[0.1 {lw * 2:.1f}] 0"
            return None

        def stroke_op(ann: Annotation) -> float:
            return ann.opacity if ann.opacity is not None else 1.0

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
                    if ann.opacity is not None:
                        annot.set_opacity(float(ann.opacity))
                    annot.update()
            elif ann.type == 'underline':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_underline_annot(rect)
                if annot:
                    annot.set_colors(stroke=color)
                    if ann.opacity is not None:
                        annot.set_opacity(float(ann.opacity))
                    annot.update()
            elif ann.type == 'strikethrough':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_strikeout_annot(rect)
                if annot:
                    annot.set_colors(stroke=color)
                    if ann.opacity is not None:
                        annot.set_opacity(float(ann.opacity))
                    annot.update()
            elif ann.type == 'rect':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                page.draw_rect(rect, color=color, width=ann.lineWidth or 2,
                               dashes=dashes_for(ann), stroke_opacity=stroke_op(ann),
                               fill=hex_to_rgb(ann.fillColor) if ann.fillColor else None,
                               fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.3)
            elif ann.type == 'circle':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                page.draw_oval(rect, color=color, width=ann.lineWidth or 2,
                               dashes=dashes_for(ann), stroke_opacity=stroke_op(ann),
                               fill=hex_to_rgb(ann.fillColor) if ann.fillColor else None,
                               fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.3)
            elif ann.type == 'arrow':
                x1, y1 = ann.x, ann.y
                x2, y2 = ann.x + (ann.width or 0), ann.y + (ann.height or 0)
                page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=color, width=ann.lineWidth or 2,
                               dashes=dashes_for(ann), stroke_opacity=stroke_op(ann))
                # Arrowhead
                angle = math.atan2(y2 - y1, x2 - x1)
                head_len = max(8, (ann.lineWidth or 2) * 4)
                p1 = fitz.Point(x2, y2)
                p2 = fitz.Point(x2 - head_len * math.cos(angle - math.pi / 6), y2 - head_len * math.sin(angle - math.pi / 6))
                p3 = fitz.Point(x2 - head_len * math.cos(angle + math.pi / 6), y2 - head_len * math.sin(angle + math.pi / 6))
                shape = page.new_shape()
                shape.draw_polyline([p1, p2, p3])
                shape.finish(color=color, fill=color, closePath=True,
                             stroke_opacity=stroke_op(ann), fill_opacity=stroke_op(ann))
                shape.commit()
            elif ann.type == 'draw':
                if ann.points and len(ann.points) > 1:
                    # points llegan como dicts del JSON, no objetos (p["x"], no p.x)
                    pts = [fitz.Point(p["x"], p["y"]) for p in ann.points]
                    page.draw_polyline(pts, color=color, width=ann.lineWidth or 2,
                                       dashes=dashes_for(ann), stroke_opacity=stroke_op(ann))
            elif ann.type == 'signature':
                if ann.points and len(ann.points) > 1:
                    pts = [fitz.Point(p["x"], p["y"]) for p in ann.points]
                    page.draw_polyline(pts, color=(0, 0, 0), width=3)
            elif ann.type == 'text':
                fs = ann.fontSize or 14
                # ann.y is the text box top-left; place each line's baseline below it.
                for i, line in enumerate((ann.text or '').split('\n')):
                    page.insert_text((ann.x, ann.y + fs * 0.8 + i * fs * 1.3), line, fontsize=fs, color=color)
            elif ann.type == 'note':
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or 'Nota')
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
            elif ann.type == 'count':
                # Marca de conteo: círculo relleno con cruz blanca; (x, y) es el centro
                # y `text` lleva la categoría (queda como contenido del annot al pasar
                # por add_circle si algún visor la muestra — aquí se dibuja plano).
                r = 9.0
                rect = fitz.Rect(ann.x - r, ann.y - r, ann.x + r, ann.y + r)
                page.draw_oval(rect, color=(1, 1, 1), width=r * 0.16, fill=color,
                               stroke_opacity=stroke_op(ann), fill_opacity=stroke_op(ann))
                shape = page.new_shape()
                shape.draw_line(fitz.Point(ann.x - r * 0.45, ann.y), fitz.Point(ann.x + r * 0.45, ann.y))
                shape.draw_line(fitz.Point(ann.x, ann.y - r * 0.45), fitz.Point(ann.x, ann.y + r * 0.45))
                shape.finish(color=(1, 1, 1), width=r * 0.2, stroke_opacity=stroke_op(ann))
                shape.commit()
        
        self._dirty[doc_id] = True
        return True

    def generate_markup_summary(self, doc_id: str, annotations: List[Annotation]) -> Optional[dict]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            source_name = os.path.basename(self._doc_path(doc_id))
        out = fitz.open()
        page = out.new_page()
        y = 60
        page.insert_text((50, y), f"Resumen de marcas — {source_name}", fontsize=15, color=(0, 0, 0))
        y += 28
        page.insert_text((50, y), f"Total: {len(annotations)} anotaciones", fontsize=10, color=(0.3, 0.3, 0.3))
        y += 22
        for idx, ann in enumerate(sorted(annotations, key=lambda a: (a.page, a.y or 0)), 1):
            if y > 780:
                page = out.new_page()
                y = 60
            text = (ann.text or "").replace("\n", " ").strip()
            line = f"{idx}.  Pág {ann.page + 1}  ·  {ann.type}" + (f"  ·  {text[:90]}" if text else "")
            page.insert_text((50, y), line, fontsize=9, color=(0.1, 0.1, 0.1))
            y += 15
        data = out.tobytes()
        out.close()
        return {
            "filename": source_name.replace('.pdf', '') + "_marcas.pdf",
            "data_base64": base64.b64encode(data).decode('utf-8'),
        }
