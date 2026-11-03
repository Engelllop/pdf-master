import { describe, expect, it } from 'vitest'
import {
  aplicarEstilo, aRuns, borrarRango, cambiarTamano, estiloEn, fusionar, iguales, insertarTexto, paramsDeEdicionRica,
  sinSaltosFinales, tamanoDominante, textoDe, tramosDeBloque, type Tramo,
} from './textoRico'
import { textoEditable } from './textoEditable'

const base = { font: 'Calibri', size: 12, color: '#000000', bold: false, italic: false }
const t = (text: string, extra: Partial<Tramo> = {}): Tramo => ({ ...base, text, ...extra })

describe('tramosDeBloque', () => {
  it('sin tramos del motor, un solo tramo con el estilo del bloque', () => {
    const b = textoEditable({ x0: 0, y0: 0, x1: 10, y1: 10, text: 'Hola', size: 11, color: '#112233', font: 'Calibri', bold: true })
    expect(tramosDeBloque(b)).toEqual([{ font: 'Calibri', size: 11, color: '#112233', bold: true, italic: false, text: 'Hola' }])
  })
  it('parte el texto según los tramos del motor', () => {
    const b = textoEditable({
      x0: 0, y0: 0, x1: 10, y1: 10, text: 'Presion 200 psi', size: 12,
      runs: [
        { start: 0, end: 8, font: 'Calibri', size: 12, color: '#000000', bold: false, italic: false },
        { start: 8, end: 11, font: 'Calibri-Bold', size: 12, color: '#ff0000', bold: true, italic: false },
        { start: 11, end: 15, font: 'Calibri', size: 12, color: '#000000', bold: false, italic: false },
      ],
    })
    expect(tramosDeBloque(b).map((x) => x.text)).toEqual(['Presion ', '200', ' psi'])
  })
  it('un hueco entre tramos lo cubre el tramo anterior y nada se pierde', () => {
    const b = textoEditable({
      x0: 0, y0: 0, x1: 10, y1: 10, text: 'abcdef', size: 12,
      runs: [
        { start: 0, end: 2, font: 'F', size: 12, color: '#000000', bold: false, italic: false },
        { start: 4, end: 6, font: 'G', size: 12, color: '#000000', bold: true, italic: false },
      ],
    })
    const r = tramosDeBloque(b)
    expect(textoDe(r)).toBe('abcdef')
    expect(r[0].text).toBe('abcd')
  })
})

describe('aplicarEstilo', () => {
  it('pone negrita solo a lo seleccionado', () => {
    const r = aplicarEstilo([t('Hola mundo')], 5, 10, { bold: true })
    expect(r.map((x) => [x.text, x.bold])).toEqual([['Hola ', false], ['mundo', true]])
  })
  it('en el medio parte en tres', () => {
    const r = aplicarEstilo([t('abcdef')], 2, 4, { color: '#ff0000' })
    expect(r.map((x) => [x.text, x.color])).toEqual([['ab', '#000000'], ['cd', '#ff0000'], ['ef', '#000000']])
  })
  it('cruza varios tramos y los une si quedan iguales', () => {
    const ini = [t('ab', { bold: true }), t('cd'), t('ef', { bold: true })]
    const r = aplicarEstilo(ini, 0, 6, { bold: true })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ text: 'abcdef', bold: true })
  })
  it('selección vacía no cambia nada', () => {
    expect(aplicarEstilo([t('abc')], 1, 1, { bold: true })).toEqual([t('abc')])
  })
  it('el tamaño se limita al rango permitido', () => {
    expect(aplicarEstilo([t('abc')], 0, 3, { size: 500 })[0].size).toBe(72)
    expect(aplicarEstilo([t('abc')], 0, 3, { size: 1 })[0].size).toBe(4)
  })
  it('acepta el rango al revés (selección hacia atrás)', () => {
    const r = aplicarEstilo([t('abcdef')], 4, 2, { italic: true })
    expect(r.find((x) => x.italic)?.text).toBe('cd')
  })
  it('no toca el texto', () => {
    expect(textoDe(aplicarEstilo([t('ab'), t('cd', { bold: true })], 1, 3, { color: '#00ff00' }))).toBe('abcd')
  })
})

describe('cambiarTamano', () => {
  it('sube cada tramo desde su propio cuerpo', () => {
    const r = cambiarTamano([t('ab', { size: 10 }), t('cd', { size: 12 })], 0, 4, 1)
    expect(r.map((x) => [x.text, x.size])).toEqual([['ab', 11], ['cd', 14]])
  })
  it('solo lo seleccionado', () => {
    const r = cambiarTamano([t('abcd')], 1, 3, -1)
    expect(r.map((x) => [x.text, x.size])).toEqual([['a', 12], ['bc', 11], ['d', 12]])
  })
  it('respeta los límites', () => {
    expect(cambiarTamano([t('a', { size: 72 })], 0, 1, 1)[0].size).toBe(72)
    expect(cambiarTamano([t('a', { size: 4 })], 0, 1, -1)[0].size).toBe(4)
  })
})

