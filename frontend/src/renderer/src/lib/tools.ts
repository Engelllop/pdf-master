/** Nombres y atajos de las herramientas de marcado. Fuente única para la cinta
 * (tooltips), el atajo global de teclado y el indicador de la barra de estado. */

export const TOOL_LABELS: Record<string, string> = {
  select: 'Seleccionar',
  textselect: 'Copiar texto',
  highlight: 'Resaltar',
  underline: 'Subrayar',
  strikethrough: 'Tachar',
  note: 'Nota',
  draw: 'Dibujar',
  signature: 'Firma',
  text: 'Cuadro de texto',
  stamp: 'Sello',
  count: 'Conteo',
  measure_calibrate: 'Calibrar escala',
  measure_distance: 'Medir distancia',
  measure_perimeter: 'Medir perímetro',
  measure_area: 'Medir área',
  rect: 'Rectángulo',
  circle: 'Círculo',
  arrow: 'Flecha',
  line: 'Línea',
  callout: 'Llamada (globo con guía)',
  check: 'Check',
  cross: 'Cruz',
  star: 'Estrella',
  cloud: 'Nube (revisión)',
  polygon: 'Polígono',
  image: 'Insertar imagen',
  edittext: 'Editar texto',
  editimage: 'Editar imagen',
  croparea: 'Recortar área',
  redactarea: 'Redactar área',
}

/** tecla (en minúscula, con prefijo `shift+` si aplica) → id de herramienta */
export const TOOL_KEYS: Record<string, string> = {
  v: 'select',
  h: 'highlight',
  u: 'underline',
  k: 'strikethrough',
  r: 'rect',
  o: 'circle',
  a: 'arrow',
  l: 'line',
  g: 'callout',
  t: 'text',
  n: 'note',
  d: 'draw',
  c: 'count',
  m: 'measure_distance',
  'shift+m': 'measure_area',
  'shift+c': 'measure_calibrate',
}

export const TOOL_SHORTCUTS: Record<string, string> = Object.entries(TOOL_KEYS)
  .reduce<Record<string, string>>((acc, [key, tool]) => {
    const pretty = key.startsWith('shift+')
      ? `Shift+${key.slice(6).toUpperCase()}`
      : key.toUpperCase()
    if (!acc[tool]) acc[tool] = pretty
    return acc
  }, {})

export function toolLabel(id: string | null): string {
  return id ? TOOL_LABELS[id] || id : ''
}

/** Nombre del TIPO de anotación tal como se lista en el panel de revisión (difiere
 * del nombre de la herramienta: "Imagen" vs "Insertar imagen"). */
export const ANNOTATION_LABELS: Record<string, string> = {
  highlight: 'Resaltado',
  underline: 'Subrayado',
  strikethrough: 'Tachado',
  note: 'Nota',
  draw: 'Dibujo',
  text: 'Texto',
  rect: 'Rectángulo',
  circle: 'Círculo',
  arrow: 'Flecha',
  line: 'Línea',
  callout: 'Llamada',
  signature: 'Firma',
  measure_distance: 'Distancia',
  measure_perimeter: 'Perímetro',
  measure_area: 'Área',
  image: 'Imagen',
  count: 'Conteo',
  check: 'Check',
  cross: 'Cruz',
  star: 'Estrella',
  cloud: 'Nube',
  polygon: 'Polígono',
}

export function annotationLabel(type: string): string {
  return ANNOTATION_LABELS[type] || type
}
