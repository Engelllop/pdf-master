# UI Loop — progreso (PDF Master)

Loop de mejora visual con agentes en paralelo. Cada iteracion: lee este log,
elige lo siguiente sin repetir, aplica, corre `npm run typecheck:web` en frontend/,
y anota abajo.

Skills en rotacion: impeccable, redesign-skill, taste-skill, emil-design-eng.

## Reglas
- Respetar los tokens de DESIGN.md; no inventar paleta nueva.
- Los audits son read-only; solo el orquestador escribe (evita conflictos).
- Tooltip.tsx usa LF; el resto de los archivos CRLF. Cuidado al parchear.

## Iteracion 1 — 09/02/2026 — APLICADO (movimiento / emil-design-eng)
- App.css: `prefers-reduced-motion` ya no congela spinners ni skeleton; transicion
  limitada a opacidad/color a 120ms (los transform se cortan). Nuevos keyframes
  `progreso-indet` y `tooltip-fade`.
- CommandPalette.tsx: fuera `panel-in` (accion de teclado = instantanea) y fuera
  `transition-colors` de las filas (la seleccion por flechas se arrastraba).
- Tooltip.tsx: modo rafaga — con un tooltip ya abierto los siguientes salen sin los
  200ms de retardo y sin fade; gracia de 300ms. Entrada con fade de 110ms.
- ProgressBar.tsx: barra indeterminada RECORRE (antes parpadeaba en el sitio),
  width con `ease-linear`, y el aviso entra con `toast-pop`.
- UnsavedDialog.tsx: `transition-opacity` -> `transition-[filter,transform]` (se
  transicionaba una propiedad que no cambiaba) + `active:scale`.
- FloatingSelectionBar.tsx: `active:scale-[0.97]` en los ~20 botones, curva del
  sistema en el swatch de color.
- typecheck:web limpio.

### Pendiente de esa auditoria
- P3: la pila de toasts salta al morir uno (wrapper grid `1fr -> 0fr` 180ms +
  subir el timer de usePdfStore.ts:1634 de 120 a 180).
- Fuera del top 8: CommandPalette / SettingsModal / UnsavedDialog animan la entrada
  pero desmontan sin salida (necesitan `data-closing` + `overlay-out`/`panel-out`).

## Cola para la iteracion 2 — shell (impeccable), ya auditado, sin aplicar
- P1 Toolbar.tsx:892-896 + ribbon/RibbonTabs.tsx:60-61,90 — cuatro filas sin eje
  izquierdo comun; los `w-[140px]` de RibbonTabs son espacio muerto (los botones de
  ventana solo ocupan los 40px de arriba) y descentran el tablist.
- P1 RibbonTabs.tsx:37-38 — "sin guardar" usa `bg-accent`, el mismo relleno que
  "herramienta activa": dos gramaticas en la misma paleta. Pasar a `text-warning`.
- P1 TabStrip.tsx:88-97 vs RibbonTabs.tsx:85 — el mismo subrayado accent marca dos
  ejes de seleccion distintos en filas contiguas. Pestanas a logica tonal.
- P1 Toolbar.tsx:892 — tres reglas horizontales en ~115px; quitar `border-t`.
- P1 StatusBar.tsx:64 — `text-success` permanente le roba el canal al
  `text-warning` de "sin calibrar".
- P2 StatusBar.tsx:45 (targets 22px) y TabStrip.tsx:105-112 (cierre 16px) contra los
  32-40px de DESIGN.md:124.
- P2 Toolbar.tsx:390 — la herramienta activa suma `shadow-token-sm` (contra la Tonal
  Layer Rule) y `font-medium`, que le cambia el ancho y recorre la fila.
- P2 TopBar.tsx:15,44 — utilidades como losas de 40px sin radio; toggle de paginas
  como bloque azul a sangre.
- DECISION PENDIENTE: DESIGN.md:5 declara `accent = ink #1f2329` y prohibe azul en el
  chrome, pero App.css:20 define `--accent: 30 92 168` (azul). Hay que decidir cual
  gana antes de tocar la doctrina "activo = relleno".

