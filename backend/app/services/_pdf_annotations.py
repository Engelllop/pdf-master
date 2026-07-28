import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
from datetime import datetime
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, ThumbnailRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")

# Fuentes reales de Windows para el texto embebido (se incrustan en el PDF, con
# subset al final del embed): (regular, bold, italic, bold-italic). None = esa
# variante no viene con Windows; se cae a la regular. Si nada existe → base14.
_WINDOWS_FONTS = {
    'arial': ('arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf'),
    'helvetica': ('arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf'),
    'calibri': ('calibri.ttf', 'calibrib.ttf', 'calibrii.ttf', 'calibriz.ttf'),
    'segoe ui': ('segoeui.ttf', 'segoeuib.ttf', 'segoeuii.ttf', 'segoeuiz.ttf'),
    'tahoma': ('tahoma.ttf', 'tahomabd.ttf', None, None),
    'verdana': ('verdana.ttf', 'verdanab.ttf', 'verdanai.ttf', 'verdanaz.ttf'),
    'trebuchet ms': ('trebuc.ttf', 'trebucbd.ttf', 'trebucit.ttf', 'trebucbi.ttf'),
    'times new roman': ('times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf'),
    'georgia': ('georgia.ttf', 'georgiab.ttf', 'georgiai.ttf', 'georgiaz.ttf'),
    'garamond': ('gara.ttf', 'garabd.ttf', 'garait.ttf', None),
    'courier new': ('cour.ttf', 'courbd.ttf', 'couri.ttf', 'courbi.ttf'),
    'consolas': ('consola.ttf', 'consolab.ttf', 'consolai.ttf', 'consolaz.ttf'),
    'impact': ('impact.ttf', None, None, None),
    'comic sans ms': ('comic.ttf', 'comicbd.ttf', 'comici.ttf', 'comicz.ttf'),
}

# Variantes base14 como fallback (PyMuPDF: helv/hebo/heit/hebi).
_BASE14_VARIANTS = {(False, False): 'helv', (True, False): 'hebo', (False, True): 'heit', (True, True): 'hebi'}


def _font_args(family: Optional[str], bold: bool = False, italic: bool = False) -> dict:
    if family:
        variants = _WINDOWS_FONTS.get(family.strip().lower())
        if variants:
            idx = (1 if bold else 0) + (2 if italic else 0)
            fname = variants[idx] or variants[0]
            path = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', fname)
            if os.path.exists(path):
                safe = 'F' + ''.join(c for c in fname.lower() if c.isalnum())
                return {'fontname': safe, 'fontfile': path}
    return {'fontname': _BASE14_VARIANTS[(bold, italic)]}


