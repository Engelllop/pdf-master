# Registro de Cambios — Sesiones de Desarrollo

Changelog canónico en este archivo. Detalle técnico: `DOCUMENTATION.md`.

---

## Sesión 2026-09-02 — v1.19.0

Tres pasadas de diseño sobre el chrome, más el imán de snap.

- Cinco bugs de render: `PropertiesBar` definía sus subcomponentes dentro del cuerpo (los campos numéricos perdían el foco al teclear), `ReviewPanel` tenía un early return que hacía inalcanzable su estado vacío, el botón «Ir a pestaña…» se volvía gris al pasar el ratón, `AIPanel` parpadeaba el onboarding de la key, y el auto-scroll del chat corría en cada render.
- Contraste: tres fallos AA reales (accent oscuro 4.20:1, `text-white` sobre danger 2.56:1, `inkOnTint()` sin corregir gamma), `--hover`/`--active` invertidos en oscuro y `--border-control` nuevo (WCAG 1.4.11 pide 3:1).
- Tokens `--paper-*`, `--scrim`/`--on-scrim`, `--hit`/`--diff-*`: el chrome pintado encima de la lámina desaparecía en tema oscuro.
- `prefers-reduced-motion` congelaba spinners y skeleton (se lee como app colgada): ahora corta transforms y deja girar los indicadores. Salidas animadas en las capas modales, toasts que colapsan el hueco.
- `panelUi.tsx` unifica PanelHeader/EmptyState/SegmentedGroup/PageActions (el mismo segmented estaba escrito tres veces).
- `DESIGN.md` regenerado desde el código: describía otra app (accent = tinta, prohibía azul, radios que no existen).

---

## Sesión 2026-08-27 — v1.18.0

Doce iteraciones de pulido visual, una mejora cerrada por iteración.

- **Borrador (E)**, que no existía: corta el trazo por donde pasás, a nivel de segmento, con dos modos y pincel en píxeles de pantalla. Todo el arrastre es un paso de deshacer.
- Cotas y polígonos de área **nunca** se cortan: recortarlos cambiaría en silencio la medida y en un takeoff eso sale mal a destiempo.
- `--accent` era literalmente `--fg`: la herramienta activa, el foco y la selección eran un bloque negro. Acento propio, escala de elevación, tres radios, y capas nombradas por rol en vez de nueve `z-[NN]` a mano.
- Diez defectos de UI reales (pestaña activa que se leía hundida, cuatro `bg-danger hover:bg-danger`, `normalize('NFD')` convirtiendo «Diseño» en «diseno», menú contextual que no cerraba con Esc ni clic fuera…).
- Menú contextual del visor rehecho, búsqueda sin tildes, paleta agrupada, Ajustes en tres bloques.
- 471 → 521 tests.

---

## Sesión 2026-08-27 — v1.17.0

- **Vista continua a la par de la vista de página:** capa de texto seleccionable, coincidencias de búsqueda pintadas, resaltar/subrayar/tachar anclados al texto real y mover/redimensionar marcas. `underline`/`strikethrough` no estaban en ninguna lista de herramientas, así que no hacían nada.
- **Una ruta = un archivo:** `lib/rutas` centraliza la comparación (Windows ignora mayúsculas y el sentido de las barras) en los cinco sitios que indexan por archivo. Antes se abría una segunda pestaña del mismo PDF, las escalas de calibración se perdían al reabrir desde recientes y los marcadores no volvían nunca.
- Reemplazar texto redactaba todas las ocurrencias y escribía el reemplazo solo en la primera, una línea más arriba.
- Impresión manda la orientación (un juego apaisado salía girado); PowerPoint rasteriza con tope de píxeles y encaja la lámina sin deformarla.
- Índice/TOC editable de verdad (renombrar y borrar por ruta en el árbol).

---

## Sesión 2026-08-27 — v1.16.0

Había cuatro formas de escribir un PDF y solo dos llevaban las marcas pendientes.

- `_copia_con_marcas` centraliza el embed para guardar, contraseña, comprimir, quitar contraseña y extraer páginas: comprimir encima del original borraba del disco lo recién marcado.
- Aviso antes de sobrescribir un archivo que cambió en disco o que otra pestaña tiene abierto; `.bak` opt-in en las tres rutas; todas las escrituras pasan por `_guardar_atomico` (temporal + `os.replace`).
- Los `Stamp` ajenos ya no se gestionan (el guardado los degradaba a una caja con texto) y la tinta multitrazo ajena ya no se corrompe.
- XFDF de ida y vuelta con Acrobat/Bluebeam: autor, fecha, asunto, respuestas, estado, puntas de flecha.
- Miniaturas y organizador rasterizan con PDF.js en el cliente: cada una tomaba el único lock de MuPDF. Fuera `/pdf/thumbnail`.

---

## Sesión 2026-08-25 — v1.15.0

Auditoría de las 33 herramientas, una por una. Detalle en la bóveda: `projects/archivo/pdf-master/pdf-master-auditoria-loop-2026-08-25.md`.

- Imprimir mandaba el PDF **sin** las marcas sin guardar, sin avisar (`/pdf/raw?marks=1`).
- Recalibrar la escala no recalculaba las cotas ya tomadas.
- Ctrl+Z deshacía en la pestaña equivocada (pila única, se tomaba el último comando y no el del documento activo).
- La marca saltaba al arrastrarla: mousedown en px del bitmap contra mousemove en px de pantalla. Igual en redimensionado y giro.
- «Guardar con contraseña» sin contraseña guardaba sin cifrar y decía que había protegido el PDF.
- Memoria: cinco caminos vaciaban caches de bitmaps sin revocar blob URLs; la sesión se escribía en localStorage en cada mousemove; el log del motor no rotaba.
- Accesibilidad: miniaturas y pestañas navegables, `aria-pressed` en los interruptores, live regions y nombres accesibles en los botones de icono.

---

## Sesión 2026-08-24 — v1.14.1 / v1.14.2

### v1.14.2 — Las marcas viven en el PDF
Fuera el sidecar `.pdfmaster.json` (segunda copia que se desincronizaba). Quitarlo destapó lo que no sobrevivía a guardar + reabrir: un globo tumbaba el guardado entero (`border_color` revienta en PyMuPDF 1.28), estrella y nube se horneaban en el contenido en vez de volver como marcas. Round-trip de los 22 tipos fijado en test.

### v1.14.1 — Texto fantasmeado y 401 del motor
PDF.js seguía rasterizando con anotaciones activadas, así que cada marca salía dos veces y separada. El middleware del token dejó fuera al main process: 401 en imprimir y en el adjunto del asistente, que fallaba callado (Claude respondía sin haber visto el PDF).

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