## Cola para la iteracion 3 — paneles (redesign-skill), ya auditado, sin aplicar
- P1 headers divergentes: ThumbnailPanel.tsx:354-358/376-381 duplicados (~33px) vs
  AIPanel.tsx:233-241 (`h-10`, sin uppercase): la linea inferior queda desalineada
  7px a los lados del visor. Extraer `PanelHeader` a `h-9`.
- P1 AIPanel.tsx:21,24-38 — `useState(false)` + `aiHasKey()` async = flash del
  onboarding de la key en cada apertura. Pasar a `boolean | null` + skeleton.
- P1 estados vacios: cuatro dialectos (ThumbnailPanel.tsx:361/493/507/535,
  CountPanel.tsx:106-114, ReviewPanel.tsx:191-197) y el early return de
  ReviewPanel.tsx:101 deja la rama de :195 como codigo muerto rompiendo el flex-col
  del padre. Extraer `EmptyState`.
- P2 el mismo segmented control tres veces (AIPanel.tsx:196-205,
  ReviewPanel.tsx:154-163, PropertiesBar.tsx:62-77) y `Label`/`Group`/`Segmented`
  definidos DENTRO del cuerpo de PropertiesBar: se recrean por render y los inputs
  numericos pierden el foco al teclear. Sacarlos a un modulo compartido.
- P2 tres lenguajes de seleccion de fila; ThumbnailPanel.tsx:522-526 usa
  `bg-black/5 dark:bg-white/10` crudo en vez de `--active`.
- P2 CountPanel.tsx:130 `sticky top-[37px]` es un numero magico derivado a mano de la
  barra de totales; sacarla del scroll como hermano `shrink-0`.
- P2 cuatro paddings de lista distintos -> unificar a `p-2`.
- P2 las mismas seis acciones de pagina en dos presentaciones
  (ThumbnailPanel.tsx:459-476 vs PageOrganizer.tsx:251-256). Extraer `PageActions`.
- P3 iconos de accion de fila mezclan 12/14/16px y dan targets de 20px;
  PropertiesBar pone campos en `bg-panel` (invisible: `--panel` == `--toolbar`)
  cuando el resto de la app usa `bg-surface`; tres anchos de panel (224/320/360)
  para dos roles.

## Iteracion 1b — 09/02/2026 — APLICADO (contraste / taste-skill)
- App.css: en oscuro se invirtio la polaridad del accent (`125 176 245` con
  `--on-accent: 11 16 27`): la pareja anterior daba 4.20:1 con etiquetas de 11-13px.
- App.css: nuevo token `--on-danger` (claro `255 255 255`, oscuro `26 34 50`) +
  `on-danger` en tailwind.config.js. `text-white` sobre el `--danger` salmon de
  oscuro daba 2.56:1. Aplicado en viewer/FormFieldsLayer.tsx:103 (tambien
  `shadow` pelado -> `shadow-token-sm`) y FormModal.tsx:126.
- App.css: `--hover` y `--active` de oscuro estaban invertidos respecto a claro
  (hover pesaba mas que la superficie elevada). Ahora `38 48 66` / `42 53 72`.
- App.css: la seleccion de texto del PDF usaba `rgba(59,130,246,.35)` crudo ->
  `rgb(var(--accent) / 0.35)`.
- CountPanel.tsx inkOnTint(): luminancia sin corregir gamma devolvia `text-white`
  sobre #3b82f6 (3.68:1) en chips de 11px. Ahora linealiza y usa umbral 0.179.
- typecheck:web limpio.

## Cola para la iteracion 4 — sistema visual (taste-skill), sin aplicar
- P1 DESIGN.md:4-19 describe OTRO sistema que App.css:11-52: `ink #1f2329` con
  `accent == ink` contra el `--accent` azul real, radios 4/8 contra 5/7/12, y los 15
  neutros difieren 2-8 unidades. Regenerar el front-matter desde `:root`/`html.dark`
  y reescribir las reglas 148-152 y 213. MISMA decision pendiente que la del shell.
