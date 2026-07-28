# PDF Master — Documentación Técnica

> Versión documentada: **1.3.1**  
> Última actualización: 2026-06-10  
> Las secciones 1–10 describen la base (1.1.1). Los cambios de 1.2.x–1.3.1 están en el **Addendum (sección 11)**, que **prevalece** donde contradiga lo anterior. El changelog canónico por sesión vive en el vault Obsidian (`Documents\Memory\projects\pdf-master.md`).

---

## 1. Visión General

**PDF Master** es un editor profesional de PDFs para Windows construido sobre Electron + React en el frontend y Python + FastAPI + PyMuPDF en el backend. Diseñado para ofrecer una experiencia de edición fluida con renderizado en tiempo real, anotaciones enriquecidas, manipulación de páginas y exportación a múltiples formatos.

---

## 2. Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Electron | 33.4.11 | Shell de escritorio, spawn del backend |
| Vite | 5.4.x | Bundler y dev server |
| React | 18.3.x | UI declarativa |
| TypeScript | 5.6.x | Tipado estático |
| Tailwind CSS | 3.4.x | Estilos utilitarios |
| Zustand | 5.0.x | Estado global |
| Lucide React | 0.460.x | Iconografía |

### Backend
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Python | 3.14.3 | Runtime del motor PDF |
| FastAPI | — | API REST |
| PyMuPDF (fitz) | — | Renderizado, edición y manipulación de PDFs |
| Uvicorn | — | Servidor ASGI |
| python-docx | — | Exportación a Word |
| openpyxl | — | Exportación a Excel |
| python-pptx | — | Exportación a PowerPoint |
| pytesseract | — | OCR (requiere Tesseract OCR binario) |

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                   │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐  │
│  │   Window    │   │   Preload   │   │  Backend Spawner │  │
│  │  (Browser)  │   │   (IPC)     │   │  (pdf-engine.exe)│  │
│  └──────┬──────┘   └──────┬──────┘   └────────┬─────────┘  │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │                                 │
│                    file:// + http://localhost:8745          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                  Electron Renderer Process                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React 18 + Zustand + Tailwind + Lucide              │  │
│  │  Components: Toolbar │ Viewer │ Thumbnails │ Tools   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP / REST
┌───────────────────────────┴─────────────────────────────────┐
│                    Python Backend (FastAPI)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  pdf_service.py  ──  PyMuPDF engine (fitz)           │  │
│  │  pdf.py          ──  FastAPI routers                 │  │
│  │  config.py       ──  Settings (DEBUG=False prod)     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Protocolo de comunicación
- **Frontend → Backend**: HTTP REST sobre `localhost:8745`.
- **Frontend → OS**: IPC Electron vía `window.api` (preload) para diálogos nativos.
- **Imágenes**: Base64 JSON (no raw PNG blobs) debido a restricciones del protocolo `file://` en producción.

---

## 4. Features Implementadas

### 4.1 Visor y Navegación
| Feature | Descripción Técnica |
|---------|---------------------|
| Vista simple / doble | `viewMode: 'single' \| 'double'` en store. Renderizado condicional de 1 o 2 `<img>` + `<svg>` layers. |
| Zoom | Valor por documento `zoom` (0.1–8.0). Escala visual = `zoom / BASE_RENDER_ZOOM` (1.5). Zoom-to-pointer con Ctrl+Wheel. |
| Ajuste al ancho / página | `computeFitZoom()` calcula escala óptima según `viewerWidth`/`viewerHeight` y `page_sizes`. |
| Navegación con historial | `navHistory: number[]` con índice para back/forward por documento. |
| Modo lectura | Oculta UI (toolbar, panels) vía clase CSS. Escape para salir. |
| Minimap en thumbnails | `viewerScroll` tracking con `onScroll` en container. Rectángulo de porcentaje sobre thumbnail actual. |

