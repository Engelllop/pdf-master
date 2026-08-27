import fitz  # PyMuPDF
import base64
import logging
import math
import uuid
import json
import os
import shutil
import tempfile
from typing import Callable, Dict, NamedTuple, Optional, List
from collections import OrderedDict
from app.models.pdf import PdfInfo, PageRender, PdfOutlineItem, PageSize, Annotation
from app.core.config import settings
from app.services._pdf_base import PasswordRequiredError, DocumentNotFoundError

logger = logging.getLogger("pdfmaster")


class ResultadoGuardado(NamedTuple):
    path: str
    # False solo si el usuario pidió copia .bak y no se pudo crear. Antes se registraba
    # en el log y se sobrescribía el original igual: el usuario creía tener red.
    backup_ok: bool


class DocumentsMixin:
    def _guardar_atomico(self, save_path: str, backup: bool, escribir: Callable[[str], None]) -> ResultadoGuardado:
        """Escribe con `escribir(temp)` en un temporal AL LADO del destino y lo mueve
        encima: el archivo del usuario nunca queda a medio escribir. Lo usan todas las
        escrituras a disco del motor, PDF y exportaciones.

        Estaba copiado tres veces (save, save_with_password, remove_password) y las dos
        últimas se habían quedado atrás: no hacían copia .bak nunca —aunque el ajuste
        estuviera activado— y si el guardado fallaba dejaban el temporal tirado en la
        carpeta del plano, con el contenido del documento dentro."""
        copia_ok = True
        if backup and os.path.exists(save_path):
            try:
                shutil.copy2(save_path, save_path + '.bak')
            except Exception:
                copia_ok = False
                logger.exception("No se pudo crear la copia .bak de %s", save_path)
        dir_name = os.path.dirname(os.path.abspath(save_path))
        # El temporal lleva la extensión del destino: openpyxl y python-pptx eligen el
        # formato por el nombre del archivo que reciben.
        sufijo = os.path.splitext(save_path)[1] or '.tmp'
        fd, temp_path = tempfile.mkstemp(suffix=sufijo, dir=dir_name)
        os.close(fd)
        try:
            escribir(temp_path)
            # os.replace sirve exista o no el destino (también en Windows), así que no
            # hace falta el os.rename del else que tenían las otras dos.
            os.replace(temp_path, save_path)
        except Exception:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception:
                pass
            raise
        return ResultadoGuardado(save_path, copia_ok)

    def open_document(self, file_path: str, password: Optional[str] = None) -> PdfInfo:
        doc = self._open_stream(file_path)
        if doc.needs_pass:
            if not password:
                doc.close()
                raise PasswordRequiredError("Document requires a password")
            auth_result = doc.authenticate(password)
            if not auth_result:
                doc.close()
                raise PasswordRequiredError("Incorrect password")
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
            page_sizes=page_sizes,
            unmanaged_annots=self.contar_no_gestionadas(doc),
        )

        with self._lock:
            self._docs[doc_id] = doc
            self._infos[doc_id] = info
            self._dirty[doc_id] = False
            self._passwords[doc_id] = password
            self._lru[doc_id] = None
            self._evict_inactive()
        return info

    def get_document(self, doc_id: str) -> Optional[fitz.Document]:
        return self._acquire(doc_id)

    def get_info(self, doc_id: str) -> Optional[PdfInfo]:
        return self._infos.get(doc_id)

    def create_blank_pdf(self, output_path: str, page_width: float = 595, page_height: float = 842, page_count: int = 1) -> Optional[PdfInfo]:
        doc = fitz.open()
        try:
            for _ in range(page_count):
                doc.new_page(width=page_width, height=page_height)
            self._guardar_atomico(output_path, False, lambda temp: doc.save(temp))
        finally:
            doc.close()
        return self.open_document(output_path)

    def disk_state(self, doc_id: str) -> Optional[dict]:
        """Estado del archivo EN DISCO: fecha de modificación y tamaño.

        El cliente lo guarda al abrir y lo vuelve a pedir antes de guardar: si alguien
        más tocó el archivo mientras estaba abierto (otro programa, o un cliente de
        sincronización como Drive/OneDrive), guardar encima se llevaba esos cambios sin
        decir nada. `missing` cubre el archivo movido o borrado."""
        info = self._infos.get(doc_id)
        if not info:
            return None
        try:
            st = os.stat(info.file_path)
            return {"mtime": st.st_mtime, "size": st.st_size, "missing": False}
        except OSError:
            return {"mtime": 0.0, "size": 0, "missing": True}

    def _copia_con_marcas(self, doc_id: str, doc):
        """Copia del documento con las marcas pendientes dibujadas, o None si no hay cola
        (y entonces se escribe el documento vivo tal cual).

        Sobre una COPIA a propósito: el documento vivo se queda limpio, así escribir dos
        veces no apila las marcas. Lo usan TODAS las escrituras de un PDF completo
        —guardar, guardar con contraseña, comprimir y quitar la contraseña— y las dos
        últimas se habían quedado fuera: comprimir un plano marcado escribía el archivo
        SIN las marcas y sin avisar, y comprimiendo encima del propio original el archivo
        en disco perdía lo que el usuario acababa de marcar.

        `is not None` y no `if pending`: una lista VACÍA significa «el usuario borró
        todas las marcas», y hay que pasar por el embed igual para que se quiten del
        archivo las que había. Con `if pending` las marcas importadas de otro programa
        no se podían borrar: seguían en el PDF."""
        pending = self._pending_annotations.get(doc_id)
        if pending is None:
            return None
        marked = fitz.open(stream=doc.tobytes(), filetype="pdf")
        self._embed_into(marked, pending)
        return marked

    def compress(self, doc_id: str, output_path: str) -> Optional[dict]:
        """None = falló. Devuelve los tamaños para poder decir cuánto se ahorró."""
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            marked = None
            try:
                try:
                    size_before = os.path.getsize(self._doc_path(doc_id))
                except OSError:
                    size_before = 0
                # Comprimir es escribir el documento del usuario: lleva sus marcas
                # pendientes como cualquier otro guardado.
                marked = self._copia_con_marcas(doc_id, doc)
                to_save = doc if marked is None else marked
                # Atómico: el cuadro de guardar deja elegir un PDF que ya existe (el
                # propio original, incluso), y un fallo a mitad de escritura lo dejaba
                # truncado. Ahora o está el viejo o está el nuevo.
                self._guardar_atomico(
                    output_path, False,
                    lambda temp: to_save.save(temp, garbage=4, deflate=True, clean=True),
                )
                return {"size_before": size_before, "size_after": os.path.getsize(output_path)}
            except Exception:
                logger.exception("compress falló (doc %s → %s)", doc_id, output_path)
                return None
            finally:
                if marked is not None:
                    marked.close()

    def save(self, doc_id: str, output_path: Optional[str] = None, backup: bool = False) -> Optional[ResultadoGuardado]:
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            save_path = output_path or self._doc_path(doc_id)
            if not save_path:
                return None
            marked = None
            try:
                marked = self._copia_con_marcas(doc_id, doc)
                to_save = doc if marked is None else marked
                # El doc se abrió por stream: el motor no tiene el archivo abierto, así
                # que os.replace sobre el original funciona sin cerrar/reabrir el handle.
                resultado = self._guardar_atomico(
                    save_path, backup,
                    lambda temp: to_save.save(temp, garbage=4, deflate=True),
                )
                # Guardar una copia (output_path) no limpia el original: sigue sucio.
                if not output_path:
                    self._dirty[doc_id] = False
                return resultado
            except Exception:
                logger.exception("save falló (doc %s → %s)", doc_id, save_path)
                return None
            finally:
                if marked is not None:
                    marked.close()

    def save_with_password(self, doc_id: str, output_path: Optional[str] = None, user_password: Optional[str] = None, owner_password: Optional[str] = None, backup: bool = False) -> Optional[ResultadoGuardado]:
        # Con lock, como save(): abre un segundo documento y llama a _embed_into.
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            save_path = output_path or self._doc_path(doc_id)
            if not save_path:
                return None
            marked = None
            try:
                # Igual que en save(): el PDF protegido también lleva las marcas.
                marked = self._copia_con_marcas(doc_id, doc)
                to_save = doc if marked is None else marked

                def escribir(temp: str) -> None:
                    if user_password or owner_password:
                        to_save.save(temp, garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_AES_256,
                                     user_pw=user_password or '', owner_pw=owner_password or user_password or '')
                    else:
                        to_save.save(temp, garbage=4, deflate=True)

                resultado = self._guardar_atomico(save_path, backup, escribir)
                if not output_path:
                    self._dirty[doc_id] = False
                return resultado
            except DocumentNotFoundError:
                raise
            except Exception:
                logger.exception("save_with_password falló (doc %s)", doc_id)
                return None
            finally:
                if marked is not None:
                    marked.close()

    def remove_password(self, doc_id: str, output_path: Optional[str] = None, backup: bool = False) -> Optional[ResultadoGuardado]:
        # El doc en memoria ya está desencriptado (apertura por stream); guardarlo sin
        # cifrado produce un PDF sin contraseña.
        with self._lock:
            doc = self._acquire(doc_id)
            if not doc:
                return None
            save_path = output_path or self._doc_path(doc_id)
            if not save_path:
                return None
            marked = None
            try:
                # También lleva las marcas: quitarle la contraseña a un plano marcado
                # escribía el archivo sin ellas.
                marked = self._copia_con_marcas(doc_id, doc)
                to_save = doc if marked is None else marked
                resultado = self._guardar_atomico(
                    save_path, backup,
                    lambda temp: to_save.save(temp, garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_NONE),
                )
                # Solo si escribió ENCIMA del original: con output_path es una copia y el
                # original sigue sucio (como en save()). Limpiarlo igual apagaba el aviso
                # de «sin guardar» de un archivo que nadie había guardado.
                if not output_path:
                    self._dirty[doc_id] = False
                return resultado
            except DocumentNotFoundError:
                raise
            except Exception:
                logger.exception("remove_password falló (doc %s)", doc_id)
                return None
            finally:
                if marked is not None:
                    marked.close()

    def images_to_pdf(self, image_paths: List[str], output_path: str) -> bool:
        out = None
        try:
            out = fitz.open()
            for img_path in image_paths:
                img = fitz.open(img_path)
                rect = img[0].rect
                pdfbytes = img.convert_to_pdf()
                img.close()
                imgpdf = fitz.open("pdf", pdfbytes)
                page = out.new_page(width=rect.width, height=rect.height)
                page.show_pdf_page(rect, imgpdf, 0)
                imgpdf.close()
            self._guardar_atomico(output_path, False, lambda temp: out.save(temp))
            return True
        except Exception:
            logger.exception("images_to_pdf falló")
            return False
        finally:
            # Sin esto, cada conversión fallida dejaba el fitz.Document abierto.
            if out is not None:
                out.close()

    def compare_text(self, doc_id_a: str, doc_id_b: str) -> Optional[dict]:
        import difflib
        with self._lock:
            a = self._acquire(doc_id_a)
            b = self._acquire(doc_id_b)
            if not a or not b:
                return None
            text_a = [a.load_page(i).get_text() for i in range(len(a))]
            text_b = [b.load_page(i).get_text() for i in range(len(b))]
        diffs = []
        for i in range(max(len(text_a), len(text_b))):
            ta = text_a[i] if i < len(text_a) else ""
            tb = text_b[i] if i < len(text_b) else ""
            if ta == tb:
                continue
            sm = difflib.SequenceMatcher(None, ta.split(), tb.split())
            added, removed = [], []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag in ("replace", "delete"):
                    removed.extend(ta.split()[i1:i2])
                if tag in ("replace", "insert"):
                    added.extend(tb.split()[j1:j2])
            diffs.append({
                "page": i,
                "added": " ".join(added)[:400],
                "removed": " ".join(removed)[:400],
            })
        return {"pages_with_changes": len(diffs), "diffs": diffs}

    def close_document(self, doc_id: str) -> bool:
        with self._lock:
            existed = doc_id in self._infos
            doc = self._docs.pop(doc_id, None)
            if doc:
                doc.close()
            self._infos.pop(doc_id, None)
            self._dirty.pop(doc_id, None)
            self._passwords.pop(doc_id, None)
            self._pending_annotations.pop(doc_id, None)
            self._lru.pop(doc_id, None)
            return existed
