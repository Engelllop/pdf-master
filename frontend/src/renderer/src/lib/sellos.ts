/** Sellos de página (encabezado y pie, numeración, marca de agua): los tipos que
 * comparten el diálogo, el motor y el deshacer. */

export type CapaSello = 'encabezado' | 'numeracion' | 'marca'

export type ZonaSello = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export type SelloSpec = {
  zones?: Partial<Record<ZonaSello, string>>
  start?: number
  margin_x?: number
  margin_top?: number
  margin_bottom?: number
  text?: string
  mode?: 'center' | 'tile'
  angle?: number
  behind?: boolean
  fontsize?: number
  font?: string
  bold?: boolean
  color?: string
  opacity?: number
  /** Lo devuelve el motor con lo aplicado: el rango que se usó (null = todas). */
  pages?: number[] | null
}

export const ETIQUETA_CAPA: Record<CapaSello, string> = {
  encabezado: 'Encabezado y pie',
  numeracion: 'Numeración',
  marca: 'Marca de agua',
}

export const PT_POR_MM = 72 / 25.4

export const SPEC_INICIAL: Record<CapaSello, SelloSpec> = {
  encabezado: {
    zones: { tl: '', tc: '', tr: '{fecha}', bl: '{archivo}', bc: '', br: '' },
    fontsize: 9, font: 'Helvetica', bold: false, color: '#333333', opacity: 1,
    margin_x: Math.round(12 * PT_POR_MM), margin_top: Math.round(10 * PT_POR_MM), margin_bottom: Math.round(10 * PT_POR_MM),
  },
  numeracion: {
    // Abajo a la derecha: en un plano el centro inferior suele estar libre, pero
    // choca con el encabezado/pie centrado; la esquina es la convención de láminas.
    zones: { br: 'Página {n} de {total}' }, start: 1,
    fontsize: 10, font: 'Helvetica', bold: false, color: '#000000', opacity: 1,
    margin_x: Math.round(12 * PT_POR_MM), margin_top: Math.round(10 * PT_POR_MM), margin_bottom: Math.round(10 * PT_POR_MM),
  },
  marca: {
    text: 'BORRADOR', mode: 'center', angle: 45, behind: false,
    fontsize: 0, font: 'Helvetica', bold: true, color: '#c0392b', opacity: 0.25,
  },
}
