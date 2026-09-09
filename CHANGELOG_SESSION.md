# Registro de Cambios — Sesiones de Desarrollo

Changelog canónico en este archivo. Detalle técnico: `DOCUMENTATION.md`.

---

## Sesión 2026-09-09 — v1.23.0

**Auditoría del proyecto, arreglada entera.** Casi nada de esto cambia lo que la app hace; cambia lo que pasa cuando algo va mal. Con una excepción, que resultó ser un bug de verdad:

- **Arrastrar UNA marca la mandaba lejos del cursor.** Los listeners del gesto viven en `window` y el efecto solo se re-suscribe al empezar y terminar el arrastre, así que leía la marca del render en que arrancó: su `x` se quedaba clavada en la del mousedown y `moveAnnotations` aplica DELTAS, o sea que el delta se acumulaba. Cinco pasos de 50 px dejaban la marca 500 px más allá — crece cuadráticamente con el largo del arrastre. El grupo (dos o más seleccionadas) no lo tenía, porque lleva su propio `lastX/lastY` en un ref. Los dos tests que había hacían UN solo mousemove, que es el único caso en que no se ve; ahora hay uno con varios. Salió de tomarse en serio un aviso de `exhaustive-deps` en vez de silenciarlo.
- **Y un casi-bug al arreglarlo, que quedó documentado en el código:** el redimensionado parece el mismo caso pero es el contrario. `geometriaRedimensionada` escala los `points` con un factor **acumulado desde la caja de origen**, así que necesita la marca *como estaba al empezar el gesto*; pasarle la viva dispara el trazo (un +100 px en cuatro pasos llevaba un punto de 300 a 756). Esa foto ahora se toma explícita en vez de depender de que el closure quede viejo, y hay un test que lo fija en las dos páginas.