describe('estiloEn', () => {
  const mezcla = [t('uno '), t('dos', { bold: true, color: '#ff0000' }), t(' tres', { size: 14 })]
  it('selección uniforme devuelve el estilo', () => {
    expect(estiloEn(mezcla, 4, 7)).toMatchObject({ bold: true, color: '#ff0000', size: 12, mixto: [] })
  })
  it('selección mezclada marca lo que varía', () => {
    const e = estiloEn(mezcla, 0, 12)!
    expect(e.mixto).toEqual(expect.arrayContaining(['bold', 'color', 'size']))
    expect(e.bold).toBeUndefined()
    expect(e.font).toBe('Calibri')
  })
  it('sin selección toma el carácter anterior al cursor', () => {
    expect(estiloEn(mezcla, 7, 7)).toMatchObject({ bold: true })
    expect(estiloEn(mezcla, 4, 4)).toMatchObject({ bold: false })
  })
  it('al principio toma el primero', () => {
    expect(estiloEn(mezcla, 0, 0)).toMatchObject({ bold: false, size: 12 })
  })
  it('sin tramos no hay estilo', () => {
    expect(estiloEn([], 0, 0)).toBeNull()
  })
})

describe('insertarTexto y borrarRango', () => {
  it('inserta con el estilo dado en medio de un tramo', () => {
    const r = insertarTexto([t('abcd')], 2, 'XY', { ...base, bold: true })
    expect(r.map((x) => [x.text, x.bold])).toEqual([['ab', false], ['XY', true], ['cd', false]])
  })
  it('inserta al final y al principio', () => {
    expect(textoDe(insertarTexto([t('ab')], 2, 'c', base))).toBe('abc')
    expect(textoDe(insertarTexto([t('ab')], 0, 'z', base))).toBe('zab')
  })
  it('inserta en una lista vacía', () => {
    expect(insertarTexto([], 0, 'hola', base)).toEqual([t('hola')])
  })
  it('borra un rango que cruza tramos', () => {
    const r = borrarRango([t('ab'), t('cd', { bold: true }), t('ef', { italic: true })], 1, 5)
    expect(r.map((x) => x.text)).toEqual(['a', 'f'])
  })
})

describe('aRuns / iguales / tamanoDominante', () => {
  it('los índices recorren el texto nuevo sin huecos', () => {
    const rs = aRuns([t('ab'), t('cde', { bold: true })])
    expect(rs.map((r) => [r.start, r.end])).toEqual([[0, 2], [2, 5]])
  })
  it('iguales ignora cómo estén partidos los tramos', () => {
    expect(iguales([t('ab'), t('cd')], [t('abcd')])).toBe(true)
    expect(iguales([t('abcd')], [t('abcd', { bold: true })])).toBe(false)
    expect(iguales([t('abcd')], [t('abce')])).toBe(false)
  })
  it('el color se compara sin importar mayúsculas', () => {
    expect(iguales([t('a', { color: '#FF0000' })], [t('a', { color: '#ff0000' })])).toBe(true)
  })
  it('el cuerpo dominante es el de más caracteres, sin contar espacios', () => {
    expect(tamanoDominante([t('        ', { size: 20 }), t('abc', { size: 10 }), t('de', { size: 14 })])).toBe(10)
  })
  it('fusionar quita vacíos', () => {
    expect(fusionar([t(''), t('a'), t('b')])).toEqual([t('ab')])
  })
})

describe('sinSaltosFinales', () => {
  it('quita los saltos del final, también si quedan en un tramo propio', () => {
    expect(sinSaltosFinales([t('hola\n\n')])).toEqual([t('hola')])
    expect(sinSaltosFinales([t('hola'), t('\n', { bold: true })])).toEqual([t('hola')])
  })
  it('conserva los de adentro y los espacios del final', () => {
    expect(textoDe(sinSaltosFinales([t('a\nb ')]))).toBe('a\nb ')
  })
  it('todo saltos: queda vacío', () => {
    expect(sinSaltosFinales([t('\n\n')])).toEqual([])
  })
})

describe('paramsDeEdicionRica', () => {
  it('manda los tramos sobre el texto nuevo y el origen del párrafo', () => {
    const b = textoEditable({
      x0: 1, y0: 2, x1: 300, y1: 40, text: 'viejo', size: 12, font: 'Calibri', align: 'justify', lineHeight: 1.3,
      originY: 30, xFirst: 40, xRest: 20,
      runs: [{ start: 0, end: 5, font: 'Calibri', size: 12, color: '#000000', bold: false, italic: false }],
    })
    const p = paramsDeEdicionRica(b, [t('nuevo '), t('texto', { bold: true, size: 14 })])
    expect(p).toMatchObject({
      text: 'nuevo texto', wrap: true, align: 'justify', line_height: 1.3,
      base_text: 'nuevo texto', origin_y: 30, x_first: 40, x_rest: 20, size: 12,
    })
    expect(p.runs).toEqual([
      { start: 0, end: 6, font: 'Calibri', size: 12, color: '#000000', bold: false, italic: false },
      { start: 6, end: 11, font: 'Calibri', size: 14, color: '#000000', bold: true, italic: false },
    ])
  })
  it('el salto sobrante al final no viaja al motor', () => {
    const b = textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', size: 12, originY: 1, xFirst: 1, xRest: 1 })
    const p = paramsDeEdicionRica(b, [t('uno\n\n')])
    expect(p.text).toBe('uno')
    expect(p.runs).toEqual([expect.objectContaining({ start: 0, end: 3 })])
  })
  it('texto vaciado: sin tramos', () => {
    const b = textoEditable({ x0: 0, y0: 0, x1: 1, y1: 1, text: 'x', size: 12, originY: 1, xFirst: 1, xRest: 1 })
    const p = paramsDeEdicionRica(b, [])
    expect(p.text).toBe('')
    expect(p.runs).toBeUndefined()
  })
})
