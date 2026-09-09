# PDF Master — Documentación técnica

> Versión: **1.23.0** · Actualizado: 2026-09-09  
> Changelog de sesión: `CHANGELOG_SESSION.md`  
> Repo canónico: `C:\dev\pdf-master` (`C:\Users\Engelllop\pdf-master` es junction).

---

## 1. Qué es

Editor de PDFs para Windows (Electron + React + FastAPI + PyMuPDF), pensado para planos de obra. Inspirado en Bluebeam Revu / Acrobat, no es un visor genérico.

**Regla de producto:** la app **nunca** escribe a disco sin acción explícita del usuario. No hay autoguardado. El sidecar `.pdfmaster.json` **ya no se escribe**: las marcas viajan dentro del PDF y el sidecar solo se LEE, como respaldo de archivos guardados por versiones viejas (el `POST /pdf/annotations` del motor sigue existiendo pero la app no lo llama; hoy solo lo usan los tests). Hay aviso al cerrar pestaña o la app. Y aviso antes de **sobrescribir un archivo que cambió en disco** desde que se abrió (otro programa, o un cliente de sincronización como Drive/OneDrive): se compara fecha+tamaño vía `GET /pdf/disk-state`, y «Guardar como» no pregunta porque no toca el original. Copia `.bak` opt-in (default **on**), en las tres rutas de escritura (guardar, guardar con contraseña, quitar contraseña); si no se puede crear, se guarda igual pero **se avisa**. **Todas** las escrituras a disco del motor (guardar, contraseña, comprimir, extraer, exportar a Word/Excel/PPT/TXT/HTML/CSV, resumen de marcas, PDF en blanco, imágenes a PDF) pasan por `_guardar_atomico`: temporal al lado del destino con su misma extensión y `os.replace`. El archivo del usuario nunca queda a medio escribir, y un fallo no deja temporales en su carpeta. Y **toda escritura de un PDF completo lleva las marcas pendientes** (`_copia_con_marcas`, siempre sobre una copia para no apilarlas): guardar, guardar con contraseña, **comprimir**, **quitar la contraseña** y **extraer páginas** — las tres últimas escribían el archivo sin ellas: comprimiendo encima del propio original se perdían, y el extracto que se le manda a alguien salía con las láminas limpias. Escribir una COPIA no apaga el «sin guardar»: el original sigue sin guardarse. Las exportaciones **por lotes** piden carpeta de destino (`dialog:chooseFolder`) y el motor escribe cada archivo ahí: ninguna baja por `data:` URL a Descargas.

---

## 2. Stack

| Capa | Tecnología |
|------|------------|
| Shell | Electron 43, electron-vite 5, electron-builder 26 |
| UI | React 19, TypeScript 5.6, Tailwind 3.4, Zustand 5 |
| Render cliente | pdfjs-dist 6 (página / continua / comparar / tiles) |
| Motor | Python 3.13 (CI), FastAPI, PyMuPDF 1.28, Pillow — empaquetado **onedir** |
| Export | python-docx, openpyxl (`find_tables`), python-pptx, pytesseract |
| Tests | Vitest (frontend), pytest (backend), Playwright+Electron (e2e, en CI) |

---

## 3. Arquitectura

```
Electron main  →  elige puerto libre en 8745-8752
       │          spawnea pdf-engine.exe (o python main.py)
       │              PDFMASTER_API_TOKEN + PDFMASTER_PORT
Renderer       →  pide base+token por IPC (`api:config`)
                  HTTP 127.0.0.1:<puerto>  (header X-Pdfmaster-Token)
                      FastAPI 1 worker  (PyMuPDF no es thread-safe)
```

