---
name: PDF Master
description: Chrome neutro de escritorio; el color lo ponen las marcas sobre el PDF.
colors:
  surface: "#f2f2f5"
  panel: "#ffffff"
  toolbar: "#ffffff"
  border: "#e8e8ec"
  border-strong: "#d6d6db"
  border-control: "#767680"
  fg: "#18181b"
  muted: "#636369"
  faint: "#8e8e96"
  accent: "#0a66d6"
  on-accent: "#ffffff"
  danger: "#af3a30"
  on-danger: "#ffffff"
  success: "#20744f"
  warning: "#96620f"
  info: "#2a5c96"
  hover: "#f0f0f3"
  active: "#e9e9ed"
  scrim: "#0c0c0e"
  on-scrim: "#ffffff"
  material: "#ffffff"
  paper: "#ffffff"
  paper-ink: "#18181b"
  paper-muted: "#636369"
  paper-guide: "#96620f"
  paper-ok: "#20744f"
  hit: "#c07cac"
  hit-active: "#70266e"
  diff-a: "#be584e"
  diff-b: "#284a8a"
  surface-dark: "#161618"
  panel-dark: "#202023"
  toolbar-dark: "#202023"
  border-dark: "#37373b"
  border-strong-dark: "#48484d"
  border-control-dark: "#80808a"
  fg-dark: "#ededf0"
  muted-dark: "#9a9aa2"
  faint-dark: "#76767e"
  accent-dark: "#5ca2ff"
  on-accent-dark: "#0c0e12"
  danger-dark: "#e28a82"
  on-danger-dark: "#1a1a1d"
  success-dark: "#7ac8a0"
  warning-dark: "#e0b064"
  info-dark: "#96bae2"
  hover-dark: "#2d2d31"
  active-dark: "#36363b"
  scrim-dark: "#020203"
  material-dark: "#222226"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  head:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.011em"
  base:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.006em"
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.38
    letterSpacing: "-0.003em"
  mini:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0em"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.006em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
rows:
  row: "40px"
  chrome: "44px"
  status: "32px"
motion:
  ease: "linear(0, 0.075 5%, 0.227 10%, 0.389 15%, 0.536 20%, 0.656 25%, 0.75 30%, 0.821 35%, 0.873 40%, 0.911 45%, 0.938 50%, 0.957 55%, 0.971 60%, 0.986 70%, 0.994 80%, 0.997 90%, 1)"
  easeBounce: "linear(0, 0.248 10%, 0.608 20%, 0.851 30%, 0.968 40%, 1.009 50%, 1.015 60%, 1.011 70%, 1.005 80%, 1.001 90%, 1)"
  easeOut: "cubic-bezier(0.32, 0.72, 0, 1)"
  instant: "90ms"
  fast: "150ms"
  base: "260ms"
  slow: "380ms"
material:
  alpha: 0.68
  blur: "30px"
  edgeAlpha: 0.65
  alphaDark: 0.72
  edgeAlphaDark: 0.10
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
    typography: "{typography.base}"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    filter: "brightness(1.1)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.fg}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    borderColor: "{colors.border-control}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
    typography: "{typography.base}"
  ribbon-tool:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  ribbon-tool-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    height: "32px"
  tab-active:
    backgroundColor: "{colors.toolbar}"
    textColor: "{colors.fg}"
    height: "32px"
    padding: "0 12px"
  tab-idle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    height: "32px"
    padding: "0 12px"
---

# Design System: PDF Master

## Overview

> **Migración en curso (v2).** Los TOKENS de este documento ya están en `App.css` y
> `tailwind.config.js`. Los COMPONENTES se están migrando superficie por superficie:
> hasta que cada uno se toque, sigue usando las alturas y los bordes viejos con los
> valores nuevos. La galería viva —con el contraste de cada par medido en la propia
> página— está en `frontend/design/gallery.html`.

**Creative North Star: "El instrumento callado"**