### 4.2 Manipulación de Páginas
| Feature | Backend | Frontend |
|---------|---------|----------|
| Reordenar (DnD) | `doc.select(new_order)` (PyMuPDF) | HTML5 drag-and-drop en thumbnails. Re-mapeo de anotaciones y `page_sizes` en store. |
| Rotar página actual | `rotate_page(page_num, degrees)` | Botones CW/CCW en Toolbar. |
| Rotar todo | `rotate_all_pages(degrees)` | Botones `RefreshCw` en Toolbar. |
| Rotar selección múltiple | `rotate_pages(pages[], degrees)` | Multi-selección + barra flotante. |
| Eliminar página | `delete_pages(pages[])` — orden inverso para preservar índices | Botón Trash en Toolbar o multi-selección. |
| Recortar (Crop) | `page.set_cropbox(new_rect)` | Prompt para márgenes top/right/bottom/left. |
| Extraer (Split) | `split_pages(pages[], output_path?)` | Guarda directamente a ruta elegida por usuario. |
| Combinar | `doc.insert_pdf(source)` | Diálogo de archivo para seleccionar PDF fuente. |
| Comprimir | `doc.save(..., garbage=4, deflate=True, clean=True)` | Guarda `_compressed.pdf`. |

### 4.3 Anotaciones (SVG Overlays)
Todas las anotaciones se renderizan como elementos SVG sobre un `<img>` de la página. Las coordenadas se normalizan a espacio PDF original y se escalan al tamaño de pantalla.

| Tipo | Renderizado SVG | Embebido en PDF |
|------|-----------------|-----------------|
| highlight | `<rect>` con `fillOpacity` | `page.add_highlight_annot(rect)` |
| underline | `<line>` | `page.add_underline_annot(rect)` |
| strikethrough | `<line>` | `page.add_strikeout_annot(rect)` |
| note | `<rect>` + popup `<div>` | `page.add_text_annot(point, text)` |
| draw | `<path>` con `polyline` | `page.draw_polyline(pts, color, width)` |
| signature | `<path>` (stroke negro, width=3) | `page.draw_polyline(pts, color=(0,0,0), width=3)` |
| text | `<foreignObject>` con `<div>` | `page.insert_text(point, text, fontsize, color)` |
| rect | `<rect>` con stroke | `page.draw_rect(rect, color, width)` |
| circle | `<ellipse>` | `page.draw_oval(rect, color, width)` |
| arrow | `<line>` + `<polygon>` (cabeza) | `draw_line` + `draw_polygon` para cabeza |
| measure_distance | `<line>` + `<text>` | No embebido (anotación visual) |
| measure_area | `<path>` (polígono) + `<text>` | No embebido (anotación visual) |

### 4.4 Inserción de Contenido
| Feature | Backend | Frontend |
|---------|---------|----------|
| Texto | Anotación `text` embebida al guardar | Tool `text` + editor in-situ (TextBoxEditor). |
| Imagen | `/insert-image/{doc_id}` | Tool `image` + `window.api.openFile(filters)`. Posición por click. |
| Sello (Stamp) | Anotación `text` en cursiva+negrita | Tool `stamp` + fantasma al cursor, vista previa y tamaño (`stampSize`). |
| Watermark | `add_watermark(text, color, fontsize, angle, opacity, tiled)` | Mosaico al tresbolillo en todas las páginas (tope 400/pág.); `tiled=False` = línea única centrada. |
| Header/Footer | `add_header_footer(header?, footer?, fontsize, color)` | Prompt para header y footer. Centrado horizontalmente. |
| **Find & Replace** | `replace_text(query, replace, page_num?, case_sensitive?, replace_all?)` | Busca con `search_for`, redacta e inserta nuevo texto. UI expandible en Toolbar con opciones "Todo el doc" y "Distinguir mayúsculas". |
| **Editar metadatos** | `set_metadata(title?, author?, subject?, keywords?)` | Diálogo de prompts para título, autor, asunto y palabras clave. |
| **Guardar página como imagen** | Reusa `/page-image/{doc_id}/{page}?zoom=2.0` | Descarga la página actual como PNG de alta resolución vía blob URL. |

