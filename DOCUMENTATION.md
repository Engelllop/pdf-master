# PDF Master — Documentación técnica

> Versión: **1.14.0** · Actualizado: 2026-08-15  
> Changelog de sesión: `CHANGELOG_SESSION.md`  
> Repo canónico: `C:\dev\pdf-master` (`C:\Users\Engelllop\pdf-master` es junction).

---

## 1. Qué es

Editor de PDFs para Windows (Electron + React + FastAPI + PyMuPDF), pensado para planos de obra. Inspirado en Bluebeam Revu / Acrobat, no es un visor genérico.

**Regla de producto:** la app **nunca** escribe a disco sin acción explícita del usuario. No hay autoguardado. El sidecar `.pdfmaster.json` solo se escribe al guardar. Hay aviso al cerrar pestaña o la app. Copia `.bak` opt-in (default **on**).

---

## 2. Stack

| Capa | Tecnología |
|------|------------|
| Shell | Electron 43, electron-vite 5, electron-builder 26 |
| UI | React 19, TypeScript 5.6, Tailwind 3.4, Zustand 5 |
| Render cliente | pdfjs-dist 6 (página / continua / comparar / tiles) |
| Motor | Python 3.13 (CI), FastAPI, PyMuPDF 1.28, Pillow |
| Export | python-docx, openpyxl (`find_tables`), python-pptx, pytesseract |
| Tests | Vitest (frontend), pytest (backend) |

---

## 3. Arquitectura

```
Electron main  →  spawnea pdf-engine.exe (o python main.py)
       │              token PDFMASTER_API_TOKEN
Renderer       →  HTTP 127.0.0.1:8745  (header X-Pdfmaster-Token)
                      FastAPI 1 worker  (PyMuPDF no es thread-safe)
```

- **1 worker** en el threadpool. No subir. El health-check es `async`.
- LRU: máx. 12 documentos vivos; no se evictan docs dirty.
- Caps de render: 3000 / 6000 px. Miniaturas 300 px.
- Instancia única: la perdedora hace `app.exit(0)` inmediato.
- `doc_id` muerto (404) → `reopenDeadDoc` + remap conservando marcas.

**Sandbox Electron:** `sandbox: false` porque el renderer habla HTTP al motor local y usa `webUtils.getPathForFile`. No activar sin revalidar open/print/AI.

---

## 4. Features (estado 1.14)

### Visor
Vista simple / doble, continua (**solo lectura**), lectura, presentación, comparar lado a lado + overlay con mezcla, zoom fit, tiles de zoom profundo, paleta Ctrl+K, cinta por modos.

### Páginas
Reordenar, rotar, borrar, duplicar, insertar en blanco, recortar, extraer, combinar, comprimir, numerar/Bates, organizador. **Ctrl+Z no deshace operaciones de página.**

### Marcas
Highlight, underline, strike, nota, dibujo, texto, rect/círculo/línea/flecha/llamada, check/cruz/estrella/nube/polígono, sello, firma gráfica, imagen (resize/rotar/embed), conteo con categorías, mediciones (distancia/perímetro/área + snap + calibración). Trazo en puntos PDF. Revisión con autor/estado/replies. Capas (`layer`, default `Marcas`). XFDF. Al abrir un PDF **sin sidecar** se importan anotaciones nativas (Acrobat/Bluebeam).

### Formularios
Rellenar text, checkbox, combo **y radio**. No se crean campos nuevos ni firmas PKCS.

### Edición de contenido
Editar texto/imagen existentes, find & replace (intenta preservar fuente/tamaño/color), watermark, header/footer, redactar área o por coincidencia, metadatos, índice/TOC editable.

### OCR
Requiere Tesseract en PATH. Página actual o documento completo. `GET /pdf/ocr-available`.

### Export
Word, Excel (tablas con `find_tables`, si no hay tabla → líneas), PPT, TXT, HTML, página PNG, mediciones/conteos, resumen de marcas.

### IA
Anthropic vía main process (`safeStorage`). Presets: resumir marcas, pendientes, extraer tablas.

### Seguridad local
- Token Electron→motor cuando la app spawnea el backend. pytest / `python main.py` sin token siguen abiertos (loopback).
- Open exige `.pdf` y respeta `MAX_FILE_SIZE_MB` (500).
- `file:readBase64` solo imágenes.
- Firmas = polyline, no PAdES. Sin firma de código (SmartScreen).

---

## 5. API (`/pdf`)

Documentos: `open`, `create-blank`, `save`, `save-password`, `remove-password`, `close`, `dirty`, `info`, `merge`, `split`, `compress`, `images-to-pdf`, `health`  
Render: `page`, `page-image`, `raw`, `tile` (el visor usa pdfjs; `/tile` queda por si un cliente lo pide), `thumbnail`  
Páginas: `rotate`, `rotate-all`, `rotate-pages`, `delete-pages`, `reorder`, `crop`, `duplicate-page`, `insert-blank`  
Edición: `insert-image`, `transform-image`, `edit-text`, `replace-text`, `watermark`, `header-footer`, `redact`, `redact-matches`, `metadata`, `page-numbers`  
Marcas: `annotations` GET/POST, `embed`, `export-xfdf`, `import-xfdf`, `markup-summary`  
Lectura: `outline` GET/POST, `search`, `text`, `text-clip`, `spans`, `snap-points`, `compare-text`, `ocr`, `ocr-available`, `make-searchable`  
Formularios: `widgets` GET/POST  
Export: `export-word`, `export-excel`, `export-pptx`, `export-txt`, `export-html`, `export-measurements`

---

## 6. Contratos que no se tocan

1. No reintroducir autoguardado.
2. No subir el threadpool de PyMuPDF.
3. No evictar docs dirty del LRU.
4. Sidecar solo en guardado manual.
5. Tras tocar Python: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q`

---

## 7. Build

```powershell
cd backend
.\venv\Scripts\pyinstaller.exe pdf-engine.spec --noconfirm --clean
Copy-Item dist\pdf-engine.exe ..\frontend\resources\backend\ -Force
cd ..\frontend
# bump version en package.json
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win    # → dist\PDF-Master-Setup-<version>.exe
```

CI (`.github/workflows/ci.yml`): pytest + typecheck + vitest; tag `v*` publica release. Sin Authenticode.

Puerto de desarrollo del motor instalado vs. repo: **8746** si 8745 está ocupado.

---

## 8. Limitaciones vigentes

| Tema | Estado |
|------|--------|
| OCR | Tesseract externo; no va en el instalador |
| Escáner | No implementado (WIA) |
| Firmas digitales | Solo dibujo |
| Vista continua | Solo lectura |
| Undo | Solo marcas, no páginas |
| OneDrive / colaboración | No |
| i18n | Español hardcodeado |
| macOS/Linux | Scripts existen; CI es Windows |
| Code signing | No (SmartScreen) |
| Mediciones | Visuales + export; embed parcial |
| XFDF | Sin imágenes |

---

## 9. Fuera de alcance (caro / infra externa)

Firmas PAdES/.pfx, escáner WIA, sync OneDrive/SharePoint, colaboración en tiempo real, i18n completo, Authenticode. El plan vivo está en el canvas de la sesión 2026-08-15.