La interfaz está muda a propósito. El color, el peso y el drama viven en las marcas que el usuario pone sobre el PDF, no en el chrome. Lo que cambió en v2 es el material, no la voz: el chrome pasa de franja opaca a vidrio con el documento pasando por debajo, y de tres tokens de línea a separación por tono y por hueco.

La personalidad es de archivo, no de marketing. Una sola familia de sistema (San Francisco / Segoe UI Variable), semánticos apagados, y un solo azul de sistema reservado al estado activo.

Rechazos confirmados por el código: verdes y rojos saturados de Tailwind como estados; el acento como color de letra sobre el chrome; tipografía display de marca; motion que ignore «reducir movimiento».

**Key Characteristics:**

- Chrome neutro; el documento y las marcas cargan el color
- Un azul de sistema (`accent`) que solo existe como relleno, nunca como letra
- Filas de 40px y barras de 44px: densidad de herramienta con aire de app, no de planilla
- Profundidad por tono y por material; la sombra empieza por un contorno de medio píxel
- Cuatro planos: material (chrome), panel, lámina (`paper-*`) y marcas del usuario
- Resorte crítico como curva por defecto; el rebote se reserva a lo que traía inercia
- Motion y transparencia se atenúan —no se apagan— con las preferencias del sistema

## Colors

Neutros de sistema (grises sin temperatura), un azul de sistema y semánticos desaturados para no competir con el markup. En oscuro el chrome es grafito, no azul marino: un chrome con temperatura propia le discute el color al documento.

### Primary

- **Azul de sistema** (`accent`, `#0a66d6`): herramienta activa, toggle encendido, foco y selección. **Siempre relleno** con `on-accent` encima. Es un color propio y no la tinta del texto: un estado activo en negro sólido no se distingue de la tipografía. Es un paso más profundo que el `#007AFF` de Apple **a propósito**: ese da 4.06:1 con blanco encima y aquí hay etiquetas de 11–13px sobre relleno; este da 5.41:1. En oscuro invierte polaridad —azul claro (`accent-dark`) con tinta oscura (`on-accent-dark`) encima— porque el azul medio con blanco daba 4.20:1.

### Neutral

- **Papel del chrome** (`panel` / `toolbar`): barras, paneles y diálogos.
- **Mesa** (`surface`): área del documento, un paso más gris que el chrome, para que la lámina flote.
- **Bordes**: `border` es hairline decorativo entre elementos del mismo plano; `border-strong` es separación estructural (chrome ↔ documento); `border-control` es el contorno de un control.
- **Secundario** (`muted`): hints, iconos en reposo, atajos, placeholders. Cumple AA sobre panel (5.97:1).
- **Terciario** (`faint`): **no es texto**. Separadores, glifos deshabilitados, iconos apagados. Se mide contra 3:1, no contra 4.5:1; una etiqueta que caiga aquí está mal puesta.
- **Hover / Elevado** (`hover`, `active`): estado de control y superficie elevada (kbd, chips, filas). En oscuro `hover` pesa MENOS que `active`, igual que en claro.

En oscuro el documento se hunde a `surface-dark` y el chrome sube a `panel-dark`.

### El plano de la lámina

Tercer plano, entre el chrome y las marcas: chrome que se dibuja **encima** del papel. `paper` es la lámina (blanco a propósito, no un `bg-white` olvidado), y `paper-ink` / `paper-muted` / `paper-guide` / `paper-ok` son lo que se pinta sobre ella. **No se redefinen en oscuro**: el papel no invierte, así que un token de chrome ahí desaparece (la guía de calibración con `warning-dark` queda a 1.99:1 sobre blanco).

`hit` / `hit-active` son las coincidencias de búsqueda y `diff-a` / `diff-b` los tintes de comparar revisiones. Son chrome, no marcas: viven fuera de la paleta de anotación a propósito.

### Named Rules

**The Markup Owns Color Rule.** El chrome no introduce color de marca. El color saturado pertenece a las anotaciones del usuario. El único color del chrome es el estado.