- **El motor sale de git.** `pdf-engine.exe` son 48 MB por revisión: 15 revisiones dejaron el repo en **705 MB con 74 commits**. Y peor que el peso: la copia versionada se quedó en **1.14.2** mientras el producto iba en 1.22.0, así que un `npm run build:win` local empaquetaba un motor ocho versiones viejo y ningún síntoma hasta que algo fallaba en la máquina de otro. Ahora `npm run verificar:motor` **arranca el .exe y le pregunta su versión por `/pdf/health`** antes de empaquetar (mirar el tamaño solo detecta un binario truncado, no uno viejo), y corre solo en `build:win` y en el CI. Nota: el histórico sigue pesando lo que pesa — limpiarlo pide reescribir la historia, y eso es una decisión aparte.
- **El puerto 8745 ya no es un punto único de fallo.** Si lo tenía un programa ajeno, el motor no bindeaba y la app quedaba abierta y se moría al abrir el primer PDF, con una sola línea en el log como explicación. Ahora se prueba el 8745 y, si está tomado, el motor se muda al siguiente libre del rango (8 puertos); el elegido viaja al renderer por `api:config` junto con el token. Si están los ocho tomados, sale un aviso en pantalla con el rango en vez del silencio. Probado con el e2e sobre un 8745 realmente ocupado: la app se fue al 8746 y rasterizó.
- **Un tropiezo pidiendo el token dejaba la sesión rota para siempre.** `apiFetch` cacheaba con `apiToken === null`, así que un fallo transitorio guardaba el token vacío y **todas** las llamadas siguientes se iban sin él: 403 en todo, sin forma de recuperarse salvo reiniciar. Ahora solo se cachea la respuesta buena.
- **La API key de Anthropic ya no cae a texto plano en silencio.** Sin `safeStorage` disponible se escribía la clave sin cifrar en `%APPDATA%` **devolviendo `success: true`**: el usuario la pegaba, la app decía que quedó guardada, y quedaba legible para cualquier proceso del equipo. Ahora se niega y el panel dice por qué (que además arregla un `saveKey` que se comía el fallo y no hacía nada visible).
- **`sandbox: true`.** El `sandbox: false` no hacía falta: el preload solo importa de `electron`. Validado con el e2e real, no con un typecheck.
- **Cerrar un documento suelta su memoria.** `close_document` vaciaba documentos y contraseñas pero no los cachés: quedaban hasta 150 bitmaps y 60 mallas de snap del documento cerrado hasta que el LRU los desplazara.
- **El e2e deja de ser decorativo.** Estaba escrito y no corría en el pipeline, o sea que un motor que no arranca —token, puerto, ruta del exe— pasaba el CI entero en verde. Ahora corre en CI y bloquea el release.
- **`npm audit` baja a `moderate`.** Con el umbral en `high`, una CVE real de `@vitest/mocker` (path traversal) estuvo semanas en verde. Arreglada y el árbol a cero.
- **Firma de código cableada.** El CI firma en cuanto existan los secretos `WINDOWS_CERT_BASE64` / `WINDOWS_CERT_PASSWORD`, y comprueba con `Get-AuthenticodeSignature` que la firma quedó aplicada (electron-builder no falla si no se aplicó). Falta comprar el certificado: hasta entonces SmartScreen sigue avisando en cada instalación.
- **El PDF que se arrastra a la ventana.** Se traducía a mano (`replace('file:///','')` + `decodeURI`): eso dejaba fuera las rutas UNC —planos en un recurso compartido, o sea la mitad de los casos en obra— y no abría un «Lámina #3.pdf», porque `decodeURI` no decodifica `%23`. Ahora es `fileURLToPath`.
- **La búsqueda en todos los documentos deja de duplicar `runBatch`.** Era una copia a mano del recorrido con progreso y cancelación, y la copia ya se había desincronizado una vez. Las dos usan `correrLote`.
- **Endurecidos los otros tres hooks de gesto** (girar, redimensionar en la página derecha, y el propio arrastre): `useZoomUpgrade` reemplaza el bitmap 250 ms después de un cambio de zoom, así que el `pageData` del closure podía quedar viejo a media faena y la conversión de píxeles a puntos usaba la escala anterior. Ahora los props que pueden cambiar durante el gesto se leen de un ref vivo y el estado por `getState()`. `useRotateAnnotation` y `useRightPageResize` no tenían ni un test: ahora tienen 13.
- **Tests donde no había ninguno: 566 → 684.** El visor (1200 líneas) y la cinta (990) no tenían ni uno; tampoco los atajos de teclado, el pan/zoom, el registro de la paleta ni —lo que más importa— `closeDocument` + `unsavedPrompt`, que es la única ruta por la que se puede perder una mañana de marcas. Backend 215 → 228. Y `enginePort.test.ts` ata la CSP al rango de puertos, que si no se desincronizan sin síntoma visible; `svgPoint.test.ts` cubre la conversión px↔pt que comparten los cuatro hooks de gesto y de la que dependen todos.
- **El bundle del renderer: 2.220 kB → 1.242 kB de arranque (−44 %), y el arranque casi no se movió.** pdfjs eran 833 kB (38 % del chunk) y hasta que hay un documento no se usa: pasa a `import()` dinámico, pedido en paralelo con el `/pdf/raw`. Otras nueve vistas y paneles que solo existen tras una acción del usuario (comparar, continuo, presentar, asistente, paleta, ajustes, atajos, sellos, organizar) pasan a `React.lazy`. **Medido en la app real, mediana de cinco arranques sin documento y dos tandas de cada:** primer pintado de React 1539/1554 ms antes → 1526/1525 ms después. O sea **~25 ms de 1.530**, un 1,6 %: consistente (las cuatro tandas ordenan igual) pero pequeño, porque el chunk se lee de disco y V8 compila las funciones cuando se llaman, no al parsear. El grueso del arranque es Chromium, no nuestro JS. Se queda por lo que sí da —854 kB que no se cargan nunca si no se abre un PDF, y límites de chunk que significan algo— pero **no es la palanca de arranque que yo dije que era.**
- **El motor pasa a onedir: arranca en 692 ms en vez de 1.746 (−60 %).** El `onefile` de PyInstaller se descomprimía entero en `%TEMP%` en CADA arranque —47 MB, escritos y leídos otra vez, con el antivirus mirando— y eso era un segundo de los 1,75 que tardaba en contestar `/pdf/health`. En onedir no hay nada que descomprimir. Medido con `npm run medir:motor`, cinco arranques, y comprobado también desde el paquete de electron-builder (758 ms). De paso: el `upx=True` del spec era **decorativo**, UPX no está instalado ni acá ni en el runner, así que PyInstaller lo saltaba en silencio (el build pesa lo mismo con y sin); ahora dice `upx=False` y explica por qué no interesa activarlo.
- **Pero el arranque de la app tampoco se movió, y esta vez sé por qué.** La página sigue tardando ~2,4 s en aparecer: el motor se lanza en paralelo con la creación de la ventana, así que a los 1,5 s —cuando el renderer pinta— ya estaba vivo desde antes. Y medido pieza por pieza, **después de que el motor está vivo TODAS las peticiones de apertura suman 95 ms** (`/pdf/open` 25, `/pdf/raw` 11, spans 11, widgets 34, marcas 7, esquema 7). O sea que el motor nunca estaba en el camino crítico con el disco caliente. Donde sí paga: **«reiniciar el motor»**, que ahí el usuario espera de verdad; el **arranque en frío**, con la caché de disco vacía y Defender escaneando los 47 MB recién escritos en `%TEMP%`; y no volver a escribir esos 47 MB en cada apertura. El precio es el disco instalado: 47 → 94 MB (el instalador NSIS comprime, así que la descarga apenas cambia).
- **Dónde está el arranque, ya con números:** ~1,5 s de Chromium hasta el primer pintado, y ~0,9 s más hasta la página, que son el chunk de pdfjs + parsear el PDF + rasterizar la lámina. Ni el tamaño del bundle ni el arranque del motor eran la palanca; las dos veces lo predije mal y la medición lo corrigió.
- **Dos herramientas para no volver a adivinar:** `npm run analizar:bundle` atribuye los bytes del chunk a cada fuente decodificando el sourcemap (sin dependencias nuevas; el sourcemap solo se genera con `ANALIZAR_BUNDLE=1`, no viaja al instalador), y `npm run medir:arranque` mide el arranque en la app real y saca la mediana, y `npm run medir:motor` cronometra el motor desde el lanzamiento hasta `/pdf/health` (con `--venv` para comparar contra el de desarrollo y así separar PyInstaller de los imports de Python). La conclusión de arriba sale de la segunda, no de mirar el número de vite.
- **Los nueve paneles en diferido se abren en el e2e.** Un `import()` que no resuelva en el renderer empaquetado no rompe el arranque: rompe el panel, y solo cuando alguien lo abre. Los tests de jsdom no lo ven porque ahí no hay chunks.
- **Dos optimizaciones de arranque probadas, medidas y DESCARTADAS.** Se dejan escritas para que nadie las vuelva a intentar a ciegas:
  - **Precargar el chunk de pdfjs al montar la app** (en `requestIdleCallback` y también inmediato). A/B alternando dos builds, tres rondas de tres arranques: los pares salen iguales (Δ +1, +29, −8 ms) mientras la deriva entre rondas es de ~500 ms. La premisa era falsa: `getPdfDocument` ya pide el chunk con `Promise.all([pdfjs(), /pdf/raw])`, así que nunca estuvo en serie detrás de la apertura, y al abrir con un archivo por línea de comandos el montaje y la apertura pasan casi a la vez — no hay hueco de inactividad que aprovechar.
  - **Quitar el debounce de 350 ms de `useFileDrop`** para el primer archivo de la ráfaga. Parecía 350 ms en el camino crítico, porque `usePageLoader` solo rasteriza el documento ACTIVO. Medido: nada. El motivo es que `addDoc` ignora `activate: false` cuando no hay ningún documento activo (`activeDocId: (activate === false && state.activeDocId !== null) ? ... : doc.doc_id`), o sea que al arrancar la primera pestaña se activa sola y el debounce solo cuenta cuando ya había un documento abierto.
