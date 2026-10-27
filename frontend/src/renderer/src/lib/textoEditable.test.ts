import { describe, it, expect } from 'vitest'
import { familiaBase, textoEditable } from './textoEditable'

describe('familiaBase', () => {
  it('lleva la fuente del PDF a una de las tres que el motor escribe', () => {
    expect(familiaBase('Helvetica-Bold')).toBe('Arial')
    expect(familiaBase('TimesNewRomanPSMT')).toBe('Times New Roman')
    expect(familiaBase('CourierNew')).toBe('Courier New')
    expect(familiaBase('MicrosoftSansSerif')).toBe('Arial')
    expect(familiaBase('')).toBe('Arial')
  })
})

describe('textoEditable', () => {
  it('traduce el párrafo del motor y empieza sin cambios', () => {
    const t = textoEditable({ mode: 'block', x0: 1, y0: 2, x1: 3, y1: 4, text: 'Hola', size: 10, font: 'Times-Bold', bold: true, lineHeight: 1.6 })
    expect(t).toMatchObject({ mode: 'block', value: 'Hola', size: 10, fontFamily: 'Times New Roman', bold: true, lineHeight: 1.6, dirty: false })
  })
  it('sin interlineado medido usa 1.2', () => {
    expect(textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', lineHeight: null }).lineHeight).toBe(1.2)
  })
})
