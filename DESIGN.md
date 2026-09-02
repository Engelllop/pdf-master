---
name: PDF Master
description: Chrome neutro de escritorio; el color lo ponen las marcas sobre el PDF.
colors:
  surface: "#e7eaef"
  panel: "#ffffff"
  toolbar: "#ffffff"
  border: "#dfe2e8"
  border-strong: "#c8ced7"
  border-control: "#7c8490"
  fg: "#1b1f25"
  muted: "#5c6570"
  accent: "#1e5ca8"
  on-accent: "#ffffff"
  danger: "#9e3d36"
  on-danger: "#ffffff"
  success: "#2f694a"
  warning: "#8c5e14"
  info: "#33547a"
  hover: "#eceef2"
  active: "#e3e7ed"
  scrim: "#0f172a"
  on-scrim: "#ffffff"
  paper: "#ffffff"
  paper-ink: "#1b1f25"
  paper-muted: "#5c6570"
  paper-guide: "#8c5e14"
  paper-ok: "#2f694a"
  hit: "#c07cac"
  hit-active: "#70266e"
  diff-a: "#be584e"
  diff-b: "#284a8a"
  surface-dark: "#0b101b"
  panel-dark: "#1a2232"
  toolbar-dark: "#1a2232"
  border-dark: "#303c4f"
  border-strong-dark: "#425168"
  border-control-dark: "#687486"
  fg-dark: "#e2e8f0"
  muted-dark: "#92a0b3"
  accent-dark: "#7db0f5"
  on-accent-dark: "#0b101b"
  danger-dark: "#e28a82"
  on-danger-dark: "#1a2232"
  success-dark: "#86c4a2"
  warning-dark: "#e0b064"
  info-dark: "#96bae2"
  hover-dark: "#263042"
  active-dark: "#2a3548"
  scrim-dark: "#020610"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  base:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  mini:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "5px"
  md: "7px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
motion:
  ease: "cubic-bezier(0.22, 1, 0.36, 1)"
  fast: "120ms"
  base: "180ms"
  slow: "260ms"
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

**Creative North Star: "El instrumento callado"**

La interfaz está muda a propósito. El color, el peso y el drama viven en las marcas que el usuario pone sobre el PDF, no en el chrome. Barras, riel y diálogos son un instrumento de escritorio Windows: denso, familiar, sin disfraz de producto web.

La personalidad es de archivo, no de marketing. Una sola familia de sistema (Segoe / San Francisco), semánticos apagados, y un solo azul de trabajo reservado al estado activo.

Rechazos confirmados por el código: verdes y rojos saturados de Tailwind como estados; el acento como color de letra sobre el chrome; tipografía display de marca; motion que ignore «reducir movimiento».

**Key Characteristics:**

- Chrome neutro; el documento y las marcas cargan el color
- Un azul de trabajo (`accent`) que solo existe como relleno, nunca como letra
- Densidad de herramienta: filas de 32–40px, tipo 11–14px
- Profundidad por tono (surface vs panel), no por teatro de sombras
- Tres planos: chrome, lámina (`paper-*`) y marcas del usuario
- Motion corto, una curva, se atenúa —no se apaga— con `prefers-reduced-motion`

## Colors

Paleta de taller: grises fríos, un azul de trabajo y semánticos desaturados para no competir con el markup.

### Primary

- **Azul de trabajo** (`accent`): herramienta activa, toggle encendido, foco y selección. **Siempre relleno** con `on-accent` encima. Es un color propio y no la tinta del texto: un estado activo en negro sólido no se distingue de la tipografía. En oscuro invierte polaridad —azul claro (`accent-dark`) con tinta oscura (`on-accent-dark`) encima— porque el azul medio con blanco daba 4.20:1 y las etiquetas de herramienta van a 11–13px.

### Neutral

- **Papel del chrome** (`panel` / `toolbar`): barras, paneles y diálogos.
- **Mesa** (`surface`): área del documento, un paso más gris que el chrome, para que la lámina flote.
- **Bordes**: `border` es hairline decorativo entre elementos del mismo plano; `border-strong` es separación estructural (chrome ↔ documento); `border-control` es el contorno de un control.
- **Secundario** (`muted`): hints, iconos en reposo, atajos.
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

**The One Signal Rule.** Un canal de color = un significado. El relleno accent es «activo»; el estado sucio va en `warning` y como texto, no como relleno; y una barra no lleva un color permanente que le robe el canal al que sí necesita atención.

## Typography