### 4.5 Búsqueda y OCR
| Feature | Backend | Frontend |
|---------|---------|----------|
| Búsqueda de texto | `page.search_for(query)` retorna `Rect[]` mapeados a `{page,x,y,w,h}` | Input en Toolbar. Navegación prev/next. **Todos los resultados** se pintan en SVG; el activo es naranja con animación CSS. Scroll automático al resultado. |
| OCR | `pytesseract.image_to_string(pil_image, lang='spa+eng')` | Renderiza página a 300 DPI, convierte a PIL, ejecuta Tesseract. Alert con texto extraído. |

### 4.6 Exportación
| Formato | Backend | Detalle |
|---------|---------|---------|
| Word (.docx) | `python-docx` | Extrae texto plano página por página. |
| Excel (.xlsx) | `openpyxl` | Una hoja por página; cada línea de texto en una fila. |
| PowerPoint (.pptx) | `python-pptx` | Cada página renderizada a PNG (150 DPI) como slide full-bleed. |

### 4.7 Seguridad y metadatos
| Feature | Implementación |
|---------|----------------|
| Protección por contraseña | `doc.needs_pass` + `doc.authenticate()`. HTTP 401 si falla. |
| Guardar con contraseña | `doc.save(..., encryption=...)` con `user_password` y `owner_password`. |
| Redacción | `page.add_redact_annot(rect)` + `page.apply_redactions()` — eliminación **permanente**. |
| Validación de rutas | `_is_safe_path()` previene directory traversal en save/split/compress/export. |
| Editar metadatos | `doc.set_metadata()` para título, autor, asunto, keywords. |

---

## 5. API Endpoints (Backend)

### Documentos
```
POST   /pdf/open                    → PdfInfo
POST   /pdf/create-blank            → PdfInfo
POST   /pdf/save/{doc_id}           → SaveResult
POST   /pdf/save-password/{doc_id}  → SaveResult
POST   /pdf/close/{doc_id}          → {status: "closed"}
GET    /pdf/dirty/{doc_id}          → DirtyStatus
```

### Renderizado
```
GET    /pdf/page/{doc_id}/{page}?zoom={z}        → PageRender (base64 JSON)
GET    /pdf/thumbnail/{doc_id}/{page}            → ThumbnailRender
GET    /pdf/page-info/{doc_id}/{page}?zoom={z}   → metadata
GET    /pdf/page-image/{doc_id}/{page}?zoom={z}  → Response(image/png) — no usado en prod
```

### Manipulación de Páginas
```
POST   /pdf/rotate/{doc_id}         → RotateRequest {page_num, degrees}
POST   /pdf/rotate-all/{doc_id}     → RotateRequest {degrees}
POST   /pdf/rotate-pages/{doc_id}   → RotatePagesRequest {pages[], degrees}
POST   /pdf/delete-pages/{doc_id}   → DeletePagesRequest {pages[]}
POST   /pdf/reorder/{doc_id}        → ReorderPagesRequest {new_order[]}
POST   /pdf/merge/{doc_id}          → MergeRequest {source_path}
POST   /pdf/split/{doc_id}          → SplitRequest {pages[]} + ?output_path=
POST   /pdf/compress/{doc_id}       → ?output_path=
POST   /pdf/crop/{doc_id}           → CropRequest {page_num, top, right, bottom, left}
```

### Edición de Contenido
```
POST   /pdf/insert-image/{doc_id}   → InsertImageRequest
POST   /pdf/watermark/{doc_id}      → WatermarkRequest
POST   /pdf/header-footer/{doc_id}  → HeaderFooterRequest
POST   /pdf/redact/{doc_id}         → RedactRequest
```

