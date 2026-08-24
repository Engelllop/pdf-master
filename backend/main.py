import logging
import os
import tempfile
import uvicorn
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from anyio import to_thread
from app.routers import pdf
from app.services.pdf_service import DocumentNotFoundError, PasswordRequiredError

# El main process de Electron captura stdout/stderr y lo vuelca en backend.log,
# así que basta con loguear a stderr con formato.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

log = logging.getLogger("engine")


def _breadcrumb_path() -> Path:
    """Junto a los logs que escribe Electron, para encontrarlo sin adivinar."""
    appdata = os.environ.get("APPDATA")
    base = Path(appdata) / "pdf-master" / "logs" if appdata else Path(tempfile.gettempdir())
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError:
        base = Path(tempfile.gettempdir())
    return base / "inflight.txt"


BREADCRUMB = _breadcrumb_path()


def _write_breadcrumb(text: str) -> None:
    """Un segfault de MuPDF mata el proceso sin traza y uvicorn solo loguea la
    petición AL TERMINAR, así que la que lo mata no deja ni una línea: había que
    adivinar. Aquí queda escrita ANTES de ejecutarla; al arrancar de nuevo se
    reporta y se borra. Sin fsync a propósito: el fichero lo cierra el SO aunque el
    proceso muera, y hacerlo en cada petición costaría más que el diagnóstico."""
    try:
        BREADCRUMB.write_text(text, encoding="utf-8")
    except OSError:
        pass


def _report_previous_crash() -> None:
    try:
        if not BREADCRUMB.exists():
            return
        pending = BREADCRUMB.read_text(encoding="utf-8").strip()
        if pending:
            log.error("EL MOTOR ANTERIOR MURIO mientras atendia: %s", pending)
        BREADCRUMB.unlink(missing_ok=True)
    except OSError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # PyMuPDF (MuPDF) is NOT thread-safe. FastAPI runs the `def` endpoints in a
    # threadpool, so two requests (e.g. a render and the form-field/text read for the
    # document just opened) could enter MuPDF at the same time and crash the whole
    # process with an access violation — which showed up as a blank page and an
    # "engine disconnected" collapse when opening a second PDF.
    # Pinning the threadpool to a single worker serializes every fitz access without
    # locking each method individually. The health check is `async` (it runs on the
    # event loop, not the threadpool), so it stays responsive even while a long render
    # is holding the single worker.
    to_thread.current_default_thread_limiter().total_tokens = 1
    _report_previous_crash()
    log.info("Motor listo (pid %s)", os.getpid())
    yield
    _write_breadcrumb("")


app = FastAPI(title="PDF Master Engine", version="1.14.2", lifespan=lifespan)

# Electron genera un token al spawnear el motor. Si no hay token (pytest / python
# main.py a mano) la API sigue abierta en loopback — no romper tests ni el script
# de desarrollo. Con token, cualquier otro proceso local no puede leer PDFs.
_API_TOKEN = os.environ.get("PDFMASTER_API_TOKEN", "")


@app.middleware("http")
async def require_local_token(request: Request, call_next):
    if not _API_TOKEN or request.url.path.endswith("/health"):
        return await call_next(request)
    if request.headers.get("x-pdfmaster-token") != _API_TOKEN:
        return JSONResponse(status_code=401, content={"detail": "unauthorized"})
    return await call_next(request)

# Solo el renderer de Electron: file:// manda Origin "null" en producción y
# http://localhost:<puerto> en dev (electron-vite). Antes era allow_origins=["*"].
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http://localhost:\d+|http://127\.0\.0\.1:\d+|null)$",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def track_inflight_request(request: Request, call_next):
    # El health-check corre en el event loop y se repite cada 10 s: no aporta y
    # pisaría la miga de pan de la petición que sí está tocando MuPDF.
    if request.url.path.endswith("/health"):
        return await call_next(request)
    _write_breadcrumb(f"{request.method} {request.url.path}?{request.url.query}")
    try:
        return await call_next(request)
    finally:
        _write_breadcrumb("")


@app.exception_handler(DocumentNotFoundError)
async def document_not_found_handler(request: Request, exc: DocumentNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc) or "Document not found"})


@app.exception_handler(PasswordRequiredError)
async def password_required_handler(request: Request, exc: PasswordRequiredError):
    return JSONResponse(status_code=401, content={"detail": str(exc) or "Password required"})


app.include_router(pdf.router, prefix="/pdf", tags=["pdf"])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8745, log_level="info")
