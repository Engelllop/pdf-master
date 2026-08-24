import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
import re
from datetime import datetime
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, ThumbnailRender, PdfOutlineItem, PageSize, Annotation, Reply
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
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                anns = [Annotation(**ann) for ann in data.get('annotations', [])]
                if anns:
                    return anns
            except Exception:
                logger.exception("Sidecar de anotaciones corrupto: %s", path)
        return self.import_native_annotations(doc_id)

    @staticmethod
    def _read_pm(doc, annot) -> dict:
        try:
            kind, val = doc.xref_get_key(annot.xref, "PM")
            if kind in ("string", "text") and val:
                raw = val[1:-1] if val.startswith("(") and val.endswith(")") else val
                return json.loads(raw)
        except Exception:
            pass
        return {}

    @staticmethod
    def _read_da(doc, xref) -> dict:
        """Tamaño y color del texto de un FreeText ajeno (Acrobat/Bluebeam, o una
        versión vieja de la app) leyendo su /DA. Sin esto se importaban con el tamaño
        por defecto (14 pt) y con `/C` como color — que en un FreeText es el fondo del
        globo, no la letra: el texto salía blanco sobre blanco."""
        out: dict = {}
        try:
            kind, val = doc.xref_get_key(xref, "DA")
            if kind not in ("string", "text") or not val:
                return out
            da = val[1:-1] if val.startswith("(") and val.endswith(")") else val
            m = re.search(r"/\S+\s+([\d.]+)\s+Tf", da)
            if m and float(m.group(1)) > 0:
                out["fontSize"] = float(m.group(1))
            m = re.search(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg", da)
            if m:
                out["color"] = '#%02x%02x%02x' % tuple(
                    max(0, min(255, int(float(c) * 255))) for c in m.groups())
            else:
                m = re.search(r"(?<![\d.])([\d.]+)\s+g(?![a-zA-Z])", da)
                if m:
                    g = max(0, min(255, int(float(m.group(1)) * 255)))
                    out["color"] = '#%02x%02x%02x' % (g, g, g)
        except Exception:
            pass
        return out

    @staticmethod
    def _vertices_to_points(verts) -> List[dict]:
        points = []
        if not verts:
            return points
        first = verts[0]
        # Ink: lista de trazos, cada uno una lista de puntos.
        if isinstance(first, (list, tuple)) and first and not isinstance(first[0], (int, float)):
            for stroke in verts:
                points.extend(AnnotationsMixin._vertices_to_points(stroke))
            return points
        if isinstance(first, (int, float)):
            for j in range(0, len(verts) - 1, 2):
                points.append({'x': float(verts[j]), 'y': float(verts[j + 1])})
        else:
            for pt in verts:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    points.append({'x': float(pt[0]), 'y': float(pt[1])})
                elif hasattr(pt, 'x'):
                    points.append({'x': float(pt.x), 'y': float(pt.y)})
        return points

    def import_native_annotations(self, doc_id: str) -> List[Annotation]:
        """Lee anotaciones ya embebidas (Bluebeam/Acrobat) al abrir un PDF sin sidecar."""
        doc = self._acquire(doc_id)
        if not doc:
            return []
        type_map = {
            'Highlight': 'highlight', 'Underline': 'underline', 'StrikeOut': 'strikethrough',
            'Text': 'note', 'FreeText': 'text', 'Square': 'rect', 'Circle': 'circle',
            'Line': 'line', 'Ink': 'draw', 'PolyLine': 'draw', 'Polygon': 'polygon',
            'Stamp': 'stamp',
        }
        by_xref: Dict[int, Annotation] = {}
        replies: List[tuple] = []
        for i in range(len(doc)):
            page = doc.load_page(i)
            annots = page.annots()
            if not annots:
                continue
            for a in annots:
                try:
                    info = a.info or {}
                    pm = self._read_pm(doc, a)
                    if a.irt_xref:
                        replies.append((a.irt_xref, Reply(
                            id=str(pm.get('id') or uuid.uuid4()),
                            author=info.get('title') or None,
                            text=info.get('content') or '',
                            at=float(pm.get('at') or 0),
                        )))
                        continue
                    raw = a.type[1] if a.type else ''
                    mapped = pm.get('type') or type_map.get(raw)
                    if not mapped:
                        continue
                    r = a.rect
                    color = None
                    try:
                        sc = (a.colors or {}).get('stroke')
                        if sc and len(sc) >= 3:
                            color = '#%02x%02x%02x' % tuple(max(0, min(255, int(c * 255))) for c in sc[:3])
                    except Exception:
                        pass
                    da = self._read_da(doc, a.xref) if raw == 'FreeText' else {}
                    if da.get('color') and not pm.get('color'):
                        color = da['color']
                    text = pm.get('text') if pm.get('text') is not None else (info.get('content') or None)
                    points = pm.get('points')
                    if not points and mapped in ('draw', 'polygon', 'line', 'signature', 'check', 'cross',
                                                 'measure_perimeter', 'measure_area', 'arrow') and getattr(a, 'vertices', None):
                        points = self._vertices_to_points(a.vertices) or None
                    name = info.get('name') or ''
                    ann_id = pm.get('id') or (name.split(':', 1)[1] if name.startswith('pdfmaster:') else str(uuid.uuid4()))
                    color = pm.get('color') or color
                    if mapped == 'count':
                        cx = float(pm['x']) if 'x' in pm else float(r.x0 + r.width / 2)
                        cy = float(pm['y']) if 'y' in pm else float(r.y0 + r.height / 2)
                        by_xref[a.xref] = Annotation(
                            id=ann_id, type='count', page=i, x=cx, y=cy, color=color,
                            text=text or (info.get('subject') or '').split(':', 1)[-1].strip() or None,
                            author=info.get('title') or None, status=pm.get('status'),
                            layer=pm.get('layer') or None,
                            symbol=pm.get('symbol'),
                            createdAt=pm.get('createdAt'),
                        )
                        continue
                    if mapped in ('line', 'arrow', 'measure_distance') and 'x' not in pm and points and len(points) >= 2:
                        x0, y0 = points[0]['x'], points[0]['y']
                        x1, y1 = points[-1]['x'], points[-1]['y']
                        by_xref[a.xref] = Annotation(
                            id=ann_id, type=mapped, page=i, x=x0, y=y0,
                            width=x1 - x0, height=y1 - y0, color=color, text=text,
                            author=info.get('title') or None, status=pm.get('status'),
                            layer=pm.get('layer') or info.get('subject') or None,
                            measurement=pm.get('measurement'),
                            createdAt=pm.get('createdAt'),
                        )
                        continue
                    by_xref[a.xref] = Annotation(
                        id=ann_id, type=mapped, page=i,
                        x=float(pm['x']) if 'x' in pm else float(r.x0),
                        y=float(pm['y']) if 'y' in pm else float(r.y0),
                        width=pm.get('width', float(r.width)),
                        height=pm.get('height', float(r.height)),
                        color=color, text=text, points=points,
                        author=info.get('title') or None,
                        status=pm.get('status'),
                        layer=pm.get('layer') or (None if (info.get('subject') or '').startswith('Count:') else info.get('subject')) or None,
                        symbol=pm.get('symbol'),
                        fontSize=pm.get('fontSize') or da.get('fontSize'),
                        fontFamily=pm.get('fontFamily'),
                        lineWidth=pm.get('lineWidth'),
                        lineStyle=pm.get('lineStyle'),
                        opacity=pm.get('opacity'),
                        fillColor=pm.get('fillColor'),
                        fillOpacity=pm.get('fillOpacity'),
                        measurement=pm.get('measurement'),
                        createdAt=pm.get('createdAt'),
                        modifiedAt=pm.get('modifiedAt'),
                    )
                except Exception:
                    logger.exception("No se pudo importar una anotación nativa (pág %s)", i)
        for irt, reply in replies:
            parent = by_xref.get(irt)
            if parent is None:
                continue
            parent.replies = (parent.replies or []) + [reply]
        return list(by_xref.values())

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

    def _style_annot(self, annot, ann: Annotation, color, fill=None):
        if not annot:
            return
        try:
            annot.set_colors(stroke=color, fill=fill)
        except Exception:
            pass
        lw = ann.lineWidth or 1
        dashes = None
        if ann.lineStyle == 'dashed':
            dashes = [lw * 3, lw * 2]
        elif ann.lineStyle == 'dotted':
            dashes = [0.5, lw * 2]
        if ann.type not in ('highlight', 'underline', 'strikethrough', 'note', 'text', 'callout'):
            try:
                annot.set_border(width=lw, dashes=dashes)
            except Exception:
                pass
        if ann.opacity is not None:
            try:
                annot.set_opacity(float(ann.opacity))
            except Exception:
                pass

    def _stamp_markup(self, annot, ann: Annotation):
        """Autor, id, capa, estado y respuestas viajan en el PDF (Acrobat/Bluebeam)."""
        if not annot:
            return
        content = ann.text or ""
        if ann.measurement and getattr(ann.measurement, 'label', None):
            content = content or ann.measurement.label
        subject = ann.layer or "Marcas"
        if ann.type == 'count':
            subject = f"Count: {ann.text or 'General'}"
        try:
            annot.set_info(content=content, title=ann.author or "", subject=subject)
        except Exception:
            pass
        try:
            annot.set_name(f"pdfmaster:{ann.id}")
        except Exception:
            pass
        payload = {
            "id": ann.id,
            "type": ann.type,
            "status": ann.status,
            "layer": ann.layer,
            "symbol": ann.symbol,
            "text": ann.text,
            "fontSize": ann.fontSize,
            "fontFamily": ann.fontFamily,
            "x": ann.x,
            "y": ann.y,
            "width": ann.width,
            "height": ann.height,
            "points": ann.points,
            "color": ann.color,
            "lineWidth": ann.lineWidth,
            "lineStyle": ann.lineStyle,
            "opacity": ann.opacity,
            "fillColor": ann.fillColor,
            "fillOpacity": ann.fillOpacity,
            "createdAt": ann.createdAt,
            "modifiedAt": ann.modifiedAt,
        }
        if ann.measurement:
            payload["measurement"] = ann.measurement.model_dump()
        payload = {k: v for k, v in payload.items() if v is not None}
        try:
            page = annot.parent
            doc = page.parent if page is not None else None
            if doc is not None:
                doc.xref_set_key(annot.xref, "PM", fitz.get_pdf_str(json.dumps(payload, ensure_ascii=True)))
        except Exception:
            pass
        for reply in ann.replies or []:
            try:
                page = annot.parent
                if page is None:
                    break
                rann = page.add_text_annot(
                    fitz.Point((ann.x or 0) + 8, (ann.y or 0) + 8),
                    reply.text or "",
                )
                if rann:
                    rann.set_info(content=reply.text or "", title=reply.author or "")
                    rann.set_name(f"pdfmaster:{reply.id}")
                    rann.set_irt_xref(annot.xref)
                    try:
                        page.parent.xref_set_key(
                            rann.xref, "PM",
                            fitz.get_pdf_str(json.dumps({"id": reply.id, "at": reply.at}, ensure_ascii=False)),
                        )
                    except Exception:
                        pass
                    rann.update()
            except Exception:
                logger.exception("No se pudo incrustar una respuesta (ann %s)", ann.id)
        try:
            annot.update()
        except Exception:
            pass

    def embed_annotations(self, doc_id: str, annotations: List[Annotation]) -> bool:
        """Deja las marcas en cola para el próximo guardado. NO toca el documento
        vivo: antes las aplicaba encima, así que un segundo guardado las volvía a
        incrustar y los resaltados salían apilados (1 → 2 → 3…). El guardado las
        aplica sobre una copia limpia, así el resultado no depende de cuántas veces
        se haya guardado."""
        self._acquire(doc_id)  # valida que el doc existe (404 si no)
        with self._lock:
            self._pending_annotations[doc_id] = list(annotations or [])
            self._dirty[doc_id] = True
        return True

    def _embed_into(self, doc, annotations: List[Annotation]) -> bool:
        """Dibuja las marcas sobre el documento que se le pase (una copia, al guardar)."""
        if doc is None:
            return False

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
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'underline':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_underline_annot(rect)
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'strikethrough':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_strikeout_annot(rect)
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'rect':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_rect_annot(rect)
                self._style_annot(annot, ann, color, hex_to_rgb(ann.fillColor) if ann.fillColor else None)
                self._stamp_markup(annot, ann)
            elif ann.type == 'circle':
                rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_circle_annot(rect)
                self._style_annot(annot, ann, color, hex_to_rgb(ann.fillColor) if ann.fillColor else None)
                self._stamp_markup(annot, ann)
            elif ann.type in ('arrow', 'line', 'measure_distance'):
                p1 = fitz.Point(ann.x, ann.y)
                p2 = fitz.Point(ann.x + (ann.width or 0), ann.y + (ann.height or 0))
                annot = page.add_line_annot(p1, p2)
                self._style_annot(annot, ann, color)
                if annot and ann.type == 'arrow':
                    try:
                        annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_CLOSED_ARROW)
                    except Exception:
                        pass
                self._stamp_markup(annot, ann)
            elif ann.type == 'callout':
                w, h = ann.width or 0, ann.height or 0
                box = fitz.Rect(ann.x, ann.y, ann.x + w, ann.y + h)
                tip = (ann.points or [None])[0]
                callout = None
                if tip:
                    tx, ty = float(tip.get('x', 0)), float(tip.get('y', 0))
                    anchor_x = box.x0 if tx < box.x0 else box.x1 if tx > box.x1 else (box.x0 + box.x1) / 2
                    anchor_y = box.y0 if ty < box.y0 else box.y1 if ty > box.y1 else (box.y0 + box.y1) / 2
                    callout = [fitz.Point(tx, ty), fitz.Point(anchor_x, anchor_y), fitz.Point(anchor_x, anchor_y)]
                annot = page.add_freetext_annot(
                    box, ann.text or '', fontsize=ann.fontSize or 12,
                    text_color=color, fill_color=hex_to_rgb(ann.fillColor) if ann.fillColor else (1, 1, 1),
                    border_color=color, border_width=ann.lineWidth or 1,
                    callout=callout, opacity=stroke_op(ann),
                )
                self._stamp_markup(annot, ann)
            elif ann.type == 'check':
                w, h = ann.width or 0, ann.height or 0
                pts = [fitz.Point(ann.x + w * 0.12, ann.y + h * 0.55),
                       fitz.Point(ann.x + w * 0.42, ann.y + h * 0.85),
                       fitz.Point(ann.x + w * 0.88, ann.y + h * 0.15)]
                annot = page.add_polyline_annot(pts)
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'cross':
                w, h = ann.width or 0, ann.height or 0
                strokes = [
                    [(ann.x + w * 0.15, ann.y + h * 0.15),
                     (ann.x + w * 0.85, ann.y + h * 0.85)],
                    [(ann.x + w * 0.85, ann.y + h * 0.15),
                     (ann.x + w * 0.15, ann.y + h * 0.85)],
                ]
                annot = page.add_ink_annot(strokes)
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'star':
                w, h = ann.width or 0, ann.height or 0
                cx, cy = ann.x + w / 2, ann.y + h / 2
                pts = []
                for i in range(10):
                    angle = -math.pi / 2 + i * math.pi / 5
                    f = 0.5 if i % 2 == 0 else 0.21
                    pts.append(fitz.Point(cx + math.cos(angle) * w * f, cy + math.sin(angle) * h * f))
                shape = page.new_shape()
                shape.draw_polyline(pts + [pts[0]])
                shape.finish(color=color, width=ann.lineWidth or 2, dashes=dashes_for(ann),
                             stroke_opacity=stroke_op(ann), closePath=True, lineJoin=1,
                             fill=hex_to_rgb(ann.fillColor) if ann.fillColor else None,
                             fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.3)
                shape.commit()
            elif ann.type == 'cloud':
                # Festones semicirculares hacia afuera por todo el perímetro del rect
                # (mismo trazado que el render SVG del frontend).
                w, h = ann.width or 0, ann.height or 0
                r = max(5.0, min(abs(w), abs(h)) / 6)
                corners = [fitz.Point(ann.x, ann.y), fitz.Point(ann.x + w, ann.y),
                           fitz.Point(ann.x + w, ann.y + h), fitz.Point(ann.x, ann.y + h)]
                normals = [(0, -1), (1, 0), (0, 1), (-1, 0)]
                shape = page.new_shape()
                for e in range(4):
                    p0, p1 = corners[e], corners[(e + 1) % 4]
                    nx_, ny_ = normals[e]
                    length = abs(p1.x - p0.x) + abs(p1.y - p0.y)
                    n = max(2, round(length / (r * 2)))
                    for i in range(n):
                        a = fitz.Point(p0.x + (p1.x - p0.x) * i / n, p0.y + (p1.y - p0.y) * i / n)
                        b = fitz.Point(p0.x + (p1.x - p0.x) * (i + 1) / n, p0.y + (p1.y - p0.y) * (i + 1) / n)
                        ctrl = fitz.Point((a.x + b.x) / 2 + nx_ * r * 1.8, (a.y + b.y) / 2 + ny_ * r * 1.8)
                        shape.draw_curve(a, ctrl, b)
                shape.finish(color=color, width=ann.lineWidth or 2, dashes=dashes_for(ann),
                             stroke_opacity=stroke_op(ann), closePath=True, lineJoin=1,
                             fill=hex_to_rgb(ann.fillColor) if ann.fillColor else None,
                             fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.3)
                shape.commit()
            elif ann.type in ('polygon', 'measure_area'):
                if ann.points and len(ann.points) >= 3:
                    pts = [fitz.Point(p["x"], p["y"]) for p in ann.points]
                    annot = page.add_polygon_annot(pts)
                    self._style_annot(annot, ann, color, hex_to_rgb(ann.fillColor) if ann.fillColor else None)
                    self._stamp_markup(annot, ann)
            elif ann.type in ('draw', 'signature'):
                if ann.points and len(ann.points) > 1:
                    pts = [(float(p["x"]), float(p["y"])) for p in ann.points]
                    annot = page.add_ink_annot([pts])
                    ink_color = (0, 0, 0) if ann.type == 'signature' and not ann.color else color
                    self._style_annot(annot, ann, ink_color)
                    if ann.type == 'signature' and annot:
                        try:
                            annot.set_border(width=ann.lineWidth or 3)
                        except Exception:
                            pass
                    self._stamp_markup(annot, ann)
            elif ann.type == 'text':
                fs = ann.fontSize or 14
                lh = ann.lineHeight or 1.3
                lines = (ann.text or '').split('\n')
                if ann.listStyle == 'bullet':
                    lines = [f"• {l}" for l in lines]
                elif ann.listStyle == 'number':
                    lines = [f"{i + 1}. {l}" for i, l in enumerate(lines)]
                body = '\n'.join(lines)
                w = ann.width or 200
                h = ann.height or max(fs * lh * max(len(lines), 1) + 6, fs + 6)
                box = fitz.Rect(ann.x, ann.y, ann.x + w, ann.y + h)
                align = {'center': 1, 'right': 2}.get(ann.align or '', 0)
                annot = page.add_freetext_annot(
                    box, body, fontsize=fs, text_color=color,
                    fill_color=None, border_width=0, opacity=stroke_op(ann), align=align,
                )
                self._stamp_markup(annot, ann)
            elif ann.type == 'note':
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or 'Nota')
                self._style_annot(annot, ann, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'image':
                if ann.imageData and ',' in ann.imageData:
                    try:
                        img_bytes = base64.b64decode(ann.imageData.split(',', 1)[1])
                        rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 200), ann.y + (ann.height or 150))
                        angle = float(ann.rotation or 0)
                        rotate = 0
                        if abs(angle) > 0.5:
                            if abs(angle % 90) < 0.5:
                                rotate = int(round(angle / 90.0) * 90) % 360
                            else:
                                from io import BytesIO
                                from PIL import Image
                                im = Image.open(BytesIO(img_bytes)).convert('RGBA')
                                im = im.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)
                                buf = BytesIO()
                                im.save(buf, format='PNG')
                                img_bytes = buf.getvalue()
                        page.insert_image(rect, stream=img_bytes, rotate=rotate, keep_proportion=False)
                    except Exception:
                        logger.exception("embed image falló (ann %s)", ann.id)
            elif ann.type == 'count':
                r = 9.0
                annot = page.add_circle_annot(fitz.Rect(ann.x - r, ann.y - r, ann.x + r, ann.y + r))
                self._style_annot(annot, ann, color, color)
                self._stamp_markup(annot, ann)
            elif ann.type == 'measure_perimeter':
                pts = [fitz.Point(p['x'], p['y']) for p in (ann.points or [])]
                if len(pts) >= 2:
                    annot = page.add_polyline_annot(pts)
                    self._style_annot(annot, ann, color)
                    self._stamp_markup(annot, ann)

        # Las fuentes TTF incrustadas por insert_text(fontfile=...) se reducen al
        # subconjunto de glifos usados (sin esto cada fuente añade cientos de KB).
        try:
            doc.subset_fonts()
        except Exception:
            pass

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
        resolved = sum(1 for a in annotations if a.status == "resolved")
        page.insert_text((50, y), f"Total: {len(annotations)} anotaciones  ·  {resolved} resuelta(s)",
                         fontsize=10, color=(0.3, 0.3, 0.3))
        y += 22
        for idx, ann in enumerate(sorted(annotations, key=lambda a: (a.page, a.y or 0)), 1):
            if y > 780:
                page = out.new_page()
                y = 60
            text = (ann.text or "").replace("\n", " ").strip()
            line = f"{idx}.  Pág {ann.page + 1}  ·  {ann.type}" + (f"  ·  {text[:90]}" if text else "")
            page.insert_text((50, y), line, fontsize=9, color=(0.1, 0.1, 0.1))
            y += 15
            # Segunda línea con los metadatos de revisión, solo si los hay.
            meta = []
            if ann.author:
                meta.append(ann.author)
            if ann.createdAt:
                meta.append(datetime.fromtimestamp(ann.createdAt / 1000).strftime("%m/%d/%Y %H:%M"))
            if ann.status == "resolved":
                meta.append("RESUELTA")
            replies = ann.replies or []
            if replies:
                meta.append(f"{len(replies)} respuesta(s)")
            if meta:
                page.insert_text((66, y), "  ·  ".join(meta), fontsize=8, color=(0.45, 0.45, 0.45))
                y += 13
            for r in replies:
                if y > 780:
                    page = out.new_page()
                    y = 60
                reply_text = (r.text or "").replace("\n", " ").strip()
                page.insert_text((80, y), f"↳ {r.author or 'Sin autor'}: {reply_text[:80]}",
                                 fontsize=8, color=(0.45, 0.45, 0.45))
                y += 13
        data = out.tobytes()
        out.close()
        return {
            "filename": source_name.replace('.pdf', '') + "_marcas.pdf",
            "data_base64": base64.b64encode(data).decode('utf-8'),
        }

    # --- XFDF (interoperabilidad con Acrobat/Bluebeam) ---
    # XFDF usa coordenadas PDF con origen abajo-izquierda; las anotaciones de la app
    # vienen de fitz (origen arriba-izquierda), así que todo se refleja con la altura
    # de página: y_xfdf = H - y_app.

    def _page_heights(self, doc_id: str) -> Optional[List[float]]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            return [doc.load_page(i).rect.height for i in range(len(doc))]

    def export_xfdf(self, doc_id: str, annotations: List[Annotation], output_path: str) -> bool:
        import xml.etree.ElementTree as ET
        heights = self._page_heights(doc_id)
        if heights is None:
            return False
        info = self._infos.get(doc_id)
        NS = "http://ns.adobe.com/xfdf/"
        ET.register_namespace("", NS)
        root = ET.Element(f"{{{NS}}}xfdf", {"xml:space": "preserve"})
        annots = ET.SubElement(root, f"{{{NS}}}annots")

        def flip(page: int, y: float) -> float:
            h = heights[page] if 0 <= page < len(heights) else 842.0
            return h - y

        def base_attrs(ann: Annotation) -> dict:
            attrs = {"page": str(ann.page), "color": ann.color or "#FF0000"}
            if ann.opacity is not None:
                attrs["opacity"] = f"{ann.opacity:.2f}"
            if ann.lineWidth:
                attrs["width"] = f"{ann.lineWidth:g}"
            # `title` es el autor en XFDF (así lo leen Acrobat y Bluebeam).
            if ann.author:
                attrs["title"] = ann.author
            if ann.createdAt:
                attrs["date"] = datetime.fromtimestamp(ann.createdAt / 1000).strftime("D:%Y%m%d%H%M%S")
            return attrs

        def rect_attr(ann: Annotation) -> str:
            # Las marcas definidas por puntos (área, perímetro, polígono) no tienen
            # width/height: su rect es el bbox de los vértices.
            if ann.points and not ann.width:
                xs = [p['x'] for p in ann.points]
                ys = [p['y'] for p in ann.points]
                return (f"{min(xs):.2f},{flip(ann.page, max(ys)):.2f},"
                        f"{max(xs):.2f},{flip(ann.page, min(ys)):.2f}")
            w = ann.width or 0
            h = ann.height or 0
            x0, x1 = sorted((ann.x, ann.x + w))
            ytop, ybot = sorted((ann.y, ann.y + h))
            return f"{x0:.2f},{flip(ann.page, ybot):.2f},{x1:.2f},{flip(ann.page, ytop):.2f}"

        for ann in annotations:
            a = base_attrs(ann)
            el = None
            if ann.type in ("highlight", "underline", "strikethrough"):
                tag = {"highlight": "highlight", "underline": "underline", "strikethrough": "strikeout"}[ann.type]
                a["rect"] = rect_attr(ann)
                x0, x1 = sorted((ann.x, ann.x + (ann.width or 0)))
                yt = flip(ann.page, ann.y)
                yb = flip(ann.page, ann.y + (ann.height or 0))
                a["coords"] = f"{x0:.2f},{yt:.2f},{x1:.2f},{yt:.2f},{x0:.2f},{yb:.2f},{x1:.2f},{yb:.2f}"
                el = ET.SubElement(annots, f"{{{NS}}}{tag}", a)
            elif ann.type == "rect":
                a["rect"] = rect_attr(ann)
                if ann.fillColor:
                    a["interior-color"] = ann.fillColor
                el = ET.SubElement(annots, f"{{{NS}}}square", a)
            elif ann.type == "circle":
                a["rect"] = rect_attr(ann)
                if ann.fillColor:
                    a["interior-color"] = ann.fillColor
                el = ET.SubElement(annots, f"{{{NS}}}circle", a)
            elif ann.type in ("arrow", "line", "measure_distance"):
                x2 = ann.x + (ann.width or 0)
                y2 = ann.y + (ann.height or 0)
                a["start"] = f"{ann.x:.2f},{flip(ann.page, ann.y):.2f}"
                a["end"] = f"{x2:.2f},{flip(ann.page, y2):.2f}"
                if ann.type == "arrow":
                    a["tail"] = "None"
                    a["head"] = "ClosedArrow"
                a["rect"] = rect_attr(ann)
                el = ET.SubElement(annots, f"{{{NS}}}line", a)
                if ann.type == "measure_distance" and ann.measurement:
                    a_contents = ET.SubElement(el, f"{{{NS}}}contents")
                    a_contents.text = ann.measurement.label
            elif ann.type in ("draw", "signature"):
                if not ann.points:
                    continue
                a["rect"] = rect_attr(ann)
                el = ET.SubElement(annots, f"{{{NS}}}ink", a)
                inklist = ET.SubElement(el, f"{{{NS}}}inklist")
                gesture = ET.SubElement(inklist, f"{{{NS}}}gesture")
                gesture.text = ";".join(f"{p['x']:.2f},{flip(ann.page, p['y']):.2f}" for p in ann.points)
            elif ann.type == "measure_perimeter":
                if not ann.points:
                    continue
                a["vertices"] = ";".join(f"{p['x']:.2f},{flip(ann.page, p['y']):.2f}" for p in ann.points)
                a["rect"] = rect_attr(ann)
                el = ET.SubElement(annots, f"{{{NS}}}polyline", a)
                if ann.measurement:
                    c = ET.SubElement(el, f"{{{NS}}}contents")
                    c.text = ann.measurement.label
            elif ann.type == "measure_area":
                if not ann.points:
                    continue
                a["vertices"] = ";".join(f"{p['x']:.2f},{flip(ann.page, p['y']):.2f}" for p in ann.points)
                a["rect"] = rect_attr(ann)
                el = ET.SubElement(annots, f"{{{NS}}}polygon", a)
                if ann.measurement:
                    c = ET.SubElement(el, f"{{{NS}}}contents")
                    c.text = ann.measurement.label
            elif ann.type == "note":
                y = flip(ann.page, ann.y)
                a["rect"] = f"{ann.x:.2f},{y - 24:.2f},{ann.x + 24:.2f},{y:.2f}"
                a["icon"] = "Comment"
                el = ET.SubElement(annots, f"{{{NS}}}text", a)
                c = ET.SubElement(el, f"{{{NS}}}contents")
                c.text = ann.text or ""
            elif ann.type == "text":
                a["rect"] = rect_attr(ann) if ann.width else f"{ann.x:.2f},{flip(ann.page, ann.y) - 20:.2f},{ann.x + 200:.2f},{flip(ann.page, ann.y):.2f}"
                el = ET.SubElement(annots, f"{{{NS}}}freetext", a)
                c = ET.SubElement(el, f"{{{NS}}}contents")
                c.text = ann.text or ""
            elif ann.type == "callout":
                # freetext con línea guía: `callout` lleva los 3 puntos (punta,
                # codo, anclaje) que definen la guía en el estándar XFDF.
                a["rect"] = rect_attr(ann)
                a["intent"] = "FreeTextCallout"
                tip = (ann.points or [None])[0]
                if tip:
                    tx, ty = float(tip.get("x", 0)), flip(ann.page, float(tip.get("y", 0)))
                    ax = ann.x if tx < ann.x else ann.x + (ann.width or 0)
                    ay = flip(ann.page, ann.y + (ann.height or 0) / 2)
                    a["callout"] = f"{tx:.2f},{ty:.2f},{tx:.2f},{ty:.2f},{ax:.2f},{ay:.2f}"
                if ann.fillColor:
                    a["interior-color"] = ann.fillColor
                el = ET.SubElement(annots, f"{{{NS}}}freetext", a)
                c = ET.SubElement(el, f"{{{NS}}}contents")
                c.text = ann.text or ""
            elif ann.type == "count":
                r = 9.0
                y = flip(ann.page, ann.y)
                a["rect"] = f"{ann.x - r:.2f},{y - r:.2f},{ann.x + r:.2f},{y + r:.2f}"
                a["subject"] = f"Count: {ann.text or 'General'}"
                a["interior-color"] = ann.color or "#FF0000"
                el = ET.SubElement(annots, f"{{{NS}}}circle", a)
            # 'image' no viaja en XFDF (el estándar no embebe bitmaps de forma portable)
            # `title` es el autor: solo se pone el genérico si la marca no lo trae.
            if el is not None and info and not ann.author:
                el.set("title", "PDF Master")

        f_el = ET.SubElement(root, f"{{{NS}}}f")
        if info:
            f_el.set("href", os.path.basename(info.file_path))
        try:
            ET.ElementTree(root).write(output_path, encoding="utf-8", xml_declaration=True)
            return True
        except Exception:
            logger.exception("export_xfdf falló (%s)", output_path)
            return False

    def import_xfdf(self, doc_id: str, file_path: str) -> Optional[List[Annotation]]:
        import xml.etree.ElementTree as ET
        heights = self._page_heights(doc_id)
        if heights is None:
            return None
        try:
            tree = ET.parse(file_path)
        except Exception:
            logger.exception("import_xfdf: XML inválido (%s)", file_path)
            return None

        def local(tag: str) -> str:
            return tag.rsplit("}", 1)[-1]

        def flip(page: int, y: float) -> float:
            h = heights[page] if 0 <= page < len(heights) else 842.0
            return h - y

        annots_el = None
        for child in tree.getroot():
            if local(child.tag) == "annots":
                annots_el = child
                break
        if annots_el is None:
            return []

        out: List[Annotation] = []
        for el in annots_el:
            tag = local(el.tag)
            try:
                page = int(el.get("page", "0"))
                color = el.get("color") or "#ff0000"
                opacity = float(el.get("opacity")) if el.get("opacity") else None
                width = float(el.get("width")) if el.get("width") else None
                contents = ""
                for c in el:
                    if local(c.tag) == "contents" and c.text:
                        contents = c.text
                rect = [float(v) for v in (el.get("rect") or "0,0,0,0").split(",")]
                x0, y0f, x1, y1f = rect[0], rect[1], rect[2], rect[3]
                x, w = min(x0, x1), abs(x1 - x0)
                y = flip(page, max(y0f, y1f))
                h = abs(y1f - y0f)
                common = dict(id=str(uuid.uuid4()), page=page, color=color, opacity=opacity, lineWidth=width)

                if tag in ("highlight", "underline", "strikeout"):
                    t = {"highlight": "highlight", "underline": "underline", "strikeout": "strikethrough"}[tag]
                    out.append(Annotation(type=t, x=x, y=y, width=w, height=h, **common))
                elif tag == "square":
                    out.append(Annotation(type="rect", x=x, y=y, width=w, height=h,
                                          fillColor=el.get("interior-color"), **common))
                elif tag == "circle":
                    subject = el.get("subject") or ""
                    if subject.startswith("Count:"):
                        out.append(Annotation(type="count", x=x + w / 2, y=y + h / 2,
                                              text=subject.split(":", 1)[1].strip(), **common))
                    else:
                        out.append(Annotation(type="circle", x=x, y=y, width=w, height=h,
                                              fillColor=el.get("interior-color"), **common))
                elif tag == "line":
                    sx, sy = [float(v) for v in (el.get("start") or "0,0").split(",")]
                    ex, ey = [float(v) for v in (el.get("end") or "0,0").split(",")]
                    out.append(Annotation(type="arrow", x=sx, y=flip(page, sy),
                                          width=ex - sx, height=flip(page, ey) - flip(page, sy), **common))
                elif tag == "ink":
                    pts = []
                    for il in el:
                        if local(il.tag) != "inklist":
                            continue
                        for g in il:
                            if local(g.tag) == "gesture" and g.text:
                                for pair in g.text.replace("\n", ";").split(";"):
                                    pair = pair.strip()
                                    if not pair:
                                        continue
                                    px, py = [float(v) for v in pair.split(",")[:2]]
                                    pts.append({"x": px, "y": flip(page, py)})
                    if len(pts) > 1:
                        out.append(Annotation(type="draw", x=pts[0]["x"], y=pts[0]["y"], points=pts, **common))
                elif tag == "polygon":
                    pts = []
                    for pair in (el.get("vertices") or "").split(";"):
                        pair = pair.strip()
                        if not pair:
                            continue
                        px, py = [float(v) for v in pair.split(",")[:2]]
                        pts.append({"x": px, "y": flip(page, py)})
                    if len(pts) >= 3:
                        out.append(Annotation(type="measure_area", x=pts[0]["x"], y=pts[0]["y"], points=pts, **common))
                elif tag == "text":
                    out.append(Annotation(type="note", x=x, y=y, text=contents, **common))
                elif tag == "freetext":
                    out.append(Annotation(type="text", x=x, y=y, width=w, height=h, text=contents, **common))
            except Exception:
                logger.exception("import_xfdf: anotación <%s> ignorada", tag)
        return out