- **1 worker** en el threadpool. No subir. El health-check es `async`. Serializa TODO el motor a propósito (MuPDF no es thread-safe): un render de plano grande bloquea las demás peticiones, y eso es el precio de no reventar con un access violation.
- **El puerto no es fijo.** `enginePort.ts` prueba 8745 y, si lo tiene un programa ajeno, se muda al siguiente libre del rango (8 puertos). Antes el bind fallaba y la app quedaba abierta sin motor con una sola línea en el log; ahora, si están los ocho tomados, sale un aviso en pantalla con el rango. El puerto elegido viaja al renderer por `api:config` (base + token en una sola llamada) y `apiFetch` **solo cachea la respuesta buena**: cacheando también el fallo, un tropiezo transitorio dejaba el token vacío para siempre y todo daba 403 hasta reiniciar la app. La CSP de `index.html` enumera los ocho puertos — si `PUERTOS_A_PROBAR` sube, esa lista sube con él (lo ata `enginePort.test.ts`).
- Cerrar un documento libera también sus bitmaps y sus mallas de snap (`_invalidate_render_cache`): sin eso quedaban hasta 150 renders del documento cerrado en RAM hasta que el LRU los desplazara.
- LRU: máx. 12 documentos vivos; no se evictan docs dirty.
- Caps de render: 3000 / 6000 px. Miniaturas 300 px.
- Bitmaps de página = blob URLs, y `cachePage` **revoca el que reemplaza**: dos rasterizaciones de la misma página compitiendo por la misma entrada dejan revocado el blob que se está mostrando (página en blanco). El bitmap se sube de resolución al cambiar el zoom (`useZoomUpgrade`, 250 ms) en **los dos paneles** de la vista doble — el efecto de carga no vuelve a correr al hacer zoom, así que el derecho se quedaba borroso hasta cambiar de página. En scroll continuo el zoom vivo manda la geometría y el rasterizado espera 250 ms a que se quede quieto: los bitmaps **no se vacían** al hacer zoom (se estiran y se reemplazan al llegar el nuevo), que vaciarlos dejaba la ventana entera en blanco en cada paso de la rueda. El preload no pisa una entrada existente —descarta y libera su propio bitmap— y en vista doble no precarga `page + 1`, que es el panel derecho.
- Instancia única: la perdedora hace `app.exit(0)` inmediato.
- **El chrome va en `z-dropdown`.** `material` usa `backdrop-filter`, y eso crea un contexto de apilamiento: sin z-index propio, TODOS los desplegables de la cinta (dibujar, medir, conteo, archivo, más herramientas) se abren DEBAJO del documento — existen y no se ven. Quitarle el z-index al contenedor del chrome devuelve el bug entero.
- El motor deja su PID en `logs\engine.pid` y al arrancar solo se mata **ese** (y solo si sigue siendo un `pdf-engine.exe`: Windows recicla PIDs). Antes era `taskkill /F /IM pdf-engine.exe`, que barría el motor de otra instalación o de otro usuario. Al salir se mata el árbol (`/T`): PyInstaller onefile deja un hijo que se quedaba con el puerto.
- Cada petición que no es `/health` lleva un id de 8 hex: va en la miga de pan, en la línea del log si tarda ≥ 2 s y en la respuesta (`X-Request-Id`).
- `doc_id` muerto (404) → `reopenDeadDoc` + remap conservando marcas.
- **Hooks de gesto (arrastrar, redimensionar, girar, la página derecha).** Los listeners van en `window` y el efecto solo se re-suscribe al empezar y terminar el gesto, así que lo que lean del closure se queda congelado durante todo el arrastre. La regla: el estado se pide por `usePdfStore.getState()` y los props que puede cambiar el zoom (`pageData`, que `useZoomUpgrade` reemplaza a los 250 ms) por un ref vivo. **La excepción es el redimensionado**, que sí necesita la foto del arranque: parte de una caja de origen y un delta absoluto, y `geometriaRedimensionada` escala los `points` con un factor acumulado respecto de esa caja — con los puntos ya escalados del paso anterior, el factor se aplica encima y el trazo se dispara. Esa foto se toma explícita. Arrastrar leyendo del closure hacía que la marca se escapara del cursor cuadráticamente; los tests de un solo `mousemove` no lo ven.

**Sandbox Electron:** `sandbox: true` + `contextIsolation: true`. El `sandbox: false` que había no hacía falta: el preload solo importa de `electron` (`contextBridge`, `ipcRenderer`, `webUtils`), y las tres están disponibles en un preload sandboxeado. Validado con el e2e real (abrir por línea de comandos, rasterizar, cerrar pestaña), no solo con typecheck. La superficie IPC que abre rutas del sistema valida rutas locales absolutas existentes antes de llamar a `shell.openPath`, `shell.showItemInFolder` o leer imágenes para base64; el PDF que se suelta sobre la ventana se traduce con `fileURLToPath` (`rutaDePdfArrastrado`) y no a mano — el `replace`+`decodeURI` de antes se comía las rutas UNC y no abría un «Lámina #3.pdf».

---

## 4. Features (estado 1.22)