**The Accent-Is-Fill Rule.** `accent` existe **solo como relleno**, siempre con `on-accent` encima. Nunca como color de letra ni de icono sobre el chrome, y nunca como decoración (un icono de panel no se pinta de accent «para que se vea»).

**The On-Color Rule.** Todo relleno de estado tiene su token de encima: `accent`→`on-accent`, `danger`→`on-danger`, `scrim`→`on-scrim`. `text-white` sobre un semántico está prohibido: en oscuro `danger` es un salmón claro y el blanco cae a 2.56:1. `on-scrim` es claro en los DOS temas porque el scrim es oscuro en los dos —`on-accent` no sirve ahí, que invierte.

**The Paper Plane Rule.** Si algo se dibuja encima de la lámina, usa `paper-*`, no el token de chrome equivalente. Los tokens de chrome invierten con el tema y el papel no.

**The Quiet Semantic Rule.** Peligro, éxito, aviso e info van apagados. No usar la paleta viva de Tailwind.

**The Tertiary-Is-Not-Text Rule.** `faint` existe para lo que no se lee: separadores, iconos apagados, un glifo deshabilitado. Cualquier cosa que el usuario tenga que leer —placeholder incluido— va en `muted`.

## Materials

El chrome es vidrio, no una franja opaca: `.material` (fondo del token `material` a 0.68 / 0.72 de alfa + `blur(30px) saturate(180%)`) con el documento pasando por debajo.

- **`.material-edge`** pone el filo de luz de arriba (`inset 0 0.5px 0`). No es un borde —el borde separa— sino el grosor del vidrio: es lo que lo hace leer como lámina y no como un color plano.
- **`.scroll-edge`** es lo que va donde el contenido se mete bajo el chrome flotante: un degradado corto en vez de la línea de 1px. La raya corta el documento; el degradado lo deja pasar.
- **Nunca vidrio sobre vidrio.** Un menú translúcido encima de una barra translúcida no se lee. El menú es material; la barra debajo, en ese caso, no.

**The Reduced-Transparency Rule.** Con `prefers-reduced-transparency: reduce` el material se vuelve sólido y el blur cae a 0. La legibilidad manda sobre el efecto, y se resuelve en el token, no en cada componente.

**The One Signal Rule.** Un canal de color = un significado. El relleno accent es «activo»; el estado sucio va en `warning` y como texto, no como relleno; y una barra no lleva un color permanente que le robe el canal al que sí necesita atención.

## Typography

**Display Font:** ninguna. No hay display de marca.
**Body Font:** stack de sistema (Segoe UI / San Francisco, con Roboto / Helvetica / Arial)
**Label/Mono Font:** la misma familia; números en `tabular-nums` (zoom, páginas, medidas, `kbd`)

**Character:** una sola sans de UI, escala apretada de seis tamaños. Jerarquía por peso, tamaño e interlineado como conjunto, no subiendo píxeles.

### Hierarchy

Cada tamaño trae su tracking y su interlineado: **el tracking es específico por tamaño**, negativo al crecer y positivo al encogerse.

- **Display** (600, 20px, 1.2, −0.02em): título de modal, de pantalla vacía y de pantalla de error.
- **Head** (600, 15px, 1.3, −0.011em): cabecera de panel y de diálogo. Sin este peldaño, un título de panel solo podía ser cuerpo en negrita o el display de 20px.
- **Base** (400, 14px, 1.45, −0.006em): botones primarios, cuerpo de modal, campos.
- **UI** (400, 13px, 1.38, −0.003em): pestañas de documento, items de menú, controles.
- **Mini** (400, 12px, 1.35, 0): etiquetas de campo, hints, status.
- **Micro** (500, 11px, 1.3, +0.006em): piso de lectura diaria — captions, kbd, contadores. Sube a peso 500 porque a 11px el 400 se deshilacha.
- **Versalita de sección** (600, 11px, `tracking-section` = 0.06em): MARCADO, VISTA, ARCHIVOS. Es la única que abre el tracking de verdad: en mayúsculas apretadas no se lee.