### Anotaciones y Metadatos
```
GET    /pdf/annotations/{doc_id}    → AnnotationList
POST   /pdf/annotations/{doc_id}    → AnnotationList
POST   /pdf/embed/{doc_id}          → AnnotationList (embebe en PDF nativo)
GET    /pdf/outline/{doc_id}        → PdfOutlineItem[]
GET    /pdf/search/{doc_id}?query=&limit=  → SearchResult[]
GET    /pdf/text/{doc_id}/{page}    → {text}
POST   /pdf/text-clip/{doc_id}/{page} → TextClipRequest
```

### Formularios
```
GET    /pdf/widgets/{doc_id}/{page} → FormField[]
POST   /pdf/widgets/{doc_id}/{page} → FormFieldUpdate
```

### Exportación y OCR
```
GET    /pdf/export-word/{doc_id}    → {filename, data_base64}
POST   /pdf/export-excel/{doc_id}   → ?output_path= → SaveResult
POST   /pdf/export-pptx/{doc_id}    → ?output_path= → SaveResult
GET    /pdf/ocr/{doc_id}/{page}     → OcrResult {text}
```

### Utilidades
```
GET    /pdf/health                  → {status: "ok"}
```

---

## 6. Estado Global (Zustand Store)

```typescript
interface PdfState {
  docs: PdfDoc[]
  activeDocId: string | null
  sidebarOpen: boolean
  toolsPanelOpen: boolean
  viewerWidth: number
  viewerHeight: number
  activeTool: string | null
  annotationColor: string
  viewMode: 'single' | 'double'
  theme: 'dark' | 'light'
  readingMode: boolean
  textFontFamily: string
  textFontSize: number
  selectedImagePath: string | null
  selectedStamp: string
  stampColor: string
  viewerScroll: ViewerScroll
  bookmarks: Bookmark[]
  compareMode: boolean
  compareDocId: string | null
  // ... y ~40 actions
}
```

**Convención importante**: `pageCache` y `thumbnails` se invalidan (se vacían) en operaciones de escritura para forzar re-fetch desde el backend. `docVersion` se incrementa para invalidar caches de React hooks.

---

## 7. Decisiones Técnicas Clave

### 7.1 Base64 JSON para imágenes (no blobs)
El frontend usa `/pdf/page/{doc_id}/{page}` que retorna base64 en JSON en lugar de `/pdf/page-image` (raw PNG). Esto es porque Electron en producción ejecuta el renderer bajo el protocolo `file://`, el cual bloquea o tiene problemas CORS con URLs `http://localhost`. Aunque existen workarounds (custom protocols, blob URLs), base64 JSON es el approach más estable y portable.

### 7.2 LRU Cache en Backend
```python
_render_cache: OrderedDict  # max 150 entries
_thumb_cache: OrderedDict   # max 300 entries
```
Invalidación automática en `rotate`, `delete`, `merge`, `insert`, `reorder`, `watermark`, `header-footer`, `redact`, `crop`. Evita re-renderizado costoso de PyMuPDF.

### 7.3 Undo/Redo
El historial guarda **clones profundos** de `docs[]` pero **intencionalmente no clona** `pageCache` ni `thumbnails` para ahorrar memoria. Al deshacer, las imágenes se re-fetchean del backend cache o se re-renderizan.

### 7.4 PyInstaller + Backend Spawner
El backend se empaqueta como `pdf-engine.exe` via PyInstaller. El main process de Electron lo spawnea y espera a que responda en `localhost:8745` antes de crear la ventana (con timeout fallback de 15s). Esto evita el bloqueo que ocurría cuando se intentaba leer stdout de un ejecutable PyInstaller sin consola.

### 7.5 DEBUG=False en Producción
`backend/app/core/config.py` tiene `DEBUG: bool = False`. En desarrollo se puede sobreescribir vía variable de entorno.

---

## 8. Guía de Build

### Requisitos
- Node.js + npm
- Python 3.14.3
- Windows (el build de PyInstaller es Windows-only)

### Desarrollo
```powershell
# Terminal 1 — Backend
cd backend
.\venv\Scripts\python.exe main.py

# Terminal 2 — Frontend
cd frontend
npm run dev
```

O usar el script integrado:
```powershell
.\dev.ps1
```

