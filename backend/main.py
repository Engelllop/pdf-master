import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import pdf

app = FastAPI(title="PDF Master Engine", version="1.0.0")

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