### Visor
Vista simple / doble, continua (dibuja, marca texto, deja seleccionar texto y **mueve/redimensiona** marcas, con las mismas reglas que la vista de página), lectura, presentación, comparar lado a lado + overlay con mezcla, zoom fit, tiles de zoom profundo, paleta Ctrl+K, cinta por modos. La capa de texto (`TextLayer`, spans cacheados en `lib/spans`), el anclaje de resaltado/subrayado/tachado al texto real (`computeLineRects`: una marca por renglón, un paso de deshacer, y aviso en vez de marca suelta si no hay texto debajo) los tiradores de selección (`SelectionOverlay` + `geometriaRedimensionada`, un gesto = un paso de deshacer) y las coincidencias de la búsqueda (`SearchHits`) van en **las dos vistas** — en continuo `highlight` caía al rect libre y `underline`/`strikethrough` no estaban en ninguna lista de herramientas, así que no hacían nada; en continuo no existían, así que pasarse a continuo para leer era perder el copiar y buscar dejaba de señalar dónde está el resultado (amarillo las de la página, naranja y latiendo la actual).

### Páginas
Reordenar, rotar, borrar, duplicar, insertar en blanco, recortar, extraer, combinar, comprimir, numerar/Bates, organizador. OCR de documento completo: el cliente lo parte en una llamada por página (`/pdf/ocr-pending` dice cuáles no tienen texto) para dar progreso y cancelación, y toma un `/pdf/stash-document` al principio para que deshacer sea UN paso y no uno por página. **Ctrl+Z/Ctrl+Y sí deshacen y rehacen operaciones de página** (`PageCommand` + stash en el motor); la doc decía lo contrario desde antes de que se implementara.

### Panel lateral
Páginas, esquema (TOC del PDF), marcadores, anotaciones, conteo y búsqueda. Los **marcadores** son de la app (no del PDF) y se guardan en localStorage por **ruta de archivo**: iban por `doc_id`, que el motor asigna en cada sesión, así que al reabrir la app el archivo tenía otro id y ningún marcador volvía a aparecer — se persistían para siempre sin verse. Las rutas se comparan con `lib/rutas` (Windows ignora mayúsculas y el sentido de las barras) en **los cinco sitios que indexan por archivo**: marcadores, recientes, las escalas de calibración, el guardado y el «ya está abierto» de `openDocument` (comparando cadenas se abría una SEGUNDA pestaña del mismo PDF, cada una con su lista de marcas, y guardar desde una descartaba las de la otra). Cuando el motor rechaza una apertura, su `detail` llega al usuario: un plano movido dice que ya no está en esa carpeta y **se quita de recientes** (las fijadas se respetan), y un lote fallido resume «no se encontraron N PDFs» en vez de N avisos iguales. En recientes, comparar cadenas hacía que el mismo plano saliera dos veces —cada copia con su miniatura, su «continuar en pág. X» y su chincheta— porque la ruta llega con formatos distintos según venga del cuadro de abrir, de la sesión guardada, de arrastrar y soltar o de la línea de comandos; al cargar se fusionan las que ya estaban duplicadas.

### Marcas
El **tamaño de la burbuja de conteo** lo elige el usuario (barra de propiedades, 8–72 pt) y viaja EN la marca (`width`), no en el ajuste: cambiar el ajuste después no reescala lo ya contado. Va en **puntos del PDF**, no en píxeles de pantalla, para que una burbuja puesta al 400% salga igual que una puesta al 50%. Las marcas anteriores no llevan `width` y se dibujan a los 18 pt de siempre; al reabrir, el diámetro se recupera del propio círculo descontando el borde (el rect de PyMuPDF lo incluye, y sin descontarlo la burbuja crecía 2 pt en cada guardado).