### Producción
```powershell
# 1. Build del backend
cd backend
.\venv\Scripts\pyinstaller.exe pdf-engine.spec

# 2. Copiar exe al frontend
cd ..\frontend
Copy-Item ..\backend\dist\pdf-engine.exe resources\backend\

# 3. Build del instalador
npm run build:win
```

El instalador se genera en:
```
frontend/dist/PDF-Master-Setup-1.1.1.exe
```

---

## 9. Limitaciones Conocidas

| Limitación | Razón / Workaround |
|------------|-------------------|
| OCR requiere Tesseract OCR instalado | `pytesseract` es un wrapper que necesita el binario `tesseract.exe` en PATH. Si no está, el endpoint retorna 400. |
| Scanner no implementado | Requiere drivers nativos TWAIN/WIA. Muy complejo de empaquetar con Electron/PyInstaller. |
| Firmas embebidas como polyline | No son firmas digitales PKCS#7/PAdES. Son representaciones gráficas de paths dibujados. |
| Image tool: tamaño fijo | Las imágenes se insertan a 200×150 puntos PDF. No hay resize interactivo aún. |
| Export Excel no preserva tablas | Extrae texto plano línea por línea. No parsea estructuras de tabla del PDF. |
| Redaction: coordenadas manuales | Se ingresan por prompt numérico. No hay selección visual de área para redactar. |
| Find & Replace: tipografía | El texto reemplazado usa tamaño estimado del rectángulo original. No preserva fuente exacta. |

---

## 10. Roadmap Futuro (Ideas)

- [ ] Firmas digitales reales con certificados `.pfx` / PAdES
- [ ] Resize interactivo de imágenes insertadas
- [ ] Comentarios/threading en anotaciones
- [ ] Sincronización con Google Drive / Dropbox / OneDrive
- [ ] Plugin system para anotaciones custom
- [ ] OCR batch (todas las páginas)
- [ ] Comparación visual de PDFs con diff resaltado
- [ ] Reconocimiento de tablas para export Excel estructurado

---

## 11. Addendum v1.2.x → v1.3.1 (2026-06-06 a 2026-06-10)

> Esta sección **prevalece** sobre las anteriores donde haya contradicción.

### 11.1 Regla de producto: sin escritura automática a disco (v1.3.1)

**La app NUNCA escribe a disco sin acción explícita del usuario.** El autoguardado (embed de anotaciones + save in-place cada 30 s) sobrescribía el PDF original en silencio y dañó un archivo real. Fue **eliminado por completo** (`useAutoSave.ts`, `autoSaveEnabled` del store, toggle del menú). No reintroducir.

En su lugar, **alertas de cambios sin guardar**:
- **Cerrar pestaña** con doc dirty → `requestCloseDoc(docId)` (`renderer/src/lib/closeDocument.ts`): `window.confirm` antes de descartar. Usado en TODOS los puntos de cierre (X de pestaña, menú contextual, Ctrl+W, "Cerrar las demás/a la derecha/todas", menú Archivo).
- **Cerrar la app** con docs dirty → el renderer reporta el estado vía IPC `app:dirty-state` (preload `setDirtyState`); el main process intercepta el evento `close` de la ventana con `dialog.showMessageBoxSync` ("Salir sin guardar" / "Cancelar").
- El sidecar `<archivo>.pdf.pdfmaster.json` (persistencia de anotaciones) ahora **solo se escribe en guardado manual**.

### 11.2 Render binario por URL (supersede §7.1)

§7.1 quedó obsoleto: el visor **sí** usa `GET /pdf/page-image/{id}/{page}?zoom=&v=` (PNG binario). Base64 en JSON rompía el `<img>` con planos densos (data-URLs de decenas de MB). El problema de `file://` se resolvió con:
- CSP `img-src` que permite `http://localhost:8745` y `blob:`.
- `recoverImage()` en `Viewer.tsx`: si el `<img>` directo falla, reintenta `fetch` → `blob:` y registra la causa (`PAGEIMG ...` en el log).
- `?v=docVersion` para cache-busting tras editar el documento.