**Display Font:** ninguna. No hay display de marca.
**Body Font:** stack de sistema (Segoe UI / San Francisco, con Roboto / Helvetica / Arial)
**Label/Mono Font:** la misma familia; números en `tabular-nums` (zoom, páginas, medidas, `kbd`)

**Character:** una sola sans de UI, escala apretada de cinco tamaños. Jerarquía por peso y tamaño, no por familia.

### Hierarchy

- **Display** (600, 20px, 1.25): título de pantalla vacía y de pantalla de error. Único tamaño por encima del cuerpo.
- **Base** (400, 14px, 1.5): botones primarios, cuerpo de modal, campos.
- **UI** (400, 13px, 1.45): pestañas de documento, items de menú.
- **Mini** (400, 12px, 1.4): etiquetas de campo, tools de cinta compacta, status.
- **Micro** (400, 11px, 1.35): piso de lectura diaria — captions, kbd, contadores, cabeceras de panel en mayúsculas.

### Named Rules

**The One Face Rule.** No se agrega una display ni una mono «técnica» de adorno. Mono solo si el contenido es código; los números van con `tabular-nums` sobre la sans.

**The Eleven-Pixel Floor.** Nada operativo baja de 11px. Y nada operativo sube fuera de la escala: `text-lg`, `text-xl` y `text-2xl` no existen en este sistema.

## Layout

Escritorio de ventana fija, no landing. Columnas: riel 44px, panel lateral 224px (320–360px en revisión, conteo y AI), visor flexible. Filas: top bar 40px, cinta de modos 36px, fila de tools 44px, status 32px.

Las cuatro filas del chrome comparten un solo eje izquierdo a 8px (`px-2`). La pantalla vacía se centra a `max-w-3xl` con `space-y-6`. No hay tipografía fluida ni breakpoints de marketing.

### Named Rules

**The Single Axis Rule.** Todo lo que se apila verticalmente en el chrome arranca en la misma x. Reservar ancho para los botones de ventana en una fila que no los tiene desalinea las demás.

## Elevation & Depth

Híbrido tonal. El documento (`surface`) está un paso más bajo que el chrome (`panel`). Las sombras son estructurales y raras. En reposo, el borde de 1px hace el trabajo.

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

Esquinas de herramienta, no de marca. Tres radios y ninguna excepción: `rounded-token-sm` (5px) para chips, foco y controles menores; `rounded-token` (7px) para controles normales; `rounded-token-lg` (12px) para contenedores, modales y hojas.

Bordes de 1px. Separadores verticales `w-px h-4`. Sin recortes diagonales, sin neobrutalismo.

## Motion

Una curva (`--ease`) y tres duraciones: `fast` 120ms (color, hover, pulsación), `base` 180ms (entradas y colapsos), `slow` 260ms.

- **Entradas de capa:** `overlay-in` para el scrim, `panel-in` para el panel.
- **Salidas de capa:** `overlay-out` / `panel-out` con `data-closing` y una guarda de reentrada. Una capa que desmonta en un frame se siente barata; una acción no espera a su salida.
- **La paleta de comandos no anima la entrada.** Es una acción de teclado: instantánea.
- **Tooltips en ráfaga:** el primero cobra el retardo, los siguientes salen instantáneos mientras el usuario sigue leyendo etiquetas.
- **Toasts:** el hueco se cierra con la fila de grid (`1fr → 0fr`), no desaparece de golpe.
- **Progreso indeterminado recorre**, no parpadea en el sitio; el determinado avanza en `linear`.

### Named Rules

**The Reduced-Motion Is Less, Not None Rule.** Con la preferencia activa se cortan los `transform` y se conservan los fades de color y opacidad a 120ms. Los indicadores de progreso **siguen girando**: un spinner congelado se lee como app colgada. Lo que anima por SMIL (`<animate>`) no lo alcanza la regla CSS y consulta la preferencia a mano.

**The Keyboard Is Instant Rule.** Lo que el usuario dispara con el teclado y repite decenas de veces al día no se anima.

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
- **Do** usar la escala `micro` → `mini` → `ui` → `base` → `display` (11 / 12 / 13 / 14 / 20).
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
- **Don't** cambiar el ancho de un control al activarse (`font-medium` en el estado activo recorre la fila entera).
- **Don't** declarar un `hover:` después del estado activo: al pasar el ratón se pierde el activo.
- **Don't** definir subcomponentes dentro del cuerpo de otro componente: se recrean por render y los campos pierden el foco al teclear.
- **Don't** esconder el cierre de la pestaña activa ni el estado sucio en un punto sin texto en el status.
- **Don't** inventar un look de landing (cards métricas, kickers, gradiente en el texto).