- P2 App.css:16-17 — `--border` da 1.30:1 contra panel (WCAG 1.4.11 pide 3:1 en
  controles) y los inputs en `bg-surface` no tienen frontera. Anadir
  `--border-control` (`134 142 154` claro / `104 116 134` oscuro) solo para inputs,
  selects y checkboxes; `--border` se queda como hairline decorativo.
- P2 tailwind.config.js:51-56 — la escala solo define 11/12/13/14 pero hay
  `text-2xl` (ErrorBoundary.tsx:29), `text-xl` (viewer/ViewerEmptyState.tsx:62) y
  `text-lg` (Viewer.tsx:1129) fuera de escala, y falta el headline de 20px de
  DESIGN.md:164. Anadir `display: ['20px','1.25']`.
- P3 tres scrims para el mismo rol (`bg-black/40`, `/45`, `/50`), `--shadow` es
  identico a `--shadow-md` y `shadow-token` no se usa nunca, y hay `shadow` pelado
  de Tailwind en RotatePreview.tsx:52. Crear `--scrim: 15 23 42`, borrar
  `--shadow`/`shadow-token`, y fijar disabled a 40% en DESIGN.md:214 (hay 21
  `disabled:opacity-40` contra el 30% que dice el doc).
- Colores hardcodeados pendientes (chrome disfrazado de contenido): Viewer.tsx:757
  `#94a3b8` -> `--muted`; Viewer.tsx:820-833 `#22c55e`/`#10b981` -> `--success`;
  viewer/annotationRender.tsx:186-191,265 `#f59e0b` -> `--warning` y
  `rgba(15,23,42,.9)` -> `--panel/0.92`; viewer/SearchHits.tsx:25-27 `#f97316`/
  `#fbbf24` -> tokens `--hit-active`/`--hit`; ComparisonView.tsx:15-16 `#ff2222`/
  `#2244ff` -> `--diff-a`/`--diff-b` desaturados; viewer/FormFieldsLayer.tsx:25,215
  `focus:bg-white text-black` -> `focus:bg-panel text-fg`; ContinuousView.tsx:884 y
  las lupas de Viewer.tsx:783-786 / ContinuousView.tsx:574-577 -> `--scrim`;
  viewer/NoteBubble.tsx:109 drop-shadow crudo -> `--shadow-sm`;
  MultiSelectionBar.tsx:33 derivar el gradiente de `COLORS` de PropertiesBar.tsx:17.
- Defaults de anotacion fuera del swatch de PropertiesBar.tsx:17: `#22d3ee` (10 usos
  en annotationRender), `#8b5cf6`, `#f59e0b`, `#22c55e` (StampSignatureManager).
  Centralizar en un `DEFAULT_TINT` por tipo. Y PropertiesBar.tsx:17 aun lleva
  `#1f2329` (el ink extinto) y `#ffffff` (markup invisible sobre la hoja).
- Los ~10 `bg-white` que representan la hoja son legitimos por doctrina, pero
  conviene un `--paper: 255 255 255` igual en ambos temas para distinguir "papel a
  proposito" de "blanco olvidado".

## Iteracion 2 — 09/02/2026 — CERRADA
Tres agentes aplicando en paralelo con scopes de archivo DISJUNTOS (no invadir):
- Agente A (shell): Toolbar.tsx, ribbon/RibbonTabs.tsx, TabStrip.tsx, StatusBar.tsx, TopBar.tsx
- Agente B (paneles): ThumbnailPanel, AIPanel, CountPanel, ReviewPanel, PropertiesBar,
  PageOrganizer + nuevo modulo compartido de UI de panel