### Named Rules

**The One Face Rule.** No se agrega una display ni una mono «técnica» de adorno. Mono solo si el contenido es código; los números van con `tabular-nums` sobre la sans.

**The Eleven-Pixel Floor.** Nada operativo baja de 11px. Y nada operativo sube fuera de la escala: `text-lg`, `text-xl` y `text-2xl` no existen en este sistema.

**The Tracking-By-Size Rule.** Un solo `letter-spacing` para toda la app está mal en algún tamaño. El tracking vive en la escala (`fontSize`), no escrito a mano en el componente: lo grande se aprieta, lo pequeño se abre.

## Layout

Escritorio de ventana fija, no landing. Columnas: riel 44px, panel lateral 224px (320–360px en revisión, conteo y AI), visor flexible. Filas: top bar 40px, cinta de modos 36px, fila de tools 44px, status 32px.

Las cuatro filas del chrome comparten un solo eje izquierdo a 8px (`px-2`). La pantalla vacía se centra a `max-w-3xl` con `space-y-6`. No hay tipografía fluida ni breakpoints de marketing.

### Named Rules

**The Single Axis Rule.** Todo lo que se apila verticalmente en el chrome arranca en la misma x. Reservar ancho para los botones de ventana en una fila que no los tiene desalinea las demás.

## Elevation & Depth

Híbrido tonal. El documento (`surface`) está un paso más bajo que el chrome (`panel`). Las sombras son estructurales y raras, y **empiezan por un contorno de medio píxel**: en claro es lo que separa de verdad una capa de la de abajo, y es lo que sustituye al borde de 1px en reposo. Después viene la difusión larga y suave.

### Shadow Vocabulary

Cada nivel es una distancia real al plano de abajo:

- **`shadow-token-sm`**: chips y campos.
- **`shadow-token-md`**: menús y popovers.
- **`shadow-token-lg`**: modales y hojas.
- **`shadow-page`**: la lámina de PDF sobre la mesa — corta y difusa, como papel sobre el escritorio.
- **`--shadow-drop`**: exclusivo para `filter: drop-shadow()`, que acepta UNA sombra sin radio de expansión. Los `--shadow-*` son listas de dos y ahí se descartan enteros.

Todos tienen desplazamiento; en oscuro suben de opacidad en vez de cambiar de receta.

### Named Rules

**The Tonal Layer Rule.** Primero se cambia el fondo (surface / panel / hover / active). La sombra aparece cuando una capa se escapa del flujo (menú, modal, toast, lámina), no en cada fila y nunca en un control que sigue en el flujo.

**The Scrim Rule.** Una sola opacidad para atenuar la app detrás de una capa: `rgb(var(--scrim) / 0.45)`. Un rol no tiene tres opacidades. Excepción documentada en el sitio: sobre la lámina blanca, 0.45 no alcanza 4.5:1 y el chip sube a 0.72.

### Z-Index

Escala por rol, de abajo arriba: `raised` (10) · `canvas` (20) · `float` (30) · `sticky` (40) · `dropdown` / `presentation` (50) · `overlay` (60) · `overlay-menu` (61) · `modal` (70) · `dialog` (90) · `sheet` (93) · `palette` (94) · `prompt` (95) · `toast` (100) · `tooltip` (110). Un `z-[93]` a mano es un rol que falta, no un número que falta.

## Shapes

Esquinas de herramienta, no de marca. Cinco radios por ROL y ninguna excepción: `rounded-token-xs` (6px) chip, kbd y badge; `rounded-token-sm` (8px) botón de icono y campo pequeño; `rounded-token` (10px) botón, fila y campo; `rounded-token-lg` (14px) panel, menú y popover; `rounded-token-xl` (20px) modal y hoja.

Tres no llegaban: el mismo valor servía para un `kbd` de 18px y para un modal de 500. Un radio a mano (`rounded-[9px]`) es un rol que falta, no un número que falta.

