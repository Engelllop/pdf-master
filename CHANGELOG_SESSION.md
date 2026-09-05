# Registro de Cambios — Sesiones de Desarrollo

Changelog canónico en este archivo. Detalle técnico: `DOCUMENTATION.md`.

---

## Sesión 2026-09-04 — v1.22.0

**El tamaño de la burbuja de conteo se elige.** Estaba escrito a mano en tres sitios (9 de radio en el visor, 9 en el motor): en un plano denso la burbuja tapaba lo que estabas contando, y en uno grande no se veía.

- Control en la barra de propiedades con la herramienta de conteo activa: cuatro presets, deslizador y el valor a la vista. De paso, el conteo no estaba en ninguna lista de la barra, así que **el color de la categoría tampoco se podía tocar** desde ahí.
- Va en **puntos del PDF**, no en píxeles de pantalla: una burbuja puesta al 400% sale igual que una puesta al 50%.
- El tamaño viaja **en la marca** (`width`), no en el ajuste: cambiar el ajuste después no reescala lo ya contado.
- Las marcas de antes no llevan tamaño y se siguen dibujando a 18 pt. Al reabrir, el diámetro se recupera del propio círculo **descontando el borde**: el rect de PyMuPDF lo incluye, así que sin eso una burbuja vieja crecía 2 pt en cada guardado.

---

## Sesión 2026-09-04 — v1.21.0

El chrome se queda sin color.

- **Nada de azul en la interfaz.** Lo elegido —herramienta activa, interruptor encendido, opción marcada, fila seleccionada— pasa a un relleno gris (`selected`) con la tinta normal encima. La acción primaria pasa a relleno de **tinta**: en oscuro eso es un botón claro sobre panel oscuro, que es la consecuencia de no tener color y es preferible a que la acción primaria no se distinga de la secundaria. El anillo de foco también es de tinta, y como invierte con el tema contrasta con el control esté relleno o vacío.
- **El acento sobrevive solo sobre la lámina**: selección de marcas, tiradores, resaltado de la capa de texto. Ahí no es decoración, es «esto es lo que tenés agarrado».
- **Los controles nativos dejan de sangrar azul.** Los deslizadores y las casillas se pintaban con el acento del *sistema* (el azul de Windows) porque nadie decía lo contrario: en un chrome sin color, ese acabó siendo el único azul de la pantalla. Resuelto en una regla global, no control por control.
- **El tooltip espera medio segundo y ya no repite lo que el botón dice.** Con 200 ms, cruzar la cinta para llegar al documento dejaba un reguero de globos tapando lo de debajo; y un botón con su etiqueta a la vista no necesita un globo que la repita, salvo para añadir el atajo.

25 archivos de interfaz migrados, 563 tests.

---

## Sesión 2026-09-04 — v1.20.1

Arreglos de lo que rompió 1.20.0, encontrados mirando la app de verdad.

### El PDF que pedía contraseña y no estaba protegido
Al actualizar, el motor de la versión anterior sobrevive al cierre (PyInstaller onefile deja un hijo) y se queda con el 8745. La app nueva no puede bindear, le habla a ese motor viejo, el token no coincide y el visor —donde 401 significa «este PDF pide contraseña»— abría el diálogo de contraseña **para todos los PDFs**.

1.20.0 lo empeoró: cambió el `taskkill` por nombre de imagen —que barría el motor de otra instalación— por matar solo el PID del pidfile, y el motor viejo nunca escribió ese pidfile. Lo que antes se curaba solo quedaba clavado.

Ahora, si alguien tiene el puerto, la app le pregunta con su token: un **403** significa que no es el suyo, y entonces mata los `pdf-engine.exe` cuyo **ExecutablePath** es el de esta instalación. Ni por nombre (mataba ajenos) ni por pidfile (no conoce al huérfano).

### Los desplegables de la cinta no abrían
`material` usa `backdrop-filter`, y eso crea un contexto de apilamiento: los z-index de los menús dejaron de valer contra el visor, que es un hermano posterior. Dibujar, Medir, Conteo, Archivo y Más herramientas se abrían **debajo del documento** — existían y no se veían. El contenedor del chrome sube a `z-dropdown`.

### La cinta se pisaba con la búsqueda y las acciones
La copia de medida «con etiquetas» vive dentro de la fila, así que en cuanto la fila se compactaba **también perdía las etiquetas**: medía lo mismo que la copia compacta, la cuenta se degradaba y las herramientas se desbordaban encima de lo de la derecha. La copia se blinda con la regla que fuerza la etiqueta. Además se vuelve a medir con el `resize` de la ventana, no solo con el `ResizeObserver`.

