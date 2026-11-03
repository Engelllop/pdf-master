import fitz  # PyMuPDF
import base64
import logging
import math
import re
import uuid
import json
import os
from typing import Dict, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")


class ReadMixin:
    def get_outline(self, doc_id: str) -> List[PdfOutlineItem]:
        with self._lock:
            doc = self._acquire(doc_id)
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

    def set_outline(self, doc_id: str, items: List[dict]) -> bool:
        """Reescribe el TOC del PDF. items: [{title, page, children?}]."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return False
            toc: List[list] = []

            def walk(nodes: List[dict], level: int) -> None:
                for n in nodes:
                    title = str(n.get("title") or "Sin título")
                    page = int(n.get("page") or 0) + 1
                    toc.append([level, title, page])
                    walk(n.get("children") or [], level + 1)

            walk(items, 1)
            doc.set_toc(toc)
            self._dirty[doc_id] = True
        # Sin invalidar el cache de render: el índice/TOC no se dibuja en la página.
        return True

    def search_text(self, doc_id: str, query: str, limit: int = 500) -> List[dict]:
        with self._lock:
            doc = self._acquire(doc_id)
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
                    rect = self._a_vista(page, rect)
                    band = self._desde_vista(page, fitz.Rect(0, rect.y0 - 1, page.rect.width, rect.y1 + 1))
                    snippet = page.get_textbox(band).replace("\n", " ").strip()
                    if len(snippet) > 160:
                        snippet = snippet[:160] + "…"
                    results.append({
                        "page": page_num,
                        "x": rect.x0,
                        "y": rect.y0,
                        "width": rect.width,
                        "height": rect.height,
                        "snippet": snippet,
                    })
            return results

    def get_page_text_data(self, doc_id: str, page_num: int) -> Optional[dict]:
        """Both the positioned text blocks (for the selectable overlay) and the plain
        text (for copy / read-aloud) in a single locked call."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            blocks = []
            try:
                for b in page.get_text("blocks"):
                    x0, y0, x1, y1 = self._a_vista(page, fitz.Rect(b[:4]))
                    text = b[4]
                    blocks.append({"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0, "text": text.strip()})
            except Exception:
                blocks = []
            return {"blocks": blocks, "text": page.get_text()}

    def get_page_spans(self, doc_id: str, page_num: int) -> List[dict]:
        """Per-span text with bounding boxes, used to build a selectable text layer."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return []
            page = doc.load_page(page_num)
            data = page.get_text("dict")
            spans: List[dict] = []
            for block in data.get("blocks", []):
                for line in block.get("lines", []):
                    for sp in line.get("spans", []):
                        text = sp.get("text", "")
                        if not text.strip():
                            continue
                        x0, y0, x1, y1 = self._a_vista(page, fitz.Rect(sp["bbox"]))
                        spans.append({
                            "text": text,
                            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                            "size": sp.get("size", y1 - y0),
                            "color": "#%06x" % (sp.get("color", 0) & 0xFFFFFF),
                            "font": sp.get("font", ""),
                        })
            return spans

    @staticmethod
    def _estilo_span(sp) -> tuple:
        """(negrita, cursiva) de un span: por las banderas de PyMuPDF (16 y 2) o por
        el nombre de la fuente, que es lo único que traen muchos PDF exportados."""
        f = (sp.get("font") or "").lower()
        flags = sp.get("flags", 0)
        negrita = bool(flags & 16) or any(k in f for k in ("bold", "black", "semibold", "heavy"))
        cursiva = bool(flags & 2) or "italic" in f or "oblique" in f
        return negrita, cursiva

    def get_text_block(self, doc_id: str, page_num: int, x: float, y: float) -> Optional[dict]:
        """El texto editable bajo un punto del visor, al nivel más grande que se pueda
        reescribir sin perder formato:

        - `block`: el PÁRRAFO entero, si todas sus líneas comparten fuente, cuerpo y
          dirección. Las líneas que llegan al borde se unen con espacio (es ajuste,
          no un salto del autor) y las cortas con salto de línea.
        - `line`: solo la línea, si el párrafo mezcla estilos pero la línea no.
        - `span`: solo el tramo, si hasta la línea mezcla estilos (una palabra en
          negrita). Es lo que se hacía siempre.

        Antes se editaba siempre un tramo de una línea: un Enter escribía la segunda
        línea ENCIMA de la siguiente del párrafo, y el texto nuevo no se reacomodaba.
        """
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            p = self._desde_vista(page, fitz.Point(x, y))
            todas = [l for b in page.get_text("dict").get("blocks", []) if b.get("type", 0) == 0
                     for l in b.get("lines", [])
                     if any(s.get("text", "").strip() for s in l.get("spans", []))]
            linea = next((l for l in todas if p in fitz.Rect(l["bbox"]) + (-1, -1, 1, 1)), None)
            if linea is None:
                return None
            tramo = next((s for s in linea["spans"]
                          if s.get("text", "").strip() and p in fitz.Rect(s["bbox"]) + (-1, -1, 1, 1)), None)
            return self._bloque_editable(page, self._parrafo_de(todas, linea), linea, tramo)

    # Por dirección de línea: (inicio, fin) a lo largo del renglón y la coordenada en
    # la que se apilan los renglones, para tratar igual texto horizontal y girado.
    @staticmethod
    def _ejes_linea(l):
        x0, y0, x1, y1 = l["bbox"]
        ox, oy = l["spans"][0]["origin"]
        d = tuple(round(v) for v in l.get("dir", (1, 0)))
        if d == (0, -1):
            return -y1, -y0, ox
        if d == (-1, 0):
            return -x1, -x0, -oy
        if d == (0, 1):
            return y0, y1, -ox
        return x0, x1, oy

    def _clave_estilo(self, l):
        """(cuerpo, base14) del tramo que más caracteres tiene en la línea: con eso se
        decide qué renglones vecinos son del mismo párrafo. Antes una línea con una
        palabra en negrita no tenía clave y quedaba sola; ahora se agrupa por su estilo
        dominante y los tramos distintos viajan como `runs`."""
        ss = [s for s in l["spans"] if s.get("text", "").strip()]
        if not ss:
            return None
        dom = max(ss, key=lambda s: len(s["text"].strip()))
        return (round(dom["size"] * 2) / 2, self._base14_font(dom.get("font")))

    @staticmethod
    def _fuente_limpia(nombre) -> str:
        """El nombre de fuente sin el prefijo de subconjunto («ABCDEF+»): la misma
        fuente aparece con prefijos distintos en cada página o exportación."""
        return re.sub(r"^[A-Za-z]{6}\+", "", nombre or "").lower()

    def _estilo_de(self, sp) -> tuple:
        """Lo que hace distinto a un tramo de otro al reescribir: fuente, cuerpo, color."""
        return (self._fuente_limpia(sp.get("font")), round(float(sp.get("size", 0)) * 2) / 2,
                int(sp.get("color", 0)) & 0xFFFFFF)

    def _parrafo_de(self, todas, linea) -> list:
        """Las líneas del párrafo de `linea`. No se fía de los bloques del extractor:
        muchos PDF (los de CAD, y los que escribe el propio PyMuPDF) traen cada renglón
        en un bloque suelto. Se arma por vecindad: misma dirección y estilo, renglones
        que se solapan a lo largo y un interlineado parejo."""
        clave = self._clave_estilo(linea)
        if clave is None:
            return [linea]
        direccion = tuple(round(v) for v in linea.get("dir", (1, 0)))
        cuerpo = clave[0]
        candidatas = [l for l in todas
                      if tuple(round(v) for v in l.get("dir", (1, 0))) == direccion and self._clave_estilo(l) == clave]
        parrafo = [linea]
        for sentido in (1, -1):
            actual, paso = linea, None
            while True:
                a0, a1, ap = self._ejes_linea(actual)
                mejor, dist = None, None
                for l in candidatas:
                    if any(l is q for q in parrafo):
                        continue
                    b0, b1, bp = self._ejes_linea(l)
                    delta = (bp - ap) * sentido
                    if not (0.9 * cuerpo <= delta <= 2.2 * cuerpo) or min(a1, b1) - max(a0, b0) <= 0:
                        continue
                    if dist is None or delta < dist:
                        mejor, dist = l, delta
                if mejor is None or (paso is not None and abs(dist - paso) > 0.2 * paso):
                    break
                paso = paso or dist
                parrafo.append(mejor)
                actual = mejor
        return sorted(parrafo, key=lambda l: self._ejes_linea(l)[2])

    def _bloque_editable(self, page, lineas, linea, tramo) -> dict:
        def tramos(ls):
            return [s for l in ls for s in l["spans"] if s.get("text", "").strip()]

        def direccion(l):
            return tuple(round(v) for v in l.get("dir", (1, 0)))

        def uniforme(ls) -> bool:
            """Un solo estilo: misma fuente (no solo la misma base14: Calibri y Arial
            no son la misma letra), mismo cuerpo, mismo color y misma dirección."""
            ss = tramos(ls)
            ref = ss[0]
            dir0 = direccion(ls[0])
            return all(abs(s["size"] - ref["size"]) <= 0.6
                       and self._fuente_limpia(s.get("font")) == self._fuente_limpia(ref.get("font"))
                       and (int(s.get("color", 0)) & 0xFFFFFF) == (int(ref.get("color", 0)) & 0xFFFFFF)
                       for s in ss) and all(direccion(l) == dir0 for l in ls)

        horizontal_recto = all(direccion(l) == (1, 0) for l in lineas) and not page.rotation
        con_runs = False
        if uniforme(lineas):
            modo, elegidas = ("block" if len(lineas) > 1 else "line"), lineas
        elif horizontal_recto:
            # Estilos mezclados en texto horizontal: se edita el párrafo entero y cada
            # tramo conserva el suyo (`runs`). Antes caía a un tramo suelto, y si la
            # palabra nueva era más larga se encimaba con la siguiente.
            modo, elegidas = ("block" if len(lineas) > 1 else "line"), lineas
            con_runs = True
        elif uniforme([linea]):
            modo, elegidas = "line", [linea]
        else:
            modo, elegidas = "span", None

        if modo == "span":
            s = tramo or max(tramos([linea]), key=lambda t: len(t["text"]))
            rect = fitz.Rect(s["bbox"])
            texto = s["text"]
            ref = s
            alto_linea = None
            alineacion = "left"
        else:
            ss = tramos(elegidas)
            ref = max(ss, key=lambda t: len(t["text"]))
            dx, dy = (round(v) for v in elegidas[0].get("dir", (1, 0)))
            horizontal = dy == 0
            largo = lambda l: (fitz.Rect(l["bbox"]).width if horizontal else fitz.Rect(l["bbox"]).height)
            maximo = max(largo(l) for l in elegidas)
            partes = []
            fuente = self._base14_font(ref.get("font"))
            # Estilo de cada carácter del texto armado (índice en `estilos_info`), para
            # devolver los tramos como `runs` cuando el párrafo mezcla estilos.
            tabla_estilos: dict = {}
            estilos_info: list = []
            estilo_por_caracter: list = []

            def indice_de(sp) -> int:
                clave = self._estilo_de(sp)
                if clave not in tabla_estilos:
                    tabla_estilos[clave] = len(estilos_info)
                    neg, cur = self._estilo_span(sp)
                    estilos_info.append({
                        "font": sp.get("font", ""), "size": sp.get("size", 12),
                        "color": "#%06x" % (int(sp.get("color", 0)) & 0xFFFFFF),
                        "bold": neg, "italic": cur,
                    })
                return tabla_estilos[clave]

            def texto_linea(l):
                """El texto de la línea sin espacios en los extremos y el estilo de cada
                carácter que queda."""
                crudo, est = "", []
                for s in l["spans"]:
                    t = s.get("text", "")
                    crudo += t
                    est.extend([indice_de(s)] * len(t))
                izq, der = len(crudo) - len(crudo.lstrip()), len(crudo.rstrip())
                return crudo[izq:der], est[izq:der]

            def cabia_la_siguiente(l, siguiente) -> bool:
                # El corte es de ajuste si la primera palabra del renglón siguiente NO
                # cabía al final de este: es lo que decide cualquier compositor.
                palabra = "".join(s.get("text", "") for s in siguiente["spans"]).strip().split(" ")[0]
                try:
                    ancho = fitz.get_text_length(" " + palabra, fontname=fuente, fontsize=ref["size"])
                except Exception:
                    ancho = len(palabra) * ref["size"] * 0.5
                return largo(l) + ancho <= maximo + 0.5

            for i, l in enumerate(elegidas):
                t, est = texto_linea(l)
                if i == len(elegidas) - 1:
                    sep = ""
                elif not cabia_la_siguiente(l, elegidas[i + 1]):
                    # Línea llena: el corte es del ajuste, no del autor. Un guion al
                    # final se conserva pegado (no se sabe si era de partición).
                    sep = "" if t.endswith("-") else " "
                else:
                    sep = "\n"
                partes.append(t + sep)
                estilo_por_caracter.extend(est)
                estilo_por_caracter.extend([est[-1] if est else 0] * len(sep))
            texto = "".join(partes)
            rect = fitz.Rect()
            for l in elegidas:
                rect |= fitz.Rect(l["bbox"])
            # Interlineado real del párrafo (distancia entre orígenes / cuerpo): sin
            # esto el texto reescrito queda más apretado o más suelto que el original.
            alto_linea = None
            if len(elegidas) > 1:
                ejes = [l["spans"][0]["origin"][1 if horizontal else 0] for l in elegidas]
                pasos = sorted(abs(b - a) for a, b in zip(ejes, ejes[1:]))
                paso = pasos[len(pasos) // 2]
                if paso > 0:
                    alto_linea = round(paso / ref["size"], 3)
            alineacion = "left"
            if horizontal and len(elegidas) > 1:
                cajas = [fitz.Rect(l["bbox"]) for l in elegidas]
                izq = max(c.x0 for c in cajas) - min(c.x0 for c in cajas)
                der = max(c.x1 for c in cajas) - min(c.x1 for c in cajas)
                cen = max((c.x0 + c.x1) / 2 for c in cajas) - min((c.x0 + c.x1) / 2 for c in cajas)
                if izq > 4 and cen <= 2:
                    alineacion = "center"
                elif izq > 4 and der <= 2:
                    alineacion = "right"
            # Justificado: todos los renglones menos el último terminan en el mismo borde
            # derecho. Con menos de cuatro renglones podría ser casualidad de un texto
            # ajustado a la izquierda, así que no se declara.
            if horizontal and len(elegidas) >= 4 and alineacion == "left":
                interiores = [fitz.Rect(l["bbox"]) for l in elegidas[:-1]]
                if (max(c.x1 for c in interiores) - min(c.x1 for c in interiores) <= 1.5
                        and max(c.x0 for c in interiores[1:]) - min(c.x0 for c in interiores[1:]) <= 1.5):
                    alineacion = "justify"

        # Dónde empieza cada renglón y la línea base de la primera: lo que hace falta para
        # reescribir el párrafo en su sitio con sangría y estilos por tramo, sin que la
        # caja de texto de PyMuPDF decida la posición.
        runs = origen_y = x_primera = x_resto = None
        if modo != "span" and horizontal_recto:
            primeros = []
            for l in elegidas:
                s0 = next((s for s in l["spans"] if s.get("text", "").strip()), l["spans"][0])
                primeros.append(s0["origin"])
            origen_y = float(primeros[0][1])
            x_primera = float(primeros[0][0])
            resto = sorted(p[0] for p in primeros[1:])
            x_resto = float(resto[len(resto) // 2]) if resto else x_primera
            sangria = alineacion in ("left", "justify") and abs(x_primera - x_resto) > 2
            if not sangria:
                x_resto = x_primera
            # Siempre que sea texto horizontal: aun con un solo estilo, escribir renglón a
            # renglón respeta la línea base, el borde derecho exacto y la sangría, que la
            # caja de texto de PyMuPDF no (el primer renglón subía ~1,4 pt y un justificado
            # se pasaba ~0,6 cuerpos del borde).
            if len(estilo_por_caracter) == len(texto) and texto:
                runs = []
                for i, ind in enumerate(estilo_por_caracter):
                    if runs and runs[-1]["_i"] == ind:
                        runs[-1]["end"] = i + 1
                    else:
                        runs.append({"_i": ind, "start": i, "end": i + 1, **estilos_info[ind]})
                for r in runs:
                    r.pop("_i")

        negrita, cursiva = self._estilo_span(ref)
        x0, y0, x1, y1 = self._a_vista(page, rect)
        return {
            "mode": modo,
            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "text": texto,
            "size": ref.get("size", 12),
            "color": "#%06x" % (ref.get("color", 0) & 0xFFFFFF),
            "font": ref.get("font", ""),
            "bold": negrita,
            "italic": cursiva,
            "align": alineacion,
            "lineHeight": alto_linea,
            "runs": runs,
            "originY": origen_y,
            "xFirst": x_primera,
            "xRest": x_resto,
        }

    def get_text_clip(self, doc_id: str, page_num: int, x: float, y: float, w: float, h: float) -> str:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return ""
            page = doc.load_page(page_num)
            rect = self._desde_vista(page, fitz.Rect(x, y, x + w, y + h))
            return page.get_text("text", clip=rect)

    def get_snap_points(self, doc_id: str, page_num: int) -> Optional[List[dict]]:
        """Puntos de ajuste para mediciones: extremos y puntos medios de líneas,
        esquinas de rectángulos y extremos de curvas del contenido vectorial.
        Coordenadas en unidades PDF (las mismas que usan las anotaciones)."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            cache_key = (doc_id, page_num)
            if cache_key in self._snap_cache:
                self._snap_cache.move_to_end(cache_key)
                return self._snap_cache[cache_key]

            MAX_POINTS = 20000
            points: List[dict] = []
            seen = set()

            def add(x: float, y: float):
                if page.rotation:
                    x, y = self._a_vista(page, fitz.Point(x, y))
                key = (round(x, 1), round(y, 1))
                if key not in seen:
                    seen.add(key)
                    points.append({"x": key[0], "y": key[1]})

            page = doc.load_page(page_num)
            try:
                drawings = page.get_drawings()
            except Exception:
                drawings = []
            for d in drawings:
                if len(points) >= MAX_POINTS:
                    break
                for item in d.get("items", []):
                    kind = item[0]
                    if kind == "l":
                        p1, p2 = item[1], item[2]
                        add(p1.x, p1.y)
                        add(p2.x, p2.y)
                        add((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
                    elif kind == "re":
                        r = item[1]
                        add(r.x0, r.y0)
                        add(r.x1, r.y0)
                        add(r.x0, r.y1)
                        add(r.x1, r.y1)
                    elif kind == "c":
                        add(item[1].x, item[1].y)
                        add(item[4].x, item[4].y)
                    elif kind == "qu":
                        q = item[1]
                        for p in (q.ul, q.ur, q.ll, q.lr):
                            add(p.x, p.y)
                    if len(points) >= MAX_POINTS:
                        break

            self._snap_cache[cache_key] = points
            while len(self._snap_cache) > self._snap_cache_max:
                self._snap_cache.popitem(last=False)
            return points