- Agente C (tokens/color): App.css, tailwind.config.js, Viewer.tsx, annotationRender.tsx,
  SearchHits.tsx, ComparisonView.tsx, NoteBubble.tsx, MultiSelectionBar.tsx,
  FormFieldsLayer.tsx, ContinuousView.tsx, ErrorBoundary.tsx, ViewerEmptyState.tsx,
  RotatePreview.tsx, PresentationView.tsx + scrims de los modales

Cerrada: typecheck (node+web) limpio, 523/523 tests, `electron-vite build` OK y las
nuevas utilidades verificadas en el CSS emitido (Tailwind no purgo ninguna).

DECISION PENDIENTE (bloquea la doctrina de accent, preguntada al usuario, sin
respuesta): DESIGN.md:5 dice `accent = ink #1f2329` y prohibe azul en el chrome;
App.css define azul. Ningun agente debe cambiar el valor de `--accent` ni la regla
"activo = relleno" hasta que se decida.

### Iteracion 2 · Agente A (shell) — APLICADO, typecheck:web limpio
- RibbonTabs.tsx:48-83 — tablist al frente, `flex-1` de relleno en 83, cluster de
  guardar/imprimir/deshacer al final, `w-[140px]` muerto borrado.
- Toolbar.tsx:892-893 — grid `1fr auto 1fr` + div fantasma -> flex `justify-between`;
  tools a `justify-start`; `shrink-0` al cluster de busqueda (ya no tiene columna
  propia); `border-t` fuera.
- Toolbar.tsx:390,397 — herramienta activa sin `shadow-token-sm` ni `font-medium`
  (ya no recorre la fila al activarse); `Sep` a `h-4`.
- RibbonTabs.tsx:39 — estado sucio a `text-warning hover:bg-hover` (deja de competir
  con "herramienta activa").
- TabStrip.tsx:88-97 — pestana activa a logica tonal, subrayado accent eliminado
  (queda exclusivo de los modos de cinta). :104,109 cierre a 24px.
  :132 EXTRA — el boton "Ir a pestana..." tenia el `hover:bg-hover` DESPUES del
  accent, asi que al hover se volvia gris estando abierto. Arreglado.
- StatusBar.tsx:48,64,45,124 — `px-2`, escala de medicion a `text-muted`, `iconBtn`
  a 28px, separador con `mx-1`.
- TopBar.tsx:15,28,44 — utilidades y toggle de paginas como chips de 32px.

Decisiones del agente A que quedan abiertas:
- FileMenu ("Archivo") NO se movio al cluster derecho: contradice la
  recognoscibilidad Office/Acrobat que declara DESIGN.md. Se dejo como grupo
  `shrink-0` en el eje izquierdo.
- StatusBar.tsx:113 — el `text-success` de "Guardado" sigue ahi. Es transitorio, no
  permanente como la escala de medicion. Si la regla es "un solo canal de color en la
  barra", hay que decidirlo aparte.
- Sin pase visual en Electron: App.css y tailwind.config.js estaban a medio editar
  por el agente C.

### Iteracion 2 · Agente C (tokens/color) — APLICADO
- App.css: `--border-control`, `--scrim` + `--on-scrim`, y un bloque nuevo **"Plano de
  la hoja"** (`--paper`, `--paper-ink`, `--paper-muted`, `--paper-guide`, `--paper-ok`,
  `--hit`, `--hit-active`, `--diff-a`, `--diff-b`) definido solo en `:root`: la lamina
  es blanca en los dos temas. `--shadow` borrado (era identico a `--shadow-md`) y
  `--shadow-drop` nuevo para `drop-shadow()`.
- tailwind.config.js: `border-control`, `paper`, `paper-ink`, `on-scrim`,
  `display: ['20px','1.25']`; entrada `shadow-token` eliminada (no se usaba).
- Scrim unificado a `bg-[rgb(var(--scrim)/0.45)]` en los 8 overlays.
- Tokenizados los colores crudos de chrome en Viewer, ContinuousView,
  annotationRender, SearchHits, ComparisonView, FormFieldsLayer, NoteBubble,
  RotatePreview. Intactas las marcas del usuario (siluetas de sello, redactar,
  firma, tintes de anotacion).