### 11.3 Concurrencia del backend (CRÍTICO — no tocar)

- **PyMuPDF NO es thread-safe.** FastAPI corre los handlers `def` en threadpool; dos accesos simultáneos a fitz → **segfault** del proceso. Fix de raíz: threadpool limitado a **1 worker** en `main.py` (`lifespan`: `to_thread.current_default_thread_limiter().total_tokens = 1`). `health_check` es `async`, así que siempre responde. Validado con test de 88 peticiones concurrentes.
- `RLock` en `PdfService` + **caps de resolución**: render 3000 px (base) / 6000 px (zoom), miniaturas 300 px.
- **LRU de documentos**: máx 12 `fitz.Document` vivos; reabre desde disco al acceder; nunca evicta docs dirty.

### 11.4 Estabilidad multi-instancia y auto-reparación (v1.3.0)

- **Instancia única estricta** (`src/main/index.ts`): la instancia perdedora hace `app.exit(0)` **inmediato**. Antes usaba `app.quit()` (asíncrono) y alcanzaba a ejecutar `whenReady` → `killExistingBackend()` → **mataba el `pdf-engine.exe` de la instancia principal** → doc_ids muertos → páginas en blanco con health-check verde. `second-instance` y argv reenvían **todos** los `.pdf` del comando (antes solo el primero — abrir varios desde Explorer solo abría 1).
- **Auto-reparación de doc_ids muertos**: si `page-info`/`page-image` devuelve **404** con motor sano, `reopenDeadDoc(docId)` (`lib/openDocument.ts`) reabre el archivo por `file_path` y `remapDocId(oldId, newId)` (store) sustituye el id **conservando anotaciones, página y zoom** (vacía `pageCache`, incrementa `docVersion`). Enganchado en `usePageLoader.fetchEntry` y `recoverImage`.
- **Apertura serializada** (`openDocument.ts`): cola `openChain`; aperturas masivas entran como pestañas en segundo plano (`activate: false`).
- **Health-check** (App.tsx): timeout 12 s, reinicia tras 5 fallos consecutivos y reabre los documentos.

### 11.5 Modelo de anotaciones extendido (v1.3.0) — supersede tabla §4.3

Campos nuevos en `Annotation` (frontend `usePdfStore.ts` + backend `models/pdf.py`):

| Campo | Tipo | Uso |
|-------|------|-----|
| `lineWidth` | float (puntos PDF) | Grosor de trazo 0.5–12. Se renderiza `lineWidth * bitmapScale` → escala con el zoom y coincide 1:1 con el embebido. |
| `lineStyle` | `'solid' \| 'dashed' \| 'dotted'` | SVG: `strokeDasharray` proporcional al grosor. PDF: `dashes="[w*3 w*2] 0"` / `"[0.1 w*2] 0"`. |
| `opacity` | 0.05–1 | SVG: `opacity`/`fillOpacity`. PDF: `stroke_opacity` (shapes) o `annot.set_opacity()` (markup). |
| `fillColor` / `fillOpacity` | hex / 0–1 | Relleno de rect/círculo (`fill` + `fill_opacity` en PyMuPDF). |
| `rotation` / `imageData` | float / data-URL | Añadidos al modelo Pydantic: el sidecar los **descartaba silenciosamente** (la rotación de imágenes se perdía al reabrir). |

UI: sección **"Trazo"** en `ToolsPanel.tsx`. Sin selección edita los **defaults de herramienta** (persistidos en `localStorage['pdfmaster_stroke']`); con una anotación seleccionada edita **esa anotación** (incluido el color, antes inmutable tras crear).

Render unificado: `renderAnnotation(ann, pageData, toScreen, isPreview, onSelect)` parametrizado se usa para las páginas izquierda **y** derecha (antes la derecha tenía un switch duplicado de ~110 líneas desactualizado).

