# Registro de Cambios — Sesiones de Desarrollo

> Changelog canónico completo: vault Obsidian (`Documents\Memory\projects\pdf-master.md`). Detalle técnico: `DOCUMENTATION.md` §11.

---

## Sesión 2026-06-10 — v1.3.0 / v1.3.1

### v1.3.1 — Autoguardado eliminado (REGLA: la app nunca escribe a disco sin acción del usuario)
**Problema:** el autoguardado embebía las anotaciones y sobrescribía el PDF original en disco cada 30 s, en silencio. Dañó un plano real del usuario.
**Solución:** eliminado de raíz (`useAutoSave.ts`, `autoSaveEnabled` del store, toggle del menú). En su lugar:
- Cerrar pestaña con cambios sin guardar → confirmación (`lib/closeDocument.ts` → `requestCloseDoc`, usado en X de pestaña, menú contextual, Ctrl+W, "cerrar las demás/a la derecha/todas" y menú Archivo).
- Cerrar la app con cambios sin guardar → diálogo nativo "Salir sin guardar / Cancelar" (IPC `app:dirty-state` renderer→main + handler `close` con `dialog.showMessageBoxSync`).
- El sidecar `.pdfmaster.json` solo se escribe en guardado manual.

### v1.3.0 — Estabilidad (diagnóstico vía `%APPDATA%\pdf-master\logs\backend.log`)
1. **Abrir varios PDFs a la vez colapsaba el motor / solo abría 1.** El single-instance lock usaba `app.quit()` (asíncrono): las instancias secundarias alcanzaban a ejecutar `whenReady` → `taskkill pdf-engine.exe` → mataban el motor de la instancia principal. Fix: `app.exit(0)` inmediato + `second-instance`/argv reenvían **todos** los .pdf (antes solo el primero). `src/main/index.ts`.
2. **Página en blanco persistente (img rota) con miniaturas OK.** Tras esos reinicios el motor nuevo respondía 200 al health-check pero los doc_ids estaban muertos (404 eternos) y la recuperación nunca se disparaba. Fix: auto-reparación — 404 en page-info/page-image → `reopenDeadDoc()` reabre por ruta y `remapDocId()` conserva anotaciones/página/zoom. `lib/openDocument.ts`, `usePdfStore.ts`, `usePageLoader.ts`, `Viewer.tsx`.
3. **Guardar con dibujo libre/firma devolvía 500 siempre** (`'dict' object has no attribute 'x'` en el log): `embed_annotations` usaba `p.x` sobre dicts del JSON. Fix: `p["x"]`. `pdf_service.py` + test de regresión.

### v1.3.0 — Anotaciones (propiedades de trazo estilo Bluebeam)
- **Grosor** 0.5–12 pt (en puntos PDF reales: escala con el zoom y coincide con el embebido; antes 2 px fijos de pantalla), **estilo de línea** sólida/discontinua/punteada, **opacidad**, **relleno con opacidad** (rect/círculo).
- Sección "Trazo" en ToolsPanel: edita defaults de herramienta (persistidos en `localStorage['pdfmaster_stroke']`) o la **anotación seleccionada** (incluido color, antes inmutable tras crear).
- Render unificado de página izquierda/derecha (`renderAnnotation` parametrizado; eliminado switch duplicado de ~110 líneas).
- Backend: `dashes`/`stroke_opacity`/`fill`/`fill_opacity` en shapes, `set_opacity` en markup; modelo + `rotation`/`imageData` (el sidecar los descartaba — la rotación de imágenes se perdía al reabrir).
- **Bug latente corregido:** embeber una flecha siempre crasheaba (`fitz.utils.degrees`/`page.draw_polygon` no existen en PyMuPDF) → `math.*` + `Shape`.
- Tests backend: 22 → **25** (todos verdes). Instalador: `PDF-Master-Setup-1.3.1.exe`.

---

## Sesión 2026-06-04

**Versión:** 1.1.1

---

## Problemas Reportados y Soluciones

### 1. `measure_calibrate` no mostraba diálogo de prompt
**Causa:** La herramienta calibraba automáticamente asumiendo `1 px = 1 mm` sin preguntar al usuario.
**Solución:** Se agregaron dos prompts consecutivos:
1. Distancia real conocida (ej: `100`).
2. Unidad de medida (`m`, `cm`, `mm`, `ft`, `in`).
**Cálculo:** `pixelsPerUnit = distancia_en_px / distancia_real`.
**Archivo:** `frontend/src/renderer/src/hooks/useAnnotationDraw.ts`

