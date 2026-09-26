"""Un PDF protegido abierto con su contraseña tiene que seguir protegido después de
guardarlo. PyMuPDF guarda SIN cifrado por defecto, así que Ctrl+S sobre un PDF con
contraseña lo dejaba en disco abierto para cualquiera. Y serializar el documento vivo
sin cifrado (PDF.js, el stash de deshacer, la copia con las marcas) le arrancaba el
cifrado al propio documento, con lo que el guardado siguiente también salía abierto."""
import fitz
import pytest

from app.services.pdf_service import pdf_service

USUARIO = "clave-usuario"
PROPIETARIO = "clave-propietario"
PERMISOS = fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY
MARCA = {"id": "m1", "type": "rect", "page": 0, "x": 40, "y": 60,
         "width": 120, "height": 50, "color": "#ef4444"}


def _protegido(path, pages=2):
    doc = fitz.open()
    for i in range(pages):
        doc.new_page().insert_text((72, 72), f"pagina {i + 1}")
    doc.save(str(path), encryption=fitz.PDF_ENCRYPT_AES_256,
             user_pw=USUARIO, owner_pw=PROPIETARIO, permissions=PERMISOS)
    doc.close()
    return str(path)


def _pide_contrasena(path):
    doc = fitz.open(path)
    try:
        return bool(doc.needs_pass)
    finally:
        doc.close()


def _cifrado(path):
    """(pide contraseña, abre con la de usuario, abre con la de propietario, método)."""
    doc = fitz.open(path)
    try:
        pide = bool(doc.needs_pass)
        usuario = doc.authenticate(USUARIO) > 0
        propietario = doc.authenticate(PROPIETARIO) > 0
        return (pide, usuario, propietario, doc.metadata.get("encryption"))
    finally:
        doc.close()


@pytest.fixture
def abrir_protegido(client, tmp_path):
    abiertos = []

    def abrir(nombre="protegido.pdf", password=USUARIO):
        path = _protegido(tmp_path / nombre)
        r = client.post("/pdf/open", json={"file_path": path, "password": password})
        assert r.status_code == 200, r.text
        abiertos.append(r.json()["doc_id"])
        return r.json()["doc_id"], path

    yield abrir
    for doc_id in abiertos:
        client.post(f"/pdf/close/{doc_id}")


CONSERVADO = (True, True, True, "Standard V5 R6 256-bit AES")