### El aviso de calibración tapaba las herramientas
Colgaba de la columna entera, así que su `top-3` caía sobre la cinta justo cuando hay que usarla. Ahora se ancla al área del documento.

### Banco de pruebas del renderer
`npm run harness` monta la interfaz **real** en un navegador, sin Electron y sin motor, con un documento abierto. Es lo que faltaba: los tres bugs de arriba pasaban los 562 tests en verde porque jsdom no hace layout y la app no arranca en un panel de navegador.

---

## Sesión 2026-09-04 — v1.20.0

Dos frentes: el arranque y el CI por un lado, el sistema visual por el otro.

### Sistema visual v2 (traducción a lenguaje Apple)
- **Tokens**: neutros de sistema, oscuro en grafito neutro (el azul marino le discutía el color al documento), acento `#0a66d6` — el `#007AFF` de Apple da 4.06:1 con blanco encima y aquí hay etiquetas de 11–13px sobre relleno. Cinco radios por rol, elevación que empieza por un contorno de medio píxel, y `--faint` para lo que **no** es texto.
- **Material**: el chrome pasa de franja opaca a vidrio (`.material`, `.material-edge`, `.scroll-edge`), con `prefers-reduced-transparency` resuelto en el token.
- **Tipografía**: el tracking vive en la escala y es específico por tamaño (−0.02em a 20px, +0.006em a 11px); peldaño `head` de 15px que faltaba.
- **Movimiento**: resorte crítico en `linear()` nativo como curva por defecto, rebote solo para lo que traía inercia, y respuesta en el press (scale 0.97 en 90 ms).
- **Una sola fila de cinta**: los modos —ya segmentados, no subrayados— comparten fila con las herramientas del modo. Eran 136px de chrome antes de ver el documento; quedan 88.
- **Desbordamiento en dos escalones** (`RibbonOverflow`): primero se van las etiquetas (el nombre sigue en el tooltip), y solo si ni así entran, el resto va a «Más herramientas» con la cuenta. Se mide sobre copias fuera de pantalla: midiendo la fila real, esconder un botón cambia el ancho y la cuenta oscila en cada frame.
- La pestaña de documento pasa a píldora y la caja de búsqueda flota bajo su botón (con «Reemplazar» abierta estiraba la fila y empujaba el documento).
- Galería viva del sistema en `frontend/design/gallery.html`, con el contraste de cada par medido en la propia página.

### Arranque, seguridad y CI
- El motor deja su PID en `logs\engine.pid` y solo se mata **ese**: `taskkill /F /IM pdf-engine.exe` barría el motor de otra instalación o de otro usuario. Al salir se mata el árbol (PyInstaller onefile deja un hijo con el puerto tomado).
- **Un 401 que mentía**: con otro motor en el 8745 el token no coincide y el visor —donde 401 significa «este PDF pide contraseña»— abría el diálogo de contraseña para un PDF que no está protegido. Ahora es 403 y el mensaje dice que hay otro PDF Master en el puerto.
- **E2E** (`npm run e2e`, Playwright + Electron): arranca la app construida con un PDF por línea de comandos y comprueba que el motor levanta y rasteriza. No entra al CI (necesita build + venv).
- **Diagnóstico**: id de operación de 8 hex en la miga de pan, en el log si tarda ≥2 s y en la respuesta (`X-Request-Id`); `/pdf/health` dice versión y pid; y Ajustes → Diagnóstico → Exportar deja un `.txt` con todo eso más la cola de los logs.
- **Dependencias**: `security.yml` (npm audit, pip-audit, CodeQL) y Dependabot. `npm audit fix` se llevó tres CVE high de undici.
- Antes de empaquetar se verifica que `pdf-engine.exe` esté en `resources/backend` y no sea un binario truncado.
- Rutas de salida absolutas y sin bytes nulos; `shell.openPath`, `showItemInFolder` y `file:readBase64` validan lo que reciben.
- La versión es una sola cadena atada por tests: tag → `package.json` → spec y changelog → `ENGINE_VERSION`.

**Pendiente:** la pasada a ojo en la app instalada, la fusión del resto de superficies (paneles, diálogos, visor) al sistema v2, y los 49 avisos de lint.

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