Separadores verticales `w-px h-4`. Sin recortes diagonales, sin neobrutalismo.

## Motion

La curva por defecto (`--ease`) es un **resorte crítico** (damping 1.0, response 0.35 s) muestreado en `linear()`: sale rápido, se posa y no rebota. Es nativo de Chromium, así que el sistema no arrastra ninguna librería de animación.

Cuatro duraciones: `instant` 90ms (la respuesta al press: se siente, no se ve), `fast` 150ms (color, hover, salidas), `base` 260ms (entradas y colapsos), `slow` 380ms.

`--ease-bounce` (damping 0.8, 1.5% de sobrepaso) es para lo que **traía inercia**: un panel que se arrastró, una marca que se soltó. En un menú que solo apareció, sobra. `--ease-out` es la curva de salida de las hojas.

- **Entradas de capa:** `overlay-in` para el scrim, `panel-in` para el panel.
- **Salidas de capa:** `overlay-out` / `panel-out` con `data-closing` y una guarda de reentrada. Una capa que desmonta en un frame se siente barata; una acción no espera a su salida.
- **La paleta de comandos no anima la entrada.** Es una acción de teclado: instantánea.
- **Tooltips en ráfaga:** el primero cobra el retardo, los siguientes salen instantáneos mientras el usuario sigue leyendo etiquetas.
- **Toasts:** el hueco se cierra con la fila de grid (`1fr → 0fr`), no desaparece de golpe.
- **Progreso indeterminado recorre**, no parpadea en el sitio; el determinado avanza en `linear`.

### Named Rules

**The Reduced-Motion Is Less, Not None Rule.** Con la preferencia activa se cortan los `transform` y se conservan los fades de color y opacidad a 120ms. Los indicadores de progreso **siguen girando**: un spinner congelado se lee como app colgada. Lo que anima por SMIL (`<animate>`) no lo alcanza la regla CSS y consulta la preferencia a mano.

**The Keyboard Is Instant Rule.** Lo que el usuario dispara con el teclado y repite decenas de veces al día no se anima.

**The Press Is The Feedback Rule.** La respuesta va en el `pointerdown`, no en el `click`: `active:scale-[0.97]` a 90ms. Esperar al release para acusar la pulsación es lo que hace que un control se sienta muerto.

**The Bounce Needs Momentum Rule.** El sobrepaso solo se gana con inercia previa. Un rebote en algo que apareció sin que el usuario lo empujara se lee como adorno.

## Components

Controles reprimidos y precisos: compactos, hover gris, sin teatro. La cinta es icono + etiqueta; los iconos solos llevan nombre accesible.

Los patrones compartidos viven en `components/panelUi.tsx` (`PanelHeader`, `EmptyState`, `SegmentedGroup`, `FieldLabel`, `ControlGroup`, `PageActions`, `iconBtn`, `rowSelected`). Un segmented control implementado tres veces es un componente que falta.

### Buttons

- **Shape:** 7px (`rounded-token`)
- **Primary:** relleno `accent`, texto `on-accent`, padding `6px 16px`, hover por `brightness`
- **Ghost:** texto `fg` o `muted`, hover `hover`
- **Danger:** relleno `danger`, texto `on-danger`
- **Focus:** `outline: 2px solid accent`, offset −2px, solo `:focus-visible`
- **Disabled:** `opacity-40`
- **Pulsación:** `active:scale-[0.97]` en superficies muy usadas; todo lo pulsable acusa la pulsación

### Chips

- **Style:** fondo `active`, texto `muted`, radio 5px (kbd, chips de herramienta)
- **State:** la herramienta activa no es chip: es botón primary (relleno accent)

### Cards / Containers

- **Corner Style:** 12px en recientes, modales y hojas
- **Background:** `panel` sobre `surface`; la lámina es `paper`
- **Shadow Strategy:** ver Elevation; las tarjetas de recientes son borde, no sombra
- **Border:** 1px `border`
- **Internal Padding:** 8–16px

### Inputs / Fields