Highlight, underline, strike, nota, dibujo, texto, rect/círculo/línea/flecha/llamada, check/cruz/estrella/nube/polígono, sello, firma gráfica, imagen (resize/rotar/embed), redimensionado de trazos, polígonos, áreas, perímetros y firmas escalando sus puntos, conteo con categorías (desde el panel se renombra, recolorea o elimina la categoría completa: cada acción toca todas sus marcas en un paso de deshacer), mediciones (distancia/perímetro/área + snap + calibración **por documento o por página**: un juego mezcla escalas y calibrar una lámina no puede reescribir las cotas de las demás; se guarda en localStorage bajo la ruta **normalizada**, que con la ruta tal cual reabrir el plano desde recientes dejaba las cotas en píxeles y en un takeoff eso no se nota hasta que las cantidades salen mal). Trazo en puntos PDF. Revisión con autor/estado/replies. Capas (`layer`, default `Marcas`): el panel de Revisión mueve a una capa **lo que muestra el filtro** (un paso de deshacer) y apaga/prende capas en pantalla. Antes las capas eran solo un filtro de la lista: nada asignaba una y en el visor se dibujaban todas. Apagar es estado de vista: las marcas siguen en el documento y **el guardado nunca las excluye**. Al imprimir se puede elegir (por omisión se imprime lo que se ve: las capas apagadas se quedan fuera del papel). La impresión manda además la **orientación** (`esApaisado`, por mayoría de las páginas que van al papel, no del documento): Chromium imprime en vertical si no se le dice otra cosa, así que un juego de láminas apaisadas salía girado y encogido a una esquina del papel. XFDF ida y vuelta con autor, fecha, comentario (`contents` en cualquier tipo de marca), capa (`subject`), id (`name`, así reimportar no duplica), hilos de respuestas (`inreplyto`) y estado de revisión (`state`/`statemodel="Review"`, resuelto ↔ `Completed`). Lo único que no viaja son las imágenes: el estándar no embebe bitmaps de forma portable. Al abrir se importan las anotaciones nativas (Acrobat/Bluebeam) y las propias incrustadas. De las ajenas se leen del PDF relleno, opacidad, grosor y estilo de línea (no traen payload, y lo que no se importe se pierde al guardar). Al guardar, el motor **quita de la copia** las anotaciones de los tipos que el importador lee y redibuja la lista de la app: si no, una marca ajena se duplicaba en cada guardado (1→2→3) y borrarla no la sacaba del archivo. Formularios, enlaces, adjuntos y **sellos ajenos** no se tocan: el aspecto de un sello vive en su appearance stream y el motor no sabe reproducirlo, así que no se importa a la lista ni se borra al guardar. Tampoco la **tinta ajena de varios trazos**: el modelo tiene una lista de puntos por marca, así que importarla concatenaría los trazos (`[[A,B],[C,D]]` → `[[A,B,C,D]]`, con una línea espuria entre ellos). La propia sí se gestiona aunque sea multitrazo —una cruz son dos— porque su payload trae el tipo y la geometría reales. Como el visor no dibuja lo no gestionado (el bitmap se rasteriza sin anotaciones), al abrir se avisa cuántas trae el PDF: `PdfInfo.unmanaged_annots`. Si el PDF trae **solo** anotaciones ajenas, se añaden además las del sidecar viejo (fusión por id): son la única copia de las marcas del usuario y antes desaparecían.

### Formularios
Rellenar text, checkbox, combo **y radio**; crear, mover y borrar widgets (`/pdf/widgets`). Un campo con widgets en varias páginas se actualiza en todas (la apariencia se dibuja por widget y es lo que se imprime). Vaciar un campo de texto borra el /V y su apariencia: PyMuPDF ignora `field_value = ''`. No hay firmas PKCS.

### Edición de contenido
Editar texto/imagen existentes, find & replace (preserva fuente/tamaño/color y la línea base: el estilo se muestrea ANTES de redactar —después ya no hay span que consultar— y se inserta una vez por ocurrencia; antes se borraban todas las de la página y se escribía solo la primera), watermark, header/footer, redactar área o por coincidencia, metadatos, índice/TOC editable de verdad (añadir la página actual, **renombrar y borrar** cualquier entrada por su ruta en el árbol — antes solo se podía añadir, así que una entrada mal puesta o el índice de un PDF ajeno no había forma de quitarlos; borrar se lleva las subentradas, que en el TOC el nivel cuelga del padre). Todo lo que el motor **estampa** en la página (marca de agua, encabezado/pie, numeración, reemplazo de texto, resumen de marcas) pasa por `texto_estampable`: los tipos base solo cubren latin-1 y una raya «—», un «→» o un «✔» desaparecían sin aviso, así que se transliteran y lo demás cae en «?». Lo mismo en las marcas incrustadas (cuadro de texto, llamada, nota): la apariencia y el `content` van transliterados —PyMuPDF regenera la apariencia desde el `content`— y el texto exacto viaja en el payload `PM`, que es lo que la app lee al reabrir. Las rutas que redactan como paso intermedio para *editar* (reemplazar texto, editar span, mover imagen) van con `graphics=PDF_REDACT_LINE_ART_NONE` e `images=PDF_REDACT_IMAGE_NONE`: por omisión PyMuPDF borra el dibujo vectorial contenido en el rect (se llevaba el achurado del plano) y blanquea los píxeles de la imagen que toca (dejaba un rectángulo blanco al reemplazar texto sobre un escaneo). Las herramientas de redactar de verdad conservan los dos borrados: ahí es su trabajo. Watermark, header/footer y numeración aceptan **rango de páginas** (`1-5, 8`; vacío = todo el documento) — en un juego de 60 láminas sellar todo puede ser justo lo que no querés. El número de página sigue siendo el del documento, no el de la enésima sellada.

