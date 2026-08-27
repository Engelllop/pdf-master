# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Quien trabaja con PDFs profesionales en el escritorio (contratos, actas, informes, planos). Los planos de obra son un caso de uso, no el centro del producto.

## Product Purpose

Editor de PDFs para Windows que deja marcar, medir, comparar y reorganizar documentos locales. Existe para que el archivo en disco no cambie hasta que el usuario lo pida.

Éxito: el usuario termina el trabajo sobre el PDF y el original entregado sigue intacto hasta un Guardar explícito.

## Positioning

Abierto. No hay un claim cerrado frente a Acrobat, Bluebeam u otros visores. Capacidades actuales (medir, contar, comparar revisiones, editor local sin nube) son hechos de implementación, no posicionamiento aprobado.

## Operating Context

App de escritorio Windows (Electron + motor local). Se abre un archivo del disco, se trabaja en pestañas, se guarda con Ctrl+S. No hay cuenta, nube ni colaboración remota.

Un plano o PDF ya entregado puede seguir abierto para consultar o marcar en pantalla; escribir esas marcas al archivo sin pedirlo es un error grave.

## Capabilities and Constraints

Confirmado por el usuario:

- **Nunca autoguardar.** La app no escribe a disco sin acción explícita. Guardar una anotación en un plano o PDF entregado puede ser fatal. Innegociable.
- El resto de la interfaz, la voz y el chrome son cambiables si mejoran la app.

Hechos actuales del repo (no son principios de producto salvo el guardado):

- Motor local FastAPI + PyMuPDF, un worker (PyMuPDF no es thread-safe).
- Sidecar `.pdfmaster.json`: solo lectura, como respaldo de archivos de versiones viejas; las marcas viajan dentro del PDF. Copia `.bak` opt-in (default on).
- Aviso al cerrar pestaña o la app si hay cambios sucios.
- Marcas, mediciones, conteos, comparación de revisiones, formularios, organización de páginas, export.

Abierto:

- Posicionamiento frente a Acrobat / Bluebeam / visores genéricos.
- Si el producto se publica para terceros o sigue siendo de uso propio.

## Brand Commitments

Nombre: **PDF Master**. No hay marca, logo o voz declarados como inamovibles. El rioplatense y el chrome neutro son práctica actual, no un compromiso.

## Evidence on Hand

- Spec de implementación: `DOCUMENTATION.md`, `README.md`.
- No hay testimonios, casos de clientes, prensa ni benchmarks. No inventarlos.

## Product Principles

1. El archivo en disco no cambia hasta que el usuario guarda.
2. Un PDF entregado puede estar abierto; marcar en pantalla no es entregar.
3. El producto sirve PDFs profesionales en general; no se diseña solo para planos.
4. El posicionamiento frente a otras apps queda abierto hasta que se decida.
