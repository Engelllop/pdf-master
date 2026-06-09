import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from anyio import to_thread
from app.routers import pdf


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf.router, prefix="/pdf", tags=["pdf"])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8745, log_level="info")