class TestGuardarConservaElCifrado:
    @pytest.mark.parametrize("con_marcas", [False, True])
    def test_guardar_encima_sigue_pidiendo_la_contrasena(self, client, abrir_protegido, con_marcas):
        doc_id, path = abrir_protegido()
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        if con_marcas:
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        # La contraseña de propietario sigue valiendo aunque el usuario abrió con la
        # suya (la app no la conoce): se conserva el cifrado, no se rehace.
        assert _cifrado(path) == CONSERVADO
        if con_marcas:
            doc = fitz.open(path)
            doc.authenticate(USUARIO)
            assert any("pdfmaster:m1" in (a.info.get("name") or "") for a in doc[0].annots())
            doc.close()

    @pytest.mark.parametrize("con_marcas", [False, True])
    def test_comprimir_sigue_pidiendo_la_contrasena(self, client, abrir_protegido, tmp_path, con_marcas):
        doc_id, _ = abrir_protegido()
        if con_marcas:
            assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        out = str(tmp_path / "comprimido.pdf")
        assert client.post(f"/pdf/compress/{doc_id}?output_path={out}").status_code == 200
        assert _cifrado(out) == CONSERVADO

    def test_los_permisos_viajan(self, client, abrir_protegido):
        doc_id, path = abrir_protegido()
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        doc = fitz.open(path)
        doc.authenticate(USUARIO)
        assert doc.permissions & fitz.PDF_PERM_PRINT
        assert not doc.permissions & fitz.PDF_PERM_MODIFY
        doc.close()

    def test_pdfjs_el_stash_y_las_marcas_no_le_quitan_el_cifrado_al_vivo(self, client, abrir_protegido):
        """Cada una de estas serializaba el vivo sin cifrado, y MuPDF se queda con eso:
        el Ctrl+S siguiente salía abierto aunque guardara con KEEP."""
        doc_id, path = abrir_protegido()
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        raw = client.get(f"/pdf/raw/{doc_id}")
        assert raw.status_code == 200
        # A PDF.js le llega en claro (no sabe la contraseña).
        assert not fitz.open(stream=raw.content, filetype="pdf").needs_pass
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.get(f"/pdf/raw/{doc_id}?marks=true").status_code == 200
        assert client.post(f"/pdf/watermark/{doc_id}", json={"text": "BORRADOR"}).status_code == 200
        assert client.post(f"/pdf/delete-pages/{doc_id}", json={"pages": [1]}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert _cifrado(path) == CONSERVADO

    def test_el_raw_de_un_protegido_sin_cambios_llega_en_claro(self, client, abrir_protegido):
        """Sin cambios se mandaba el archivo de disco, que está CIFRADO: `is_encrypted`
        es False tras autenticar y el atajo no lo detectaba."""
        doc_id, _ = abrir_protegido()
        raw = client.get(f"/pdf/raw/{doc_id}")
        assert raw.status_code == 200
        assert not fitz.open(stream=raw.content, filetype="pdf").needs_pass

    def test_deshacer_la_marca_de_agua_no_desprotege(self, client, abrir_protegido):
        doc_id, path = abrir_protegido()
        r = client.post(f"/pdf/watermark/{doc_id}", json={"text": "BORRADOR"})
        stash_id = r.json()["stash_id"]
        assert stash_id
        assert client.post(f"/pdf/restore-document/{doc_id}", json={"stash_id": stash_id}).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert _cifrado(path) == CONSERVADO

    def test_un_pdf_sin_cifrar_sigue_sin_cifrar(self, client, open_doc):
        info = open_doc(pages=1)
        client.post(f"/pdf/rotate/{info['doc_id']}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{info['doc_id']}").status_code == 200
        assert not _pide_contrasena(info["file_path"])


class TestCambiarLaContrasena:
    def test_guardar_copia_con_contrasena_no_cambia_el_original(self, client, abrir_protegido, tmp_path):
        """Escribir el vivo con otro cifrado se lo cambiaba a él: el Ctrl+S siguiente
        ponía la contraseña de la copia al original."""
        doc_id, path = abrir_protegido()
        out = str(tmp_path / "copia.pdf")
        r = client.post(f"/pdf/save-password/{doc_id}", json={"output_path": out, "user_password": "otra"})
        assert r.status_code == 200
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert _cifrado(path) == CONSERVADO

    def test_quitar_contrasena_a_una_copia_no_desprotege_el_original(self, client, abrir_protegido, tmp_path):
        doc_id, path = abrir_protegido()
        out = str(tmp_path / "abierta.pdf")
        assert client.post(f"/pdf/remove-password/{doc_id}?output_path={out}").status_code == 200
        assert not _pide_contrasena(out)
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert _cifrado(path) == CONSERVADO

    def test_contrasena_nueva_encima_sobrevive_al_desalojo(self, client, abrir_protegido):
        """El motor seguía con la contraseña vieja: tras un desalojo del LRU reabría el
        archivo sin autenticar y la siguiente petición era un 500."""
        doc_id, path = abrir_protegido()
        r = client.post(f"/pdf/save-password/{doc_id}", json={"user_password": "nueva"})
        assert r.status_code == 200
        doc = fitz.open(path)
        assert doc.needs_pass and not doc.authenticate(USUARIO) and doc.authenticate("nueva")
        doc.close()
        # Poner la contraseña encima ya suelta el vivo: se reabre del disco, como tras
        # un desalojo del LRU.
        assert doc_id not in pdf_service._docs
        assert client.get(f"/pdf/page-image/{doc_id}/0").status_code == 200
        # Y el Ctrl+S siguiente conserva la contraseña NUEVA, no la de la apertura.
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        doc = fitz.open(path)
        assert doc.needs_pass and doc.authenticate("nueva")
        doc.close()

    def test_contrasena_nueva_encima_con_marcas_no_vuelve_a_la_vieja(self, client, abrir_protegido):
        doc_id, path = abrir_protegido()
        assert client.post(f"/pdf/embed/{doc_id}", json={"annotations": [MARCA]}).status_code == 200
        assert client.post(f"/pdf/save-password/{doc_id}", json={"user_password": "nueva"}).status_code == 200
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        doc = fitz.open(path)
        assert doc.needs_pass and not doc.authenticate(USUARIO) and doc.authenticate("nueva")
        # Las marcas no se apilan por haber reabierto del disco.
        assert sum("pdfmaster:m1" in (a.info.get("name") or "") for a in doc[0].annots()) == 1
        doc.close()

    def test_quitar_contrasena_encima_sobrevive_al_desalojo(self, client, abrir_protegido):
        doc_id, path = abrir_protegido()
        assert client.post(f"/pdf/remove-password/{doc_id}").status_code == 200
        assert pdf_service._passwords[doc_id] is None
        assert doc_id not in pdf_service._docs  # se reabre del disco, ya sin cifrado
        assert client.get(f"/pdf/page-image/{doc_id}/0").status_code == 200
        client.post(f"/pdf/rotate/{doc_id}", json={"page_num": 0, "degrees": 90})
        assert client.post(f"/pdf/save/{doc_id}").status_code == 200
        assert not _pide_contrasena(path)

    def test_reabrir_sin_la_contrasena_correcta_es_401_y_no_500(self, client, abrir_protegido):
        """Si alguien cambió la contraseña del archivo por fuera, reabrirlo tras un
        desalojo devolvía un documento sin autenticar que reventaba con ValueError."""
        doc_id, _ = abrir_protegido()
        pdf_service._docs.pop(doc_id).close()
        pdf_service._passwords[doc_id] = "equivocada"
        assert client.get(f"/pdf/page-image/{doc_id}/0").status_code == 401