### OCR
Requiere Tesseract en PATH. Página actual o documento completo. `GET /pdf/ocr-available`.

### Export
Word, Excel (tablas con `find_tables`, si no hay tabla → líneas), PPT, TXT, HTML, página PNG, mediciones/conteos, resumen de marcas.

### IA
Anthropic vía main process (`safeStorage`). Presets: resumir marcas, pendientes, extraer tablas.

### Diagnóstico
Ajustes → Diagnóstico → Exportar deja un `.txt` con versiones (app, Electron, motor vía `/pdf/health`), si el motor responde, la operación en vuelo y la cola de `backend.log` / `backend.1.log`. Los logs viven en `%APPDATA%\pdf-master\logs` y nadie sabía que existían.

### Seguridad local
- Token Electron→motor cuando la app spawnea el backend. pytest / `python main.py` sin token siguen abiertos (loopback). Token equivocado = **403**, no 401: el 401 es «este PDF pide contraseña» y el visor lo trata como tal, así que hablarle a otro motor (otra instalación tomando el 8745) se veía en pantalla como «PDF protegido». El 403 dice que hay otro PDF Master en el puerto.
- Open exige `.pdf` y respeta `MAX_FILE_SIZE_MB` (500).
- `file:readBase64` solo imágenes locales absolutas existentes, con extensión permitida y tope de 50 MB.
- `shell.openPath` solo abre carpetas locales absolutas existentes; `showItemInFolder` exige una ruta local existente.
- Rutas de salida: absolutas, sin bytes nulos, extensión esperada y directorio existente (`_shared.py`).
- **API key de Anthropic:** cifrada con `safeStorage` (DPAPI) en userData. Si el cifrado NO está disponible **no se guarda** y el panel lo dice; antes caía a texto plano en `%APPDATA%` devolviendo `success: true`, o sea que el usuario pegaba su clave, la app decía que quedó guardada y quedaba legible para cualquier proceso del equipo.
- Firmas = polyline, no PAdES. Sin firma de código todavía: el CI ya tiene el cableado y firma en cuanto existan los secretos `WINDOWS_CERT_BASE64` / `WINDOWS_CERT_PASSWORD` (falta comprar el certificado), y además comprueba con `Get-AuthenticodeSignature` que la firma quedó aplicada, porque electron-builder no falla si no se aplicó.

---

## 5. API (`/pdf`)

Documentos: `open`, `create-blank`, `save`, `save-password`, `remove-password`, `close`, `dirty`, `info`, `merge`, `split`, `compress`, `images-to-pdf`, `health`  
Render: `page`, `page-image`, `raw`, `tile` (el visor usa pdfjs; `/tile` queda por si un cliente lo pide). Sin `thumbnail`: las miniaturas se rasterizan en el cliente con PDF.js — cada una tomaba el único lock de MuPDF, así que hojear el panel de páginas congelaba guardar, medir o buscar  
Páginas: `rotate`, `rotate-all`, `rotate-pages`, `delete-pages`, `reorder`, `crop`, `duplicate-page`, `insert-blank`  
Edición: `insert-image`, `transform-image`, `edit-text`, `replace-text`, `watermark`, `header-footer`, `redact`, `redact-matches`, `metadata`, `page-numbers`  
Marcas: `annotations` GET/POST, `embed`, `export-xfdf`, `import-xfdf`, `markup-summary`  
Lectura: `outline` GET/POST, `search`, `text`, `text-clip`, `spans`, `snap-points`, `compare-text`, `ocr`, `ocr-available`, `make-searchable`  
Formularios: `widgets` GET/POST  
Export: `export-word`, `export-excel`, `export-pptx`, `export-txt`, `export-html`, `export-measurements`. PowerPoint rasteriza con el mismo tope de píxeles que el visor (2000 px de lado largo) y encaja la lámina **centrada, sin deformarla**: a 150 dpi fijos un plano de 36×24 in salía a 5400×3600 px —7× más píxeles de los que la diapositiva muestra— y estirado al 4:3, que achata las cotas