- Tests de SearchHits y ComparisonView ajustados (fijaban el hex).

Hallazgos del agente C que corrigieron el encargo (vale la pena recordarlos):
- `drop-shadow()` acepta UNA sombra sin spread, asi que `--shadow-sm` (lista de dos)
  se descartaba entero. De ahi `--shadow-drop`.
- El `--border-control` propuesto (134 142 154) daba 2.74:1 contra `bg-surface`, que
  es justo el caso del hallazgo. Quedo en 124 132 144 -> 3.13.
- `--on-accent` no sirve sobre el scrim: en oscuro es TINTA, asi que el numero de
  pagina y las lupas quedaban invisibles. De ahi `--on-scrim`.
- Tokenizar los colores de la hoja a `--muted`/`--success`/`--warning` los borraba en
  tema oscuro (2.66 / 2.01 / 1.99:1) porque el papel no invierte. Ese es el motivo
  del plano `--paper-*`: es el tercer plano que la doctrina implicaba y no tenia
  nombre.
- El chip de pagina de ContinuousView va a 0.72 de scrim: a 0.45 es imposible llegar
  a 4.5:1 sobre papel.
- `--hit`/`--hit-active` son ciruela, no ambar: el `#fbbf24` de antes era exactamente
  el color por defecto de las marcas del usuario, que era la colision reportada.

### Iteracion 2 · Agente B (paneles) — APLICADO
- **panelUi.tsx** (nuevo): `PanelHeader`, `EmptyState`, `SegmentedGroup`, `FieldLabel`,
  `ControlGroup`, `PageActions` + constantes `iconBtn` / `iconBtnDanger` /
  `rowSelected` (`bg-active border-accent`) / `rowIdle`.
- PropertiesBar: `Label`/`Group`/`Segmented` fuera del cuerpo del componente — era el
  BUG de foco (se recreaban por render y React remontaba los `input[number]`). Los 5
  campos pasan de `bg-panel` (invisible) a `bg-surface`.
- AIPanel: `hasKey` a `boolean | null` + skeleton; fuera el flash del onboarding en
  cada apertura. Header a `PanelHeader`, `Sparkles` a `text-muted`, Contexto a
  `SegmentedGroup`.
- ThumbnailPanel: los dos headers duplicados a `PanelHeader`; `EmptyState` en los
  cuatro vacios; fila de resultado a `rowSelected`/`rowIdle` (fuera el
  `bg-black/5 dark:bg-white/10`); iconos a 14px/`p-1.5`, filas `py-1.5 min-h-7`.
- ReviewPanel: borrado el early return que hacia inalcanzable su propio estado vacio y
  rompia el `flex-col` del padre (dejaba el panel sin filtros ni pie).
- CountPanel: la barra de totales sale del scroll como hermano `shrink-0` y las
  cabeceras vuelven a `sticky top-0` (fuera el `top-[37px]` magico).
- Las seis acciones de pagina son un solo `PageActions` (denso en la barra flotante,
  etiqueta en `sr-only`).

CAMBIO DE COMPORTAMIENTO a revisar: en la busqueda de ThumbnailPanel, si no hay
resultados en el doc activo pero si en otros, ahora se ve SOLO la seccion "En otros
documentos" (antes salian las dos cosas).

### Iteracion 2 · Orquestador
- TabStrip.test.tsx: el test fijaba el subrayado accent que el agente A retiro a
  proposito. Reescrito sobre el invariante real (la activa comparte plano con la barra,
  las inactivas se hunden a la mesa), no sobre el mecanismo.
- `bg-white` -> `bg-paper` en ThumbnailPanel, PageOrganizer y FileMenu (los que
  quedaron fuera del scope del agente C).
- `COLORS` exportado desde PropertiesBar y el gradiente de MultiSelectionBar derivado
  de ahi (antes repetia tres hexes a mano); su swatch usa ya la curva del sistema.

