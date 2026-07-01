"""Fachada del router /pdf: agrega los routers por dominio (espejo de los mixins
del servicio). main.py lo monta con prefix="/pdf"; las rutas no cambian."""
from fastapi import APIRouter

from app.routers.pdf_routes import (
    annotations, documents, edit, export, forms, pages, read, render,
)

router = APIRouter()

for _module in (documents, render, read, pages, edit, annotations, export, forms):
    router.include_router(_module.router)