def _load_font(fargs: dict) -> fitz.Font:
    try:
        if 'fontfile' in fargs:
            return fitz.Font(fontfile=fargs['fontfile'])
        return fitz.Font(fargs['fontname'])
    except Exception:
        return fitz.Font('helv')


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
            elif ann.type == 'line':
                page.draw_line(fitz.Point(ann.x, ann.y),
                               fitz.Point(ann.x + (ann.width or 0), ann.y + (ann.height or 0)),
                               color=color, width=ann.lineWidth or 2,
                               dashes=dashes_for(ann), stroke_opacity=stroke_op(ann), lineCap=1)
            elif ann.type == 'callout':
                # Caja + línea guía al punto señalado (points[0]) + texto dentro.
                w, h = ann.width or 0, ann.height or 0
                box = fitz.Rect(ann.x, ann.y, ann.x + w, ann.y + h)
                tip = (ann.points or [None])[0]
                if tip:
                    tx, ty = float(tip.get('x', 0)), float(tip.get('y', 0))
                    anchor_x = box.x0 if tx < box.x0 else box.x1 if tx > box.x1 else (box.x0 + box.x1) / 2
                    anchor_y = box.y0 if ty < box.y0 else box.y1 if ty > box.y1 else (box.y0 + box.y1) / 2
                    page.draw_line(fitz.Point(anchor_x, anchor_y), fitz.Point(tx, ty),
                                   color=color, width=ann.lineWidth or 1.5, stroke_opacity=stroke_op(ann))
                    page.draw_circle(fitz.Point(tx, ty), max(1.5, (ann.lineWidth or 1.5) * 1.5),
                                     color=color, fill=color, stroke_opacity=stroke_op(ann))
                page.draw_rect(box, color=color, width=ann.lineWidth or 1.5,
                               dashes=dashes_for(ann), stroke_opacity=stroke_op(ann),
                               fill=hex_to_rgb(ann.fillColor) if ann.fillColor else (1, 1, 1),
                               fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.9)
                if ann.text:
                    fs = ann.fontSize or 12
                    fargs = _font_args(ann.fontFamily, bool(ann.bold), bool(ann.italic))
                    try:
                        page.insert_textbox(fitz.Rect(box.x0 + 3, box.y0 + 2, box.x1 - 3, box.y1 - 2),
                                            ann.text, fontsize=fs, color=color, align=0, **fargs)
                    except Exception:
                        page.insert_textbox(fitz.Rect(box.x0 + 3, box.y0 + 2, box.x1 - 3, box.y1 - 2),
                                            ann.text, fontsize=fs, color=color, align=0)
            elif ann.type == 'check':
                w, h = ann.width or 0, ann.height or 0
                pts = [fitz.Point(ann.x + w * 0.12, ann.y + h * 0.55),
                       fitz.Point(ann.x + w * 0.42, ann.y + h * 0.85),
                       fitz.Point(ann.x + w * 0.88, ann.y + h * 0.15)]
                page.draw_polyline(pts, color=color, width=ann.lineWidth or 2,
                                   dashes=dashes_for(ann), stroke_opacity=stroke_op(ann),
                                   lineCap=1, lineJoin=1)
            elif ann.type == 'cross':
                w, h = ann.width or 0, ann.height or 0
                for (ax, ay, bx, by) in ((0.15, 0.15, 0.85, 0.85), (0.85, 0.15, 0.15, 0.85)):
                    page.draw_line(fitz.Point(ann.x + w * ax, ann.y + h * ay),
                                   fitz.Point(ann.x + w * bx, ann.y + h * by),
                                   color=color, width=ann.lineWidth or 2,
                                   dashes=dashes_for(ann), stroke_opacity=stroke_op(ann), lineCap=1)
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
            elif ann.type == 'polygon':
                if ann.points and len(ann.points) >= 3:
                    pts = [fitz.Point(p["x"], p["y"]) for p in ann.points]
                    shape = page.new_shape()
                    shape.draw_polyline(pts + [pts[0]])
                    shape.finish(color=color, width=ann.lineWidth or 2, dashes=dashes_for(ann),
                                 stroke_opacity=stroke_op(ann), closePath=True, lineJoin=1,
                                 fill=hex_to_rgb(ann.fillColor) if ann.fillColor else None,
                                 fill_opacity=ann.fillOpacity if ann.fillOpacity is not None else 0.3)
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
                lh = ann.lineHeight or 1.3
                fargs = _font_args(ann.fontFamily, bool(ann.bold), bool(ann.italic))
                lines = (ann.text or '').split('\n')
                if ann.listStyle == 'bullet':
                    lines = [f"• {l}" for l in lines]
                elif ann.listStyle == 'number':
                    lines = [f"{i + 1}. {l}" for i, l in enumerate(lines)]
                # Alineación: offset por línea contra el ancho de caja (el de la
                # anotación, o el de la línea más larga si no hay caja explícita).
                offsets = [0.0] * len(lines)
                if ann.align in ('center', 'right'):
                    font = _load_font(fargs)
                    widths = [font.text_length(l, fontsize=fs) for l in lines]
                    box_w = ann.width or (max(widths) if widths else 0)
                    factor = 0.5 if ann.align == 'center' else 1.0
                    offsets = [max(0.0, (box_w - w) * factor) for w in widths]
                # ann.y is the text box top-left; place each line's baseline below it.
                for i, line in enumerate(lines):
                    pt = (ann.x + offsets[i], ann.y + fs * 0.8 + i * fs * lh)
                    try:
                        page.insert_text(pt, line, fontsize=fs, color=color, **fargs)
                    except Exception:
                        page.insert_text(pt, line, fontsize=fs, color=color)
            elif ann.type == 'note':
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or 'Nota')
                if annot:
                    annot.set_colors(stroke=color)
                    annot.update()
            elif ann.type == 'image':
                # imageData es un data-URL base64; insert_image solo rota en
                # múltiplos de 90° → se redondea la rotación libre de la app.
                if ann.imageData and ',' in ann.imageData:
                    try:
                        img_bytes = base64.b64decode(ann.imageData.split(',', 1)[1])
                        rect = fitz.Rect(ann.x, ann.y, ann.x + (ann.width or 200), ann.y + (ann.height or 150))
                        rotate = int(round((ann.rotation or 0) / 90.0) * 90) % 360
                        # keep_proportion=False: la app dibuja la imagen estirada al
                        # rectángulo de la marca, y por defecto insert_image la
                        # encajaría centrada respetando su proporción — el PDF salía
                        # con la imagen en otro sitio y más pequeña que en pantalla.
                        page.insert_image(rect, stream=img_bytes, rotate=rotate, keep_proportion=False)
                    except Exception:
                        logger.exception("embed image falló (ann %s)", ann.id)
            elif ann.type == 'count':
                # Marca de conteo: (x, y) es el centro y `text` lleva la categoría.
                # `symbol` distingue categorías por forma, no solo por color.
                r = 9.0
                sym = ann.symbol or 'circle'
                op = stroke_op(ann)
                if sym == 'square':
                    page.draw_rect(fitz.Rect(ann.x - r * 0.85, ann.y - r * 0.85, ann.x + r * 0.85, ann.y + r * 0.85),
                                   color=(1, 1, 1), width=r * 0.16, fill=color,
                                   stroke_opacity=op, fill_opacity=op)
                elif sym in ('triangle', 'diamond', 'star'):
                    if sym == 'triangle':
                        pts = [fitz.Point(ann.x, ann.y - r), fitz.Point(ann.x + r * 0.9, ann.y + r * 0.7),
                               fitz.Point(ann.x - r * 0.9, ann.y + r * 0.7)]
                    elif sym == 'diamond':
                        pts = [fitz.Point(ann.x, ann.y - r), fitz.Point(ann.x + r, ann.y),
                               fitz.Point(ann.x, ann.y + r), fitz.Point(ann.x - r, ann.y)]
                    else:
                        pts = []
                        for i in range(10):
                            angle = -math.pi / 2 + i * math.pi / 5
                            f = 1.0 if i % 2 == 0 else 0.42
                            pts.append(fitz.Point(ann.x + math.cos(angle) * r * f, ann.y + math.sin(angle) * r * f))
                    shape = page.new_shape()
                    shape.draw_polyline(pts)
                    shape.finish(color=(1, 1, 1), fill=color, closePath=True, width=r * 0.16,
                                 stroke_opacity=op, fill_opacity=op)
                    shape.commit()
                elif sym == 'cross':
                    rect = fitz.Rect(ann.x - r, ann.y - r, ann.x + r, ann.y + r)
                    page.draw_oval(rect, color=color, width=r * 0.16, stroke_opacity=op)
                    shape = page.new_shape()
                    shape.draw_line(fitz.Point(ann.x - r * 0.45, ann.y), fitz.Point(ann.x + r * 0.45, ann.y))
                    shape.draw_line(fitz.Point(ann.x, ann.y - r * 0.45), fitz.Point(ann.x, ann.y + r * 0.45))
                    shape.finish(color=color, width=r * 0.2, stroke_opacity=op)
                    shape.commit()
                else:
                    rect = fitz.Rect(ann.x - r, ann.y - r, ann.x + r, ann.y + r)
                    page.draw_oval(rect, color=(1, 1, 1), width=r * 0.16, fill=color,
                                   stroke_opacity=op, fill_opacity=op)
                    shape = page.new_shape()
                    shape.draw_line(fitz.Point(ann.x - r * 0.45, ann.y), fitz.Point(ann.x + r * 0.45, ann.y))
                    shape.draw_line(fitz.Point(ann.x, ann.y - r * 0.45), fitz.Point(ann.x, ann.y + r * 0.45))
                    shape.finish(color=(1, 1, 1), width=r * 0.2, stroke_opacity=op)
                    shape.commit()
            elif ann.type == 'measure_perimeter':
                pts = [fitz.Point(p['x'], p['y']) for p in (ann.points or [])]
                if len(pts) >= 2:
                    page.draw_polyline(pts, color=color, width=ann.lineWidth or 2,
                                       dashes=dashes_for(ann), stroke_opacity=stroke_op(ann),
                                       lineCap=1, lineJoin=1)
                    if ann.measurement:
                        mid = pts[len(pts) // 2]
                        page.insert_text((mid.x + 4, mid.y - 6), ann.measurement.label,
                                         fontsize=9, color=color)

        # Las fuentes TTF incrustadas por insert_text(fontfile=...) se reducen al
        # subconjunto de glifos usados (sin esto cada fuente añade cientos de KB).
        try:
            doc.subset_fonts()
        except Exception:
            pass

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
