---
name: PDF Master
description: Chrome neutro de escritorio; el color lo ponen las marcas sobre el PDF.
colors:
  ink: "#1f2329"
  paper: "#ffffff"
  surface: "#f3f4f6"
  border: "#e3e5e9"
  muted: "#57606a"
  hover: "#e9ecf0"
  raised: "#e2e5ea"
  danger: "#9e3d36"
  success: "#2f694a"
  warning: "#8c5e14"
  info: "#33547a"
  ink-dark: "#e2e8f0"
  paper-dark: "#1e293b"
  surface-dark: "#0f172a"
  border-dark: "#334155"
  muted-dark: "#94a3b8"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
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
  sm: "4px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
    typography: "{typography.body}"
  ribbon-tool:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  ribbon-tool-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "32px"
  tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
---

# Design System: PDF Master

## Overview

**Creative North Star: "El instrumento callado"**

La interfaz está muda a propósito. El color, el peso y el drama viven en las marcas que el usuario pone sobre el PDF, no en el chrome. Barras, riel y diálogos son un instrumento de escritorio Windows: denso, familiar, sin disfraz de producto web.

La personalidad es de archivo, no de marketing. Una sola familia de sistema (Segoe / San Francisco), una tinta para texto y selección, semánticos apagados. Quien llega desde Acrobat o Bluebeam reconoce la cinta; quien mira el plano no pelea con azules de marca.

Rechazos confirmados por el código: verdes y rojos saturados de Tailwind como estados; acento usado como color de texto (es el mismo valor que el foreground); tipografía display; motion que ignore “reducir movimiento”.

**Key Characteristics:**

- Chrome neutro; el documento y las marcas cargan el color
- Una tinta (`ink`) como texto y como relleno de selección
- Densidad de herramienta: filas de 32–40px, tipo 11–14px
- Profundidad por tono (surface vs panel), no por teatro de sombras
- Motion corto, una curva, se apaga con `prefers-reduced-motion`

## Colors

Paleta de taller: grises fríos y una tinta. Los semánticos están desaturados para no competir con el markup.

### Primary

- **Tinta de sello** (`ink`): texto, iconos y relleno de controles activos. Siempre como fondo con texto claro (`paper` / `toolbar`), nunca como color de letra sobre el chrome — es el mismo valor que el foreground y desaparecería.

### Neutral

- **Papel** (`paper` / `toolbar`): barras, paneles y diálogos en claro.
- **Bandeja** (`surface`): área del documento, un paso más gris que el chrome.
- **Borde** (`border`): divisores de 1px.
- **Secundario** (`muted`): hints, iconos en reposo, atajos.
- **Hover / Elevado** (`hover`, `raised`): estados de control y chips, no decoración.

En oscuro el documento se hunde a `surface-dark` y el chrome a `paper-dark`; la tinta se invierte a `ink-dark`. Misma doctrina, valores en el sidecar.

### Named Rules

**The Markup Owns Color Rule.** El chrome no introduce un azul de marca. El color saturado pertenece a las anotaciones del usuario.

**The Accent-Is-Fill Rule.** `accent` e `ink` son la misma tinta. Un control activo es relleno oscuro + texto claro, no texto “accent” sobre fondo blanco.

**The Quiet Semantic Rule.** Peligro, éxito, aviso e info van apagados (`danger`, `success`, `warning`, `info`). No usar la paleta viva de Tailwind.

## Typography

**Display Font:** ninguna. No hay display.
**Body Font:** stack de sistema (Segoe UI / San Francisco, con Roboto / Helvetica / Arial)
**Label/Mono Font:** la misma familia; números en `tabular-nums` (zoom, páginas, medidas, `kbd`)

**Character:** una sola sans de UI, escala apretada (11–14px, más un título de 20px en la portada vacía). Jerarquía por peso y tamaño, no por familia.

### Hierarchy

- **Headline** (600, 20px, 1.25): título de la portada vacía. Casi no aparece en el editor.
- **Title** (600, 14px, 1.5): títulos de diálogo.
- **Body** (400, 14px, 1.5): botones primarios, cuerpo de modal, atajos de portada.
- **UI** (400, 13px, 1.45): pestañas de documento, items de menú.
- **Label** (400, 12px, 1.4): etiquetas de campo, tools de cinta compacta, status.
- **Micro** (400, 11px, 1.35): piso de lectura diaria — captions, kbd, contadores.

### Named Rules

**The One Face Rule.** No se agrega una display ni una mono de disfraz. Mono solo si el contenido es código; los números van con `tabular-nums` sobre la sans.

**The Eleven-Pixel Floor.** Nada operativo baja de 11px. Seis tamaños entre 9 y 14 no son jerarquía.

