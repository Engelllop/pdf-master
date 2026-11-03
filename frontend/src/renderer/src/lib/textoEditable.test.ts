import { describe, it, expect } from 'vitest'
import { familiaBase, familiaVisible, paramsDeEdicion, textoEditable, type TramoMotor } from './textoEditable'

describe('familiaBase', () => {
  it('lleva la fuente del PDF a una de las tres base', () => {
    expect(familiaBase('Helvetica-Bold')).toBe('Arial')
    expect(familiaBase('TimesNewRomanPSMT')).toBe('Times New Roman')
    expect(familiaBase('CourierNew')).toBe('Courier New')
    expect(familiaBase('MicrosoftSansSerif')).toBe('Arial')
    expect(familiaBase('')).toBe('Arial')
  })
})

describe('familiaVisible', () => {
  it('muestra la familia real del documento, no una de tres', () => {
    expect(familiaVisible('ABCDEF+Calibri-Bold')).toBe('Calibri')
    expect(familiaVisible('Calibri,Bold')).toBe('Calibri')
    expect(familiaVisible('ArialMT')).toBe('Arial')
    expect(familiaVisible('TimesNewRomanPS-BoldMT')).toBe('Times New Roman')
    expect(familiaVisible('SegoeUI')).toBe('Segoe UI')
    expect(familiaVisible('Cambria')).toBe('Cambria')
  })
  it('las base14 se muestran como las instaladas que las reemplazan', () => {
    expect(familiaVisible('Helvetica-Oblique')).toBe('Arial')
    expect(familiaVisible('Times-Roman')).toBe('Times New Roman')
    expect(familiaVisible('Courier-Bold')).toBe('Courier New')
  })
  it('sin nombre cae a Arial', () => {
    expect(familiaVisible('')).toBe('Arial')
    expect(familiaVisible(undefined)).toBe('Arial')
  })
})

const TRAMOS: TramoMotor[] = [
  { start: 0, end: 5, font: 'Calibri', size: 10, color: '#000000', bold: false, italic: false },
  { start: 5, end: 9, font: 'Calibri-Bold', size: 10, color: '#ff0000', bold: true, italic: false },
]

describe('textoEditable', () => {
  it('traduce el párrafo del motor y empieza sin cambios', () => {
    const t = textoEditable({ mode: 'block', x0: 1, y0: 2, x1: 3, y1: 4, text: 'Hola', size: 10, font: 'Times-Bold', bold: true, lineHeight: 1.6 })
    expect(t).toMatchObject({
      mode: 'block', value: 'Hola', size: 10, fontFamily: 'Times New Roman', fontPdf: 'Times-Bold',
      bold: true, lineHeight: 1.6, dirty: false, fuenteElegida: false, estiloCambiado: false,
    })
  })
  it('sin interlineado medido usa 1.2', () => {
    expect(textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', lineHeight: null }).lineHeight).toBe(1.2)
  })
  it('guarda los tramos, el texto base y dónde empieza cada renglón', () => {
    const t = textoEditable({ mode: 'block', x0: 0, y0: 0, x1: 1, y1: 1, text: 'Pago MENS', runs: TRAMOS, originY: 100, xFirst: 92, xRest: 72, align: 'justify' })
    expect(t.runs).toEqual(TRAMOS)
    expect(t).toMatchObject({ baseText: 'Pago MENS', originY: 100, xFirst: 92, xRest: 72, align: 'justify' })
  })
  it('sin tramos del motor (rotado, o un tramo suelto) no hay runs', () => {
    expect(textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', runs: null }).runs).toBeNull()
    expect(textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', runs: [] }).runs).toBeNull()
  })
})

describe('paramsDeEdicion', () => {
  const bloque = () => textoEditable({
    mode: 'block', x0: 72, y0: 90, x1: 400, y1: 130, text: 'Pago MENS', size: 10, font: 'ABCDEF+Calibri',
    runs: TRAMOS, originY: 100, xFirst: 92, xRest: 72, align: 'left', lineHeight: 1.5,
  })

  it('manda la fuente REAL del PDF, no la familia de tres: era lo que dejaba todo en Arial', () => {
    expect(paramsDeEdicion(bloque()).font).toBe('ABCDEF+Calibri')
  })

  it('si el usuario elige una fuente, manda la elegida', () => {
    const t = { ...bloque(), fontFamily: 'Georgia', fuenteElegida: true, estiloCambiado: true }
    expect(paramsDeEdicion(t).font).toBe('Georgia')
  })

  it('en párrafo manda los tramos, el texto base y las posiciones', () => {
    const p = paramsDeEdicion({ ...bloque(), value: 'Pago MENSUAL' })
    expect(p).toMatchObject({
      wrap: true, text: 'Pago MENSUAL', runs: TRAMOS, base_text: 'Pago MENS',
      origin_y: 100, x_first: 92, x_rest: 72, align: 'left', line_height: 1.5,
    })
  })

  it('si el usuario cambió el estilo de todo (fuente, cuerpo, color, negrita) no manda tramos', () => {
    const p = paramsDeEdicion({ ...bloque(), estiloCambiado: true })
    expect(p).not.toHaveProperty('runs')
    expect(p).not.toHaveProperty('base_text')
    expect(p).toMatchObject({ wrap: true })
  })

  it('sin tramos del motor no inventa ninguno', () => {
    expect(paramsDeEdicion({ ...bloque(), runs: null })).not.toHaveProperty('runs')
  })

  it('sin posiciones no manda tramos: el motor no sabría dónde empezar', () => {
    expect(paramsDeEdicion({ ...bloque(), originY: null })).not.toHaveProperty('runs')
  })

  it('un tramo suelto se edita como siempre: sin caja y sin tramos', () => {
    const p = paramsDeEdicion({ ...bloque(), mode: 'span' })
    expect(p).not.toHaveProperty('wrap')
    expect(p).not.toHaveProperty('runs')
    expect(p).toMatchObject({ bold: false, italic: false })
  })
})