- **Style:** fondo `surface`, borde 1px `border-control`, radio 7px, 14px
- **Nunca `bg-panel`:** es el mismo valor que `toolbar`, así que el campo desaparece
- **Focus:** outline accent, sin glow
- **Widgets de formulario PDF:** overlay semitransparente `info`; foco sobre la lámina en `paper` + `paper-ink`; anuncian el nombre del campo

### Panels

- **Header:** 36px (`h-9`), título `micro` en mayúsculas con `tracking-wider` y `text-muted`, acciones `p-1.5` con iconos de 14px. Los dos lados del visor alinean su línea inferior.
- **Estado vacío:** icono de 18px `muted` + texto `mini` `muted`, centrado en el alto disponible. Sustituye al contenedor con scroll, no vive dentro de él.
- **Selección de fila:** `bg-active` + `border-accent`. Un solo lenguaje en todos los paneles.
- **Listas:** padding `p-2`, filas `py-1.5 min-h-7`, iconos de acción de 14px con `p-1.5`.

### Navigation

- **Top bar** 40px, zona de arrastre de ventana; utilidades a la derecha como chips de 32px
- **Cinta:** tablist a la izquierda (Leer / Comentar / …), subrayado accent de 2px en el modo activo; tools en la fila de 44px
- **Riel** 44px, `aria-pressed`
- **Pestaña de documento:** lógica tonal de navegador — activa al plano de la barra (`toolbar` + borde), inactivas hundidas a `surface`. **Sin subrayado accent**: ese eje ya lo usan los modos de cinta, una fila más abajo, y dos subrayados idénticos en filas contiguas no son jerarquía

### Status de guardado

Texto, no un punto. Sucio: **Sin guardar · Ctrl+S** en `warning`. Guardando / Guardado con icono. El punto de la pestaña es secundario.

## Do's and Don'ts

### Do:

- **Do** tratar `accent` como relleno y solo como relleno, con su `on-accent`.
- **Do** usar `paper-*` para lo que se dibuja encima de la lámina.
- **Do** usar la escala `micro` → `mini` → `ui` → `base` → `head` → `display` (11 / 12 / 13 / 14 / 15 / 20), con su tracking incluido.
- **Do** usar `.material` + `.material-edge` para el chrome flotante, y `.scroll-edge` donde el contenido se le mete debajo.
- **Do** poner `tabular-nums` en zoom, página, medidas y `kbd`.
- **Do** dejar los indicadores de progreso girando con «reducir movimiento» activo.
- **Do** reutilizar `panelUi.tsx` antes de escribir un header o un vacío nuevo.
- **Do** nombrar todo control solo-icono (`aria-label`).

### Don't:

- **Don't** pintar el chrome con color de marca o semánticos saturados de Tailwind.
- **Don't** usar `accent` como color de letra o de icono decorativo.
- **Don't** poner `text-white` sobre un semántico: usa su token `on-*`.
- **Don't** usar `bg-panel` en un campo: es el color de la barra y lo vuelve invisible.
- **Don't** agregar una fuente display o una mono «técnica» de adorno, ni tamaños fuera de la escala.
- **Don't** poner sombra en un control que sigue en el flujo, ni sombra de halo a 0px de offset.
- **Don't** apilar material sobre material: un menú translúcido sobre una barra translúcida no se lee.
- **Don't** escribir `letter-spacing` a mano: vive en la escala tipográfica.
- **Don't** usar `faint` para algo que haya que leer.
- **Don't** cambiar el ancho de un control al activarse (`font-medium` en el estado activo recorre la fila entera).
- **Don't** declarar un `hover:` después del estado activo: al pasar el ratón se pierde el activo.
- **Don't** definir subcomponentes dentro del cuerpo de otro componente: se recrean por render y los campos pierden el foco al teclear.
- **Don't** esconder el cierre de la pestaña activa ni el estado sucio en un punto sin texto en el status.
- **Don't** inventar un look de landing (cards métricas, kickers, gradiente en el texto).
