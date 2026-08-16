# Registro de Cambios — Sesiones de Desarrollo

Changelog canónico en este archivo. Detalle técnico: `DOCUMENTATION.md`.

---

## Sesión 2026-08-15 — v1.14.0

Plan de mejora ejecutado sobre 1.13.1 (3 commits locales + exe sucio).

### Higiene
- Spec reescrita a 1.14.0 (la anterior estaba congelada en 1.3.1).
- Copyright del instalador → 2026.
- `publish-release.ps1` (hardcode v1.1.1) eliminado; el release lo hace CI.
- Lint en CI (no bloquea).
- Repo canónico: `C:\dev\pdf-master`.

### Producto
- Copia `.bak` **activada por defecto** (se puede apagar en Ajustes).
- Vista continua declara que es solo lectura.
- OCR: diálogo página vs documento completo; aviso si falta Tesseract.
- Formas (nube, polígono, estrella, …) visibles en la cinta Comentar. Atajo `P` = perímetro.
- Formularios: widgets radio.
- Al abrir un PDF sin sidecar se importan marcas nativas (highlight/ink/texto/…).
- Índice/TOC: botón “Añadir página actual al índice”.
- Find & replace intenta preservar fuente/tamaño/color del span.
- Embed de imagen: rotación arbitraria vía Pillow (90° sigue nativo).
- Capas de markup (`layer`, default Marcas) + filtro en Revisión.
- Comparar overlay: slider de mezcla.
- IA: presets resumir marcas / pendientes / extraer tablas.
- Aviso al borrar página: Ctrl+Z no deshace páginas.

### Confianza
- Token `PDFMASTER_API_TOKEN` entre Electron y el motor (pytest sin token sigue igual).
- Open exige `.pdf` y tope `MAX_FILE_SIZE_MB`.
- `file:readBase64` solo imágenes.
- `recoverImage` ignora `blob:` y reconoce `/pdf/raw/` (el visor usa pdfjs).

### Tests
- Open no-pdf / missing → 422.
- Import de highlight nativo.
- Outline roundtrip.
- Radio en FormFieldsLayer.
- backupOnSave default on.

**No entra en 1.14 (infra / certificado / nativo):** firma de código, PAdES, OneDrive, escáner, i18n, E2E Playwright, undo real de páginas.

---

## Sesión 2026-06-10 — v1.3.0 / v1.3.1

### v1.3.1 — Autoguardado eliminado
La app nunca escribe a disco sin acción del usuario. Alertas al cerrar pestaña/app.

### v1.3.0 — Estabilidad y trazo
Instancia única estricta, auto-reparación de doc_id, grosor/estilo/opacidad en puntos PDF.