## Cola para la iteracion 3
1. DECISION DEL USUARIO, sigue pendiente y bloquea lo demas: DESIGN.md:5 dice
   `accent = ink #1f2329` y prohibe azul en el chrome; App.css define azul. Manda el
   doc o manda el codigo? De eso depende regenerar el front-matter de DESIGN.md
   (radios 4/8 vs 5/7/12, los 15 neutros que difieren 2-8 unidades, y las reglas
   148-152 y 213 que hablan de un "anillo 2px ink" que el codigo pinta en accent).
2. DESIGN.md no documenta nada del plano `--paper-*`, ni `--scrim`/`--on-scrim`, ni
   `--border-control`, ni `display`. Hay que anadirlos cuando se resuelva el punto 1.
3. Salidas de overlay: CommandPalette, SettingsModal y UnsavedDialog animan la entrada
   pero desmontan sin salida (necesitan `data-closing` + `overlay-out`/`panel-out` de
   120ms antes de desmontar).
4. La pila de toasts salta al morir uno: wrapper grid `1fr -> 0fr` 180ms y subir el
   timer de usePdfStore.ts:1634 de 120 a 180.
5. StatusBar.tsx:113 — decidir si el `text-success` transitorio de "Guardado" se queda
   o la barra tiene un solo canal de color.
6. PropertiesBar.tsx:18 — `COLORS` aun lleva `#1f2329` (el ink extinto de DESIGN.md) y
   `#ffffff`, que es markup invisible sobre la hoja. Quitarlos cambia los swatches que
   ve el usuario, asi que conviene preguntarlo.
7. Pase visual real: nada de esto se ha visto corriendo. Es Electron, no se previsualiza
   en el navegador; hay que arrancar la app (`dev.ps1`) y mirar claro y oscuro.

## Iteracion 3 — 09/02/2026 — CORTADA A MEDIAS (limite de sesion, 429)
Los puntos 1, 2, 5 y 6 de la cola siguen BLOQUEADOS esperando la decision del usuario
sobre accent/DESIGN.md. Se atacan el 3 y el 4, y se auditan dos zonas que nunca se
han mirado: la familia de dialogos y la superficie del documento.

Scopes DISJUNTOS (no invadir):
- Agente A (movimiento): App.css, Toasts.tsx, store/usePdfStore.ts, CommandPalette.tsx,
  SettingsModal.tsx, UnsavedDialog.tsx
- Agente B (dialogos): PrintDialog.tsx, ShortcutsModal.tsx, StampSignatureManager.tsx,
  FormModal.tsx, FileMenu.tsx, CalibrationBanner.tsx, RotatePreview.tsx
- Agente C (lienzo): Viewer.tsx, ContinuousView.tsx, ComparisonView.tsx,
  PresentationView.tsx, DetailTile.tsx, viewer/ViewerEmptyState.tsx,
  viewer/NoteBubble.tsx, viewer/MultiSelectionBar.tsx, viewer/SearchHits.tsx,
  viewer/annotationRender.tsx, viewer/FormFieldsLayer.tsx

App.css es EXCLUSIVO del agente A en esta iteracion; B y C piden tokens en su entrega
en vez de tocarlo.

### Que paso
Los tres agentes murieron por limite de sesion (HTTP 429) sin entregar informe. Lo que
habian escrito en disco SE QUEDO. El loop de cron se cancelo (job a61eaddc) y el
orquestador estabilizo el arbol.

Estado verificado despues de estabilizar: typecheck (node+web) limpio, 523/523 tests,
`electron-vite build` OK.

### Agente A (movimiento) — COMPLETO, aunque no informo
Verificado en el codigo, no en su reporte:
- App.css: keyframes `overlay-out` y `panel-out` + clases `.overlay-out`/`.panel-out`
  con `forwards`; `.toast-slot` con `grid-template-rows: 1fr` que transiciona a `0fr`
  en `var(--dur)` (y su `min-height: 0`, que es lo que deja el minimo automatico de la
  fila en 0 para que `0fr` funcione de verdad).
