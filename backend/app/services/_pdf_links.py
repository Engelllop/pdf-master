"""Enlaces del documento: leer, crear, editar y quitar (a una dirección web o a una página).

Se identifican por su ÍNDICE en `page.get_links()` (el orden de las anotaciones de la
página), no por su xref: al deshacer se restaura el documento entero y los xref cambian,
mientras que el orden se conserva. Las coordenadas viajan en las del visor (las de
`/spans` y `/text-block`) y se llevan a las de la página sin girar, que son las que
usa PyMuPDF para los enlaces igual que para las anotaciones.
"""
import re
from typing import List, Optional

import fitz  # PyMuPDF

# Lo que un enlace puede abrir. `file:`, `javascript:`, `data:` y cualquier otro esquema
# se rechazan: un PDF que abre archivos locales o ejecuta algo al hacer clic no es un
# enlace, es una trampa, aunque el documento sea del propio usuario y lo mande a otros.
ESQUEMAS_PERMITIDOS = ("http", "https", "mailto", "tel", "ftp")

MIN_LADO = 3.0  # pt: una zona más chica que esto no se puede ni tocar

_RE_ESQUEMA = re.compile(r"^([A-Za-z][A-Za-z0-9+.-]*):")
_RE_CORREO = re.compile(r"^[^@/\s:]+@[^@/\s:]+\.[^@/\s:]+$")
_RE_DOMINIO = re.compile(r"^[^/\s:@]+\.[^/\s:@]+")


def normalizar_uri(texto: Optional[str]) -> Optional[str]:
    """La dirección lista para el PDF, o None si no es un enlace válido y permitido.

    «www.ejemplo.com/x» → «https://www.ejemplo.com/x»; «ana@correo.com» → «mailto:…»."""
    t = (texto or "").strip()
    if not t or re.search(r"[\x00-\x20\x7f]", t):  # espacios y caracteres de control
        return None
    m = _RE_ESQUEMA.match(t)
    if m:
        if m.group(1).lower() not in ESQUEMAS_PERMITIDOS:
            return None
        resto = t.split(":", 1)[1].lstrip("/")
        return t if resto else None
    if _RE_CORREO.match(t):
        return "mailto:" + t
    if _RE_DOMINIO.match(t):
        return "https://" + t
    return None


class LinksMixin:
    # ---- lectura -----------------------------------------------------------

    def _enlace_a_dict(self, page, link: dict, indice: int) -> dict:
        # `get_links()` ya devuelve la zona en coordenadas del VISOR (gira con la página);
        # `insert_link` y `update_link`, en cambio, esperan las de la página SIN girar.
        # Medido en una hoja girada: leerla con `_a_vista` la giraba dos veces.
        rect = fitz.Rect(link["from"]).normalize()
        tipo = link.get("kind")
        salida = {
            "index": indice,
            "kind": "uri" if tipo == fitz.LINK_URI else "goto" if tipo == fitz.LINK_GOTO else "other",
            "x0": rect.x0, "y0": rect.y0, "x1": rect.x1, "y1": rect.y1,
            "uri": link.get("uri") if tipo == fitz.LINK_URI else None,
            "page": link.get("page") if tipo == fitz.LINK_GOTO and link.get("page", -1) >= 0 else None,
        }
        return salida

    def listar_enlaces(self, doc_id: str, page_num: int) -> Optional[List[dict]]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            return [self._enlace_a_dict(page, l, i) for i, l in enumerate(page.get_links())]

    # ---- escritura ---------------------------------------------------------

    @staticmethod
    def _destino(doc, uri: Optional[str], target_page: Optional[int]) -> dict:
        """Los campos de destino del enlace; ValueError si no hay uno válido (o hay dos)."""
        if (uri and uri.strip()) and target_page is not None:
            raise ValueError("Un enlace va a una dirección web O a una página, no a las dos")
        if target_page is not None:
            if not 0 <= int(target_page) < len(doc):
                raise ValueError(f"La página {int(target_page) + 1} no existe (el documento tiene {len(doc)})")
            return {"kind": fitz.LINK_GOTO, "page": int(target_page), "to": fitz.Point(0, 0), "zoom": 0}
        destino = normalizar_uri(uri)
        if destino is None:
            raise ValueError("La dirección no es válida: use http(s)://, mailto: o tel:")
        return {"kind": fitz.LINK_URI, "uri": destino}

    def _zona(self, page, rect) -> fitz.Rect:
        """La zona del visor llevada a la página sin girar, dentro de la hoja."""
        zona = fitz.Rect(rect).normalize()
        if zona.width < MIN_LADO or zona.height < MIN_LADO:
            raise ValueError("La zona del enlace es demasiado pequeña")
        zona = zona & page.rect  # sin salirse de la hoja
        if zona.is_empty or zona.width < MIN_LADO or zona.height < MIN_LADO:
            raise ValueError("La zona del enlace queda fuera de la página")
        return fitz.Rect(self._desde_vista(page, zona)).normalize()

    def crear_enlace(self, doc_id: str, page_num: int, rect, uri: Optional[str] = None,
                     target_page: Optional[int] = None, stash: bool = True) -> Optional[dict]:
        """None si el documento o la página no existen; ValueError si el enlace no es válido."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            destino = self._destino(doc, uri, target_page)
            zona = self._zona(page, rect)
            # Se valida todo ANTES de tocar nada: un error no deja un respaldo de más.
            stash_id = self._stash_document(doc) if stash else ""
            page.insert_link({"from": zona, **destino})
            self._dirty[doc_id] = True
            # `get_links()` no ve lo recién insertado hasta recargar la página.
            page = doc.reload_page(page)
            return {"stash_id": stash_id, "index": len(page.get_links()) - 1}

    def editar_enlace(self, doc_id: str, page_num: int, index: int, uri: Optional[str] = None,
                      target_page: Optional[int] = None, rect=None, stash: bool = True) -> Optional[dict]:
        """Cambia el destino (y, si se pasa, la zona). None si no existe; ValueError si no es válido."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            enlaces = page.get_links()
            if not 0 <= index < len(enlaces):
                return None
            destino = self._destino(doc, uri, target_page)
            zona = self._zona(page, rect) if rect is not None else None
            stash_id = self._stash_document(doc) if stash else ""
            enlace = enlaces[index]
            for k in ("uri", "page", "to", "zoom", "file", "name", "nameddest"):
                enlace.pop(k, None)
            enlace.update(destino)
            # La zona se reescribe SIEMPRE y en coordenadas sin girar: la que trae
            # `get_links()` es la del visor y, devuelta tal cual, corría el enlace en una
            # hoja girada aunque solo se cambiara su destino.
            enlace["from"] = zona if zona is not None else fitz.Rect(
                self._desde_vista(page, fitz.Rect(enlace["from"]))).normalize()
            page.update_link(enlace)
            page = doc.reload_page(page)
            self._dirty[doc_id] = True
            return {"stash_id": stash_id, "index": index}

    def quitar_enlace(self, doc_id: str, page_num: int, index: int, stash: bool = True) -> Optional[dict]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc or page_num < 0 or page_num >= len(doc):
                return None
            page = doc.load_page(page_num)
            enlaces = page.get_links()
            if not 0 <= index < len(enlaces):
                return None
            stash_id = self._stash_document(doc) if stash else ""
            page.delete_link(enlaces[index])
            self._dirty[doc_id] = True
            return {"stash_id": stash_id}