Bugs corregidos en `embed_annotations` (todos latentes, destapados por tests):
- Flecha: `fitz.utils.degrees/atan2/cos/sin` y `page.draw_polygon` **no existen** en PyMuPDF → embeber una flecha siempre crasheaba. Ahora `math.*` + `Shape.draw_polyline(closePath=True)`.
- Draw/firma: `p.x` sobre los dicts del JSON (`'dict' object has no attribute 'x'`) → guardar con dibujo libre devolvía 500. Ahora `p["x"]`.

### 11.6 Mediciones estilo Bluebeam (v1.2.x–1.3.0)

- **Snapping**: `GET /pdf/snap-points/{doc}/{page}` (vértices/midpoints del vectorial vía `get_drawings`, caché 60 págs, máx 20k puntos). `useAnnotationDraw` imanta con tolerancia 10 px de pantalla; indicador verde en el visor.
- **Escala persistida** por ruta en `localStorage['pdfmaster_scales']`; se rehidrata al reabrir. La StatusBar muestra `1 <unidad> = X pt` o "Sin calibrar".

### 11.7 Tests y CI (desde 2026-06-09)

- `backend/tests/` (pytest + TestClient): **25 tests** — render/caps, concurrencia (regresión segfault), LRU, anotaciones (roundtrip sidecar con stroke/rotation, embed con estilo/opacidad/relleno, draw/firma con points), ops de documento, PDFs protegidos. Correr: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q` **siempre tras tocar el backend**.
- CI GitHub Actions (`.github/workflows/ci.yml`): pytest + typecheck en push/PR; tag `v*` compila y publica release (auto-update).

### 11.8 Build actualizado (supersede §8)

```powershell
# Solo si cambió Python:
cd backend
.\venv\Scripts\pyinstaller.exe pdf-engine.spec --noconfirm --clean
Copy-Item dist\pdf-engine.exe ..\frontend\resources\backend\ -Force

# Subir "version" en frontend\package.json, luego:
cd frontend
npm run typecheck
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win    # → dist\PDF-Master-Setup-<version>.exe
```
Antes de instalar: cerrar la app del todo (que no quede `pdf-engine.exe` en el Administrador de tareas). Sin firma de código → aviso SmartScreen. Para probar el backend sin chocar con la app instalada: puerto **8746**.

### 11.9 Historial de versiones (resumen)

| Versión | Fecha | Resumen |
|---------|-------|---------|
| 1.3.1 | 2026-06-10 | **Autoguardado eliminado** + alertas de cambios sin guardar (pestaña y app). |
| 1.3.0 | 2026-06-10 | Propiedades de trazo (grosor/estilo/opacidad/relleno), render unificado, instancia única estricta, auto-reparación de doc_ids (404), fix embed flecha y draw/firma. |
| 1.2.8 | 2026-06-07 | `recoverImage` (img rota → fetch→blob), log del renderer en `backend.log`. |
| 1.2.7 | 2026-06-06 | **Threadpool 1 worker** (segfault PyMuPDF), rutas `/text` unificadas. |
| 1.2.5–1.2.6 | 2026-06-06 | LRU docs, tiles de zoom profundo, fixes de anotaciones (arrastre invertido, fontSize en puntos, editor in-place). |
| 1.2.0–1.2.4 | 2026-06-05 | Branding/instalador, apertura masiva en serie, menú de pestañas. |
| 1.1.9 | 2026-06-05 | Imágenes binarias por URL (adiós base64). |

### 11.10 Limitaciones vigentes (actualiza §9)

- Anotaciones de **imagen** no se embeben en el PDF (solo app/sidecar); pendiente `page.insert_image` (rotación solo en múltiplos de 90°).
- **No hay backup** al guardar in-place: sobrescribe el original. Si se añade, debe ser **opt-in** (regla 11.1).
- Mediciones no se embeben (visuales).
- OCR requiere Tesseract instalado aparte; sin firma de código (SmartScreen); firma no criptográfica.

---

*Documentación generada automáticamente durante el desarrollo activo del proyecto PDF Master.*