- CommandPalette, SettingsModal y UnsavedDialog: patron de salida con `cerrando`
  (ref, para que no se dispare dos veces) + `data-closing`, y guardas en los caminos
  de Escape / clic en el fondo / ejecutar comando.
- Toasts.tsx: contenedor a `grid` sin `gap` (el hueco lo cierra el slot al salir).
- usePdfStore.ts:1637 — el timer de borrado subio de 120 a 180ms para cuadrar con la
  transicion de alto.
- UnsavedDialog.test.tsx tocado (adaptado al cierre diferido).

### Agente B (dialogos) — PARCIAL, sin informe
Toco PrintDialog.tsx, ShortcutsModal.tsx, StampSignatureManager.tsx, FormModal.tsx y
panelUi.tsx. NO llego a FileMenu.tsx ni CalibrationBanner.tsx ni RotatePreview.tsx.
Los cambios estan sin revisar y sin enumerar: nadie sabe que problema decia arreglar
cada uno. Murio escribiendo el cuerpo de StampSignatureManager, asi que ESE es el
archivo con mas riesgo de haber quedado a medias.

### Agente C (lienzo) — CASI SIN EMPEZAR, sin informe
Solo llego a viewer/FormFieldsLayer.tsx (decia estar arreglando un bug de
`pointer-events`, nunca dijo cual) y a dejar en SearchHits.tsx una funcion
`latidoPermitido()` SIN CABLEAR — rompia el typecheck. El orquestador la cableo: el
latido de la coincidencia actual es SMIL (`<animate>`), y a eso no le llega la regla de
`prefers-reduced-motion` de App.css, asi que ahora se consulta la preferencia a mano.
Los otros 9 archivos de su lista (Viewer, ContinuousView, ComparisonView,
PresentationView, DetailTile, ViewerEmptyState, NoteBubble, MultiSelectionBar,
annotationRender) NO se auditaron: siguen como los dejo la iteracion 2.

### Cola para cuando se reanude
0. PRIMERO: revisar a mano el diff de PrintDialog, ShortcutsModal,
   StampSignatureManager, FormModal, panelUi y viewer/FormFieldsLayer. Estan verdes de
   typecheck y tests, pero nadie los reviso.
1. DECISION DEL USUARIO, sigue pendiente: DESIGN.md:5 dice `accent = ink #1f2329` y
   prohibe azul en el chrome; App.css define azul. Bloquea regenerar el front-matter
   del doc (radios, los 15 neutros, reglas 148-152 y 213).
2. DESIGN.md no documenta `--paper-*`, `--scrim`/`--on-scrim`, `--border-control`,
   `--shadow-drop`, `display`, ni las clases `.overlay-out`/`.panel-out`/`.toast-slot`.
3. Auditar el lienzo (los 9 archivos que el agente C no llego a tocar) y terminar los
   dialogos (FileMenu, CalibrationBanner, RotatePreview).
4. StatusBar.tsx:113 — decidir si el `text-success` transitorio de "Guardado" se queda.
5. PropertiesBar.tsx:18 — `COLORS` aun lleva `#1f2329` (ink extinto) y `#ffffff`
   (markup invisible sobre la hoja). Quitarlos cambia los swatches del usuario.
6. Pase visual real: nada de las tres iteraciones se ha visto corriendo. Es Electron,
   no se previsualiza en el navegador; hay que arrancar con `dev.ps1` y mirar claro y
   oscuro.
7. Revisar el cambio de comportamiento de la iteracion 2: en la busqueda de
   ThumbnailPanel, si no hay resultados en el doc activo pero si en otros, ahora se ve
   SOLO la seccion "En otros documentos".

## Cierre — 09/02/2026 — v1.19.0 publicada
DECISION DEL USUARIO: **manda el codigo**, no DESIGN.md. Con eso se desbloquearon los
puntos 1 y 2 de la cola.

