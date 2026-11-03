/** El texto del PDF que se va a editar, como lo devuelve `/pdf/text-block`, y su
 * traducción al editor. */

export type ModoEdicion = 'block' | 'line' | 'span'

/** Un tramo del párrafo con su propio estilo: caracteres [start, end) del texto original. */
export type TramoMotor = {
  start: number
  end: number
  font: string
  size: number
  color: string
  bold: boolean
  italic: boolean
}

export type TextoEditable = {
  mode: ModoEdicion
  x0: number
  y0: number
  x1: number
  y1: number
  value: string
  size: number
  color: string
  /** Familia que muestra el editor: la del documento («Calibri»), no una de tres. */
  fontFamily: string
  /** El nombre de fuente tal como lo trae el PDF: es el que se le manda al motor para
   * que escriba con la misma, salvo que el usuario elija otra (`fuenteElegida`). */
  fontPdf: string
  /** El usuario eligió una fuente en el selector: manda la elegida, no la del PDF. */
  fuenteElegida: boolean
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
  /** Si el usuario cambió algo: confirmar sin cambios no reescribe el PDF. */
  dirty: boolean
  /** Estilo por tramo del texto original y dónde empezaba cada renglón. Con ellos el
   * motor reescribe el párrafo conservando negrita, color y cuerpo de cada tramo. */
  runs: TramoMotor[] | null
  baseText: string
  originY: number | null
  xFirst: number | null
  xRest: number | null
  /** El usuario cambió fuente, cuerpo, color, negrita o cursiva de TODO el texto: los
   * tramos dejan de valer y se escribe con un solo estilo. */
  estiloCambiado: boolean
}

/** Las tres familias que siempre se ofrecen aunque el motor no pueda listar las
 * instaladas (sin Windows, o motor viejo). */
export const FUENTES_BASE = ['Arial', 'Times New Roman', 'Courier New'] as const

export function familiaBase(fuentePdf: string | undefined | null): string {
  const f = (fuentePdf || '').toLowerCase()
  if (/courier|mono|consol/.test(f)) return 'Courier New'
  if (/times|georgia|serif|roman|garamond/.test(f) && !/sans/.test(f)) return 'Times New Roman'
  return 'Arial'
}

/** El nombre legible de la fuente de un PDF: «ABCDEF+TimesNewRomanPS-BoldMT» →
 * «Times New Roman», «Calibri,Bold» → «Calibri». Las base14 (Helvetica, Times,
 * Courier) se muestran como las instaladas que las reemplazan. */
export function familiaVisible(fuentePdf: string | undefined | null): string {
  const crudo = (fuentePdf || '').replace(/^[A-Za-z]{6}\+/, '')
  if (/^(helvetica|times|courier)/i.test(crudo)) return familiaBase(crudo)
  const nombre = crudo
    .split(/[-,]/)[0]
    .replace(/(PSMT|MT|PS)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return nombre || familiaBase(crudo)
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
  align?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number | null
  runs?: TramoMotor[] | null
  originY?: number | null
  xFirst?: number | null
  xRest?: number | null
}

export function textoEditable(b: BloqueMotor): TextoEditable {
  return {
    mode: b.mode || 'span',
    x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
    value: b.text,
    size: b.size || 12,
    color: b.color || '#000000',
    fontFamily: familiaVisible(b.font),
    fontPdf: b.font || '',
    fuenteElegida: false,
    bold: !!b.bold,
    italic: !!b.italic,
    align: b.align || 'left',
    // Sin interlineado medido (una sola línea), el de PyMuPDF por defecto.
    lineHeight: b.lineHeight && b.lineHeight > 0.8 ? b.lineHeight : 1.2,
    dirty: false,
    runs: b.runs && b.runs.length ? b.runs : null,
    baseText: b.text,
    originY: b.originY ?? null,
    xFirst: b.xFirst ?? null,
    xRest: b.xRest ?? null,
    estiloCambiado: false,
  }
}

/** Lo que se le manda al motor al confirmar. Con tramos y sin que el usuario haya
 * cambiado el estilo de todo, viajan los tramos (el motor conserva el de cada uno); si
 * no, el estilo único de siempre. La fuente es la real del PDF salvo que se elija otra. */
export function paramsDeEdicion(t: TextoEditable) {
  const enCaja = t.mode !== 'span'
  const conTramos = enCaja && !t.estiloCambiado && !!t.runs && t.originY !== null && t.xFirst !== null && t.xRest !== null
  return {
    x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1,
    text: t.value, size: t.size, color: t.color,
    font: t.fuenteElegida ? t.fontFamily : (t.fontPdf || t.fontFamily),
    ...(enCaja
      ? { wrap: true, bold: t.bold, italic: t.italic, align: t.align, line_height: t.lineHeight }
      : { bold: t.bold, italic: t.italic }),
    ...(conTramos
      ? { runs: t.runs!, base_text: t.baseText, origin_y: t.originY!, x_first: t.xFirst!, x_rest: t.xRest! }
      : {}),
  }
}