- **Y una lección de método, que costó más que las dos anteriores.** Las primeras mediciones de la precarga daban +600 ms y hasta +1.855 ms, y estuve a punto de reportarlas como efectos: eran la máquina. Con PDF Master instalado abierto al lado (cuatro ventanas, dos motores, uno con 679 MB y 18 s de CPU), el arranque medido se mueve ~500 ms entre tandas separadas por minutos. Desde ahora `medir:arranque` acepta `MAIN_JS=...` para medir dos builds alternándose sin reconstruir entre tandas, que es lo único que hace comparable un A/B cuando la máquina deriva. **Una tanda contra otra tanda no vale; hay que interleavear.**
- **Los 66 endpoints del motor ya aparecen en tests (backend 215 → 260).** Nueve no los tocaba nada, y tres de ellos escriben en el disco del usuario: `create-blank`, `images-to-pdf` y `export-html`; otros dos cambian la geometría de las páginas (`rotate-all`, `rotate-pages`); el resto son lectura (`tile`, `text-clip`, `stash-document`, `ocr-available`). Lo que se fija no es el 200: es que una ruta relativa o una extensión que no toca se rechacen **sin escribir nada**, que un lote de imágenes con una mala no deje un PDF a medias, que rotar unas páginas no toque las demás, y que un índice fuera de rango no tumbe el proceso —que se llevaría por delante las marcas sin guardar de todas las pestañas—.
- **`annotationRender.tsx`, 559 líneas y ni un test, ahora 57.** Es el módulo del que dependen a la vez lo que se dibuja y lo que se puede **agarrar**: `getAnnotationBounds` es lo que usan la caja de selección, la barra de propiedades y el arrastre para saber qué marca hay bajo el cursor, así que a un tipo al que le falte su `case` se le ve la marca y no se la puede seleccionar ni mover (ya pasó con las cotas, las áreas y las firmas). Quedan fijados los 20 tipos, el centrado de la burbuja de conteo, la normalización de las cajas negativas, el mínimo interactivo de una cota de alto cero, y que el clic de una marca corte la propagación.
- **`DrawPreview` mentía, y era la causa de dos `any`.** Estaba declarado como `Partial<Annotation> & { type?: ... | 'textselect' | ... }`, y una intersección de objetos interseca sus PROPIEDADES: `type` se quedaba en `Annotation['type']` y los valores extra nunca formaron parte del tipo. De ahí que el visor comparara con `(drawPreview as any).type` para poder mirar un valor que sí existe en ejecución. Ahora es `Omit<..., 'type'> &` y los `as any` sobran.
- **Avisos de lint: 49 → 34, y arreglados de verdad, no silenciados.** Los siete `any` fuera (los cinco de `ThumbnailPanel` eran `catch (err: any)` + `err.message`, que además decía «Error: undefined» cuando lo lanzado no era un `Error`: ahora pasan por `mensajeDeError`), las dos expresiones dentro de un array de dependencias extraídas a variables, y dos deps que son referencias estables —una acción del store y un setter de `useState`— añadidas, que eso es gratis. Los 34 que quedan son deps estrechas a propósito y **no** llevan `eslint-disable`: con `--max-warnings 34` un aviso nuevo ya rompe el CI, así que zurcirlos con 34 comentarios compraría claridad, no seguridad.
- **Lo que se miró y se deja como está:** el threadpool de un solo worker serializa el motor entero, y es correcto — MuPDF no es thread-safe y la alternativa es un access violation.
- Menores: `dev.ps1` sondea `/pdf/health` en vez de esperar un 422 de `POST /pdf/open`; el README pedía Node 18 cuando Vite 7 necesita 20+; el aviso del 403 nombra el puerto real y no el 8745 de siempre; y las propiedades ilegibles de una marca ajena (relleno, opacidad, borde) dejan una línea en `debug` en vez de perderse en silencio al guardar.

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