- DESIGN.md regenerado desde App.css y tailwind.config.js: front-matter con los 48
  colores reales (claro + oscuro), la escala de 5 tamanos, los 3 radios, el bloque
  `motion`, y los componentes con sus valores de verdad (`button-primary` es accent,
  no ink; `tab-active` es toolbar, no surface; `input` lleva `border-control`).
- Reglas reescritas: **The Accent-Is-Fill Rule** ya no dice que accent e ink son la
  misma tinta; foco es `outline 2px accent offset -2px` (decia "anillo 2px ink");
  disabled es 40% (decia 30%); el scrim es 0.45 (decia `bg-black/50`); los radios son
  5/7/12 (decia canonico 8 con una excepcion de 16 que ya no existe).
- Reglas NUEVAS documentadas: The On-Color Rule, The Paper Plane Rule, The One Signal
  Rule, The Single Axis Rule, The Scrim Rule, The Reduced-Motion Is Less Not None
  Rule, The Keyboard Is Instant Rule. Mas las secciones de Motion y Z-Index, que no
  existian.
- Los "Don't" ahora incluyen los tres patrones de bug que este loop encontro de
  verdad: `hover:` despues del estado activo, subcomponentes dentro del cuerpo de otro
  componente, y cambiar el ancho de un control al activarse.

### Lint: el gate estaba a punto de bloquear la release
`npm run lint -- --max-warnings 60` daba 63. En vez de subir el tope se arreglaron los
tres avisos que el loop habia introducido:
- UnsavedDialog.tsx:82 — `eslint-disable` que ya no tapaba nada.
- AIPanel.tsx:52 — `conversations[convKey] || []` devolvia un array nuevo por render,
  asi que el efecto del scroll corria en CADA render, no al llegar un mensaje. A
  `useMemo`. (Era un defecto real, no un aviso cosmetico.)
- viewer/FormFieldsLayer.tsx:165 — las deps tenian `onTransform`, que el efecto no
  usa, y les faltaba `confirmDelete`. Pasa por ref.
Quedo en 60 exactos.

### Publicacion
Alcance elegido por el usuario: **todo el arbol**, incluido su trabajo en vuelo del
iman de snap (snapPoints.ts nuevo, useAnnotationDraw, useFormFields, counts.ts,
_pdf_render.py, main/index.ts). `.claude/` se dejo FUERA del commit a proposito.

Gates locales antes de taggear (los cuatro que corre CI):
- pytest backend: 204 passed
- typecheck (node + web): limpio
- vitest: 523/523
- lint: 60 avisos, 0 errores

Commit 8002cf2 en main + tag v1.19.0 empujados. CI publica el release desde el tag.

### Lo que sigue pendiente y NO se hizo
1. Pase visual real. NADA de las tres iteraciones se ha visto corriendo. Es Electron,
   no se previsualiza en navegador: hay que arrancar con `dev.ps1` y mirar claro y
   oscuro. Se publico sin eso.
2. Los 6 archivos que los agentes muertos dejaron sin revisar ni enumerar
   (PrintDialog, ShortcutsModal, StampSignatureManager, FormModal, panelUi,
   viewer/FormFieldsLayer): verdes de typecheck y tests, pero nadie los leyo.
3. Auditar el lienzo: Viewer, ContinuousView, ComparisonView, PresentationView,
   DetailTile, ViewerEmptyState, NoteBubble, MultiSelectionBar, annotationRender. El
   agente C de la iteracion 3 no llego.
4. Terminar los dialogos: FileMenu, CalibrationBanner, RotatePreview.
5. Cambio de comportamiento sin revisar: en la busqueda de ThumbnailPanel, si no hay
   resultados en el doc activo pero si en otros, ahora se ve SOLO "En otros
   documentos".
6. StatusBar.tsx:113 — el `text-success` transitorio de "Guardado".
7. PropertiesBar.tsx:18 — `COLORS` aun lleva `#1f2329` (el ink extinto) y `#ffffff`
   (markup invisible sobre la hoja).
