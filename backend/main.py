import logging
import uvicorn
from contextlib import asynccontextmanager
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
    yield


app = FastAPI(title="PDF Master Engine", version="1.0.0", lifespan=lifespan)

# Solo el renderer de Electron: file:// manda Origin "null" en producción y
# http://localhost:<puerto> en dev (electron-vite). Antes era allow_origins=["*"].
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http://localhost:\d+|http://127\.0\.0\.1:\d+|null)$",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(DocumentNotFoundError)
async def document_not_found_handler(request: Request, exc: DocumentNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc) or "Document not found"})


@app.exception_handler(PasswordRequiredError)
async def password_required_handler(request: Request, exc: PasswordRequiredError):
    return JSONResponse(status_code=401, content={"detail": str(exc) or "Password required"})


app.include_router(pdf.router, prefix="/pdf", tags=["pdf"])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8745, log_level="info")