## Layout

Escritorio de ventana fija, no landing. Columnas: riel 44px, panel 224px (320px en revisión/conteo), visor flexible, status 32px, top bar 40px, cinta de modos 36px, tools 44px.

Ritmo: grupos apretados (`4–8px`), separación de bloques `12–16px`. La portada vacía se centra a `max-w-3xl` con `space-y-6`. No hay tipografía fluida ni breakpoints de marketing; `sm` solo parte grillas de recientes.

## Elevation & Depth

Híbrido tonal. El documento (`surface`) está un paso más bajo que el chrome (`paper`). Las sombras son estructurales y raras: menús, toasts, diálogos. En reposo, el borde de 1px hace el trabajo.

### Shadow Vocabulary

- **Token** (`0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)`): menús de cinta y zoom. En oscuro, misma receta al 40%/30%.
- **Diálogo** (`shadow-2xl`): modal sobre el overlay `bg-black/50`.
- **Toast** (`shadow-lg`): esquina inferior derecha.

### Named Rules

**The Tonal Layer Rule.** Primero se cambia el fondo (surface / panel / hover). La sombra aparece cuando una capa se escapa del flujo (menú, modal, toast), no en cada fila.

## Shapes

Esquinas suaves de herramienta, no de marca. Radio canónico 8px (`rounded-token` / `rounded-lg`). Foco y chips menores a 4px. El icono vacío de la portada usa 16px (`rounded-2xl`) como única excepción de bienvenida.

Bordes de 1px `border`. Separadores verticales `w-px h-4`. Sin recortes diagonales, sin neobrutalismo.

## Components

Controles reprimidos y precisos: compactos, hover gris, sin teatro. La cinta es icono + etiqueta; los iconos solos llevan nombre accesible.

### Buttons

- **Shape:** 8px (`rounded-md` / `rounded-token`)
- **Primary:** relleno `ink`, texto `paper`, padding `6px 16px`, hover por opacidad
- **Ghost:** texto `ink` o `muted`, hover `hover`
- **Danger:** relleno `danger`, texto blanco
- **Focus:** anillo 2px `ink`, offset −2px, solo `:focus-visible`
- **Disabled:** opacity 30%

### Chips

- **Style:** fondo `raised` / `active`, texto `muted`, radio 8px (kbd, chips de herramienta)
- **State:** la herramienta activa no es chip: es botón primary (relleno tinta)

### Cards / Containers

- **Corner Style:** 8px en recientes y diálogos
- **Background:** `paper` sobre `surface`
- **Shadow Strategy:** ver Elevation; las tarjetas de recientes son borde, no sombra
- **Border:** 1px `border`
- **Internal Padding:** 8–16px

### Inputs / Fields

- **Style:** fondo `surface` o `panel`, borde 1px, radio 8px, 14px
- **Focus:** borde `ink` (`focus:border-accent`), sin glow
- **Widgets de formulario PDF:** overlay semitransparente `info`; anuncian el nombre del campo

### Navigation

- **Top bar** 40px, zona de arrastre de ventana; utilidades solo-icono a la derecha
- **Cinta:** tablist centrado (Leer / Comentar / …); tools en la fila de 44px
- **Riel** 44px, `aria-pressed`, indicador de 2px a la izquierda cuando está activo
- **Pestaña de documento:** activa = `surface` + borde + sombra mínima; cierre visible en la activa

### Status de guardado

Texto, no un punto. Sucio: **Sin guardar · Ctrl+S** en `warning`. Guardando / Guardado con icono. El punto de la pestaña es secundario.

## Do's and Don'ts

### Do:

- **Do** tratar `ink` como relleno de selección y como texto, nunca como “accent” sobre blanco.
- **Do** usar la escala `micro` → `mini` → `ui` → `base` (11 / 12 / 13 / 14). Título 20px solo en portada o equivalentes.
- **Do** poner `tabular-nums` en zoom, página, medidas y `kbd`.
- **Do** respetar `prefers-reduced-motion` (ya apaga las transiciones y keyframes).
- **Do** nombrar todo control solo-icono (`aria-label`).

### Don't:

- **Don't** pintar el chrome con azul de producto o semánticos saturados de Tailwind.
- **Don't** agregar una fuente display o una mono “técnica” de adorno.
- **Don't** usar sombra de halo a 0px de offset; las sombras de este sistema tienen desplazamiento.
- **Don't** esconder el cierre de la pestaña activa ni el estado sucio en un punto de 1.5px sin texto en el status.
- **Don't** inventar un look de landing (cards métricas, kickers, gradiente en el texto).