---

## 6. Contratos que no se tocan

1. No reintroducir autoguardado.
2. No subir el threadpool de PyMuPDF.
3. No evictar docs dirty del LRU.
4. Sidecar solo en guardado manual.
5. Tras tocar Python: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q`. Y un endpoint nuevo se cubre: los 66 aparecen en tests, y los que escriben a disco prueban además que un rechazo NO deje archivo.
6. `pdf-engine.exe` no vuelve a git: lo compila el CI, y en local lo exige `verificar:motor`.
7. Un hook de gesto no lee estado mutable del closure (ver Arquitectura), y sus tests hacen VARIOS `mousemove`: con uno solo, una acumulación de deltas pasa en verde.
8. Un componente nuevo en `React.lazy` se abre en el e2e. Y una optimización de arranque se justifica con `medir:arranque`, no con el número que imprime vite.

---

## 7. Build

**`pdf-engine.exe` NO está en git.** 48 MB por revisión dejaron el repo en 705 MB con 74 commits, y la copia versionada se quedó en 1.14.2 mientras el producto iba en 1.22.0: un `build:win` local empaquetaba ese motor viejo sin un solo síntoma. Hay que compilarlo antes de empaquetar.

```powershell
cd backend
.\venv\Scripts\python.exe -m PyInstaller pdf-engine.spec --noconfirm --clean
Copy-Item dist\pdf-engine.exe ..\frontend\resources\backend\ -Force
cd ..\frontend
# bump version en package.json
npm run build:win    # typecheck + build + verificar:motor + NSIS
```

`npm run verificar:motor` (que `build:win` corre solo, y el CI también) **arranca el .exe en un puerto libre y le pregunta su versión por `/pdf/health`**. Mirar el tamaño solo detecta un binario truncado; esto detecta además el motor viejo, que es lo que pasaba de verdad.

CI (`.github/workflows/ci.yml`): pytest + typecheck + vitest + lint (tope de avisos, hoy 34: es un trinquete, cuando bajen el número baja con ellos) + **e2e**; antes de empaquetar corre `verificar:motor`; tag `v*` publica release. Authenticode en cuanto haya certificado (ver Seguridad local).

`.github/workflows/security.yml` (PR + semanal): `npm audit --audit-level=moderate` (era `high`, y así una CVE moderate real de `@vitest/mocker` pasó semanas en verde), `pip-audit` y CodeQL (TS + Python). Dependabot semanal para npm, pip y actions, con Electron y PyMuPDF fuera del salto mayor automático.

**Versiones:** `frontend/package.json` es la fuente. `versionSync.test.ts` ata la cabecera de este archivo y el changelog; `backend/tests/test_version.py` ata `ENGINE_VERSION` (el `version` que declara la API); el job de release ata el tag.

**El motor va empaquetado onedir, no onefile.** El onefile se descomprimía entero en `%TEMP%` en cada arranque (47 MB) y costaba ~1 s: el motor contesta `/pdf/health` en **692 ms** en vez de 1.746. PyInstaller deja `dist/pdf-engine/` y al empaquetar se copia su **CONTENIDO** a `resources/backend`, así que el motor sigue en `resources/backend/pdf-engine.exe` y el main no cambia de ruta — copiar la carpeta en vez de su contenido deja el exe un nivel más abajo y la app arranca sin motor. `verificar:motor` exige el exe **y** su `_internal/`. `upx` va en False: no está instalado (el True de antes no hacía nada) y en onedir cambiaría arranque por disco.

**Dónde está el arranque, medido.** ~1,5 s de Chromium hasta el primer pintado y ~0,9 s más hasta la página (chunk de pdfjs + parseo + rasterizado). El motor se lanza en paralelo con la ventana, así que con el disco caliente ya está vivo cuando el renderer pinta, y una vez vivo **todas** las peticiones de apertura suman 95 ms. Conclusión que costó dos intentos: ni el tamaño del bundle ni el arranque del motor son la palanca del arranque percibido. El onedir paga en «reiniciar el motor» (ahí el usuario espera), en frío, y en no escribir 47 MB en `%TEMP%` por apertura. Herramientas: `medir:arranque`, `medir:motor` (con `--venv` separa PyInstaller de los imports), `analizar:bundle`.

**Bundle y arranque.** El chunk de arranque del renderer son ~1.240 kB; `pdfjs` (854 kB) y nueve vistas/paneles que solo existen tras una acción del usuario van en chunks aparte (`import()` en `lib/pdfjs.ts`, `React.lazy` en `App.tsx`). Lo que se monta en el primer pintado —TopBar, Toolbar, ThumbnailPanel, Viewer, StatusBar— se queda estático a propósito: diferirlo cambia parsear por parpadear. `npm run analizar:bundle` dice de qué está hecho cada chunk (necesita `ANALIZAR_BUNDLE=1 npm run build`, que activa el sourcemap; sin la variable no se genera y no viaja al instalador), y `npm run medir:arranque` mide el arranque real y saca la mediana (`CON_DOC=0` para aislar el primer pintado del arranque del motor). **Dato medido, no estimado:** partir el bundle a la mitad movió el primer pintado ~25 ms de ~1.530. El arranque lo domina Chromium; el tamaño del chunk casi no participa, porque se lee de disco y V8 compila cuando se llama. Vale para memoria y para que los límites de chunk signifiquen algo, no como palanca de arranque.

**Optimizaciones de arranque descartadas con medición.** No volver a intentarlas sin datos nuevos: (1) precargar el chunk de pdfjs al montar no mueve nada, porque `getPdfDocument` ya lo pide con `Promise.all` junto al `/pdf/raw` y al abrir con un archivo el montaje y la apertura coinciden; (2) quitar el debounce de 350 ms de `useFileDrop` tampoco, porque `addDoc` ignora `activate: false` si no hay documento activo, así que la primera pestaña se activa sola al arrancar. **Y el método:** con la app instalada abierta al lado, el arranque medido deriva ~500 ms entre tandas — una tanda contra otra no prueba nada. `medir:arranque` acepta `MAIN_JS=out-a/main/index.js` para alternar dos builds sin reconstruir; medir interleaved o no medir.

**Banco de pruebas del renderer:** `npm run harness` construye y deja `out/renderer/harness.html`, que monta la interfaz REAL en un navegador con un `window.api` de mentira y un documento abierto. Existe porque el chrome no se puede mirar de otra forma —la app es Electron y los tests corren en jsdom, que no hace layout—, así que un desbordamiento que se pisa o un menú que no abre pasaban los 562 tests en verde. El stub vive en `design/harness/`.

**E2E:** `npm run e2e` (Playwright + Electron, `frontend/e2e/`) arranca la app construida con un PDF por línea de comandos, comprueba que el motor levanta y rasteriza, y **abre los paneles en diferido** (un `import()` que no resuelva en el renderer empaquetado no rompe el arranque: rompe el panel, y solo al abrirlo). **Corre en CI** (job `e2e`, que crea el venv del motor) y bloquea el release: estaba escrito y no corría, o sea que un motor que no arranca —token, puerto, ruta del exe— pasaba el CI entero en verde. Ya no se salta porque el 8745 esté tomado (para eso está el fallback, y así el e2e lo prueba de verdad); solo se salta si están tomados los ocho.

---

## 8. Limitaciones vigentes

| Tema | Estado |
|------|--------|
| OCR | Tesseract externo; no va en el instalador |
| Escáner | No implementado (WIA) |
| Firmas digitales | Solo dibujo |
| Vista continua | Lee, selecciona texto, busca y permite dibujar/mover/redimensionar marcas |
| Undo | Marcas y operaciones de página soportadas por stash del motor |
| OneDrive / colaboración | No |
| i18n | Español hardcodeado |
| macOS/Linux | Scripts existen; CI es Windows, y el motor solo se empaqueta para Windows |
| Disco instalado | ~94 MB de motor (onedir) contra ~47 del onefile: se cambió espacio por segundo de arranque |
| Code signing | Cableado en CI; falta el certificado (hasta entonces, SmartScreen avisa) |
| Mediciones | Visuales + export; embed parcial |
| XFDF | Sin imágenes |

---

## 9. Fuera de alcance (caro / infra externa)

Firmas PAdES/.pfx, escáner WIA, sync OneDrive/SharePoint, colaboración en tiempo real, i18n completo, Authenticode. El plan vivo está en el canvas de la sesión 2026-08-15.
