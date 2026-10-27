/** El texto del PDF que se va a editar, como lo devuelve `/pdf/text-block`, y su
 * traducción al editor. */

export type ModoEdicion = 'block' | 'line' | 'span'

export type TextoEditable = {
  mode: ModoEdicion
  x0: number
  y0: number
  x1: number
  y1: number
  value: string
  size: number
  color: string
  /** Familia para el editor; el motor la aproxima a Helvetica / Times / Courier. */
  fontFamily: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: number
  /** Si el usuario cambió algo: confirmar sin cambios no reescribe el PDF. */
  dirty: boolean
}

/** Las tres familias que el motor escribe de verdad (base14). Ofrecer catorce
 * fuentes y escribir siempre Helvetica era prometer lo que no se hace. */
export const FUENTES_BASE = ['Arial', 'Times New Roman', 'Courier New'] as const

export function familiaBase(fuentePdf: string | undefined | null): string {
  const f = (fuentePdf || '').toLowerCase()
  if (/courier|mono|consol/.test(f)) return 'Courier New'
  if (/times|georgia|serif|roman|garamond/.test(f) && !/sans/.test(f)) return 'Times New Roman'
  return 'Arial'
}

type BloqueMotor = {
  mode?: ModoEdicion
  x0: number; y0: number; x1: number; y1: number
  text: string
  size?: number
  color?: string
  font?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  lineHeight?: number | null
}

export function textoEditable(b: BloqueMotor): TextoEditable {
  return {
    mode: b.mode || 'span',
    x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
    value: b.text,
    size: b.size || 12,
    color: b.color || '#000000',
    fontFamily: familiaBase(b.font),
    bold: !!b.bold,
    italic: !!b.italic,
    align: b.align || 'left',
    // Sin interlineado medido (una sola línea), el de PyMuPDF por defecto.
    lineHeight: b.lineHeight && b.lineHeight > 0.8 ? b.lineHeight : 1.2,
    dirty: false,
  }
}