### 2. `measure_area` no respondía al cerrar el polígono
**Causa:** Solo se podía cerrar con doble-click en el SVG, lo cual era poco intuitivo y a veces no funcionaba correctamente al interferir con los clicks de dibujo.
**Solución:**
- Se agregó un **botón flotante** "Cerrar polígono (Enter)" que aparece mientras se dibuja el área.
- Se mantiene el cierre con **Enter** y cancelación con **Escape**.
**Archivo:** `frontend/src/renderer/src/components/Viewer.tsx`

### 3. Anotaciones de imagen carecían de resize, drag y rotación
**Estado anterior:** La imagen se colocaba con tamaño fijo de 200×150 y no se podía modificar visualmente.
**Solución:**
- **Resize:** Funciona con los 8 handles de esquinas ya existentes.
- **Drag:** Funciona arrastrando desde cualquier punto dentro de los bounds de la imagen.
- **Rotación:** Se agregó un **handle de rotación verde** (`#10b981`) ubicado 20px arriba del centro de la imagen, conectado por una línea punteada azul. Al arrastrarlo se actualiza el campo `rotation` de la anotación en tiempo real.
**Archivo:** `frontend/src/renderer/src/components/Viewer.tsx`

### 4. Resize de anotaciones `text` y `note` no funcionaba
**Causa:** La función `getAnnotationBounds()` calculaba el tamaño visual a partir del contenido (longitud del texto / tamaño de icono fijo), ignorando los campos `width` y `height` que se actualizaban al redimensionar.
**Solución:** Se modificó `getAnnotationBounds` para:
- **`text`:** Usar `ann.width` y `ann.height` si existen; si no, calcular desde el contenido.
- **`note`:** Usar `ann.width || 28` y `ann.height || 28` en lugar de valores fijos.
**Archivo:** `frontend/src/renderer/src/components/Viewer.tsx`

---

## Cambios Técnicos Detallados

### `frontend/src/renderer/src/hooks/useAnnotationDraw.ts`
- En `handleMouseUp`, dentro del bloque `measure_calibrate`:
  - Se reemplazó la calibración automática por prompts interactivos.
  - Se valida que la distancia real sea un número finito > 0.
  - Se valida la unidad contra una lista permitida.
  - Se muestra toast con el resultado de la calibración.

### `frontend/src/renderer/src/components/Viewer.tsx`
- **Nuevo estado:** `rotatingAnn` (declarado al inicio del componente, antes de los `useEffect`).
- **Nuevo `useEffect`:** Listener global de `mousemove`/`mouseup` para rotación de anotaciones.
- **`getAnnotationBounds`:**
  ```typescript
  case 'text':
    const tw = ann.width ? ann.width * sx : Math.max(80, (ann.text?.length || 4) * fs * 0.55) * sx
    const th = ann.height ? ann.height * sy : Math.max(24, fs * 1.4) * sy
  case 'note':
    return { x: s.x, y: s.y, w: (ann.width || 28) * sx, h: (ann.height || 28) * sy }
  ```
- **Rotate handles:** Variables `rotateHandleLeft` / `rotateHandleRight` renderizadas dentro de cada SVG de página.
- **Floating controls para `measure_area`:** Botones "Cerrar polígono" y "Cancelar" renderizados condicionalmente cuando `drawingArea === true`.

### Build
- Comando usado: `cd frontend; npm run build:win`
- Output exitoso: `frontend/dist/PDF-Master-Setup-1.1.1.exe`

---

## Notas para Desarrollo Futuro

- El campo `rotation` ya existía en la interfaz `Annotation` del store (`usePdfStore.ts`).
- Los errores de TypeScript preexistentes relacionados con la falta de tipos DOM (`window`, `document`, `MouseEvent`, etc.) no fueron introducidos en esta sesión; provienen de la configuración actual de `tsconfig.web.json`.
- La rotación de imagen actualiza `ann.rotation` en grados. Los bounds de selección (resize handles) no se rotan junto con la imagen; usan el axis-aligned bounding box, lo cual es una aproximación aceptable para la UX.
