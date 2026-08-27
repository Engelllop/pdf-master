import { describe, it, expect } from 'vitest'
import { parsePageRanges, expandPageRanges, parsePagesField } from './pageRange'

describe('rango de páginas de la impresión', () => {
  it('acepta páginas sueltas y rangos', () => {
    expect(parsePageRanges('1-5, 8', 10)).toEqual([{ from: 0, to: 4 }, { from: 7, to: 7 }])
  })

  it('ordena un rango escrito al revés', () => {
    expect(parsePageRanges('8-3', 10)).toEqual([{ from: 2, to: 7 }])
  })

  it('rechaza lo que se sale del documento', () => {
    expect(parsePageRanges('50', 10)).toBeNull()
    expect(parsePageRanges('0', 10)).toBeNull()
    expect(parsePageRanges('1-99', 10)).toBeNull()
  })

  it('rechaza la sintaxis rota', () => {
    expect(parsePageRanges('1--5', 10)).toBeNull()
    expect(parsePageRanges('uno', 10)).toBeNull()
    expect(parsePageRanges('  ', 10)).toBeNull()
    expect(parsePageRanges('1,,', 10)).toEqual([{ from: 0, to: 0 }])
  })
})

// Marca de agua, encabezado/pie y numeración se aplicaban siempre al documento
// entero; el campo «Páginas» de esos tres diálogos pasa por acá.
describe('campo de páginas de las operaciones que sellan', () => {
  it('aplana los rangos sin repetir y en orden', () => {
    expect(expandPageRanges([{ from: 4, to: 6 }, { from: 0, to: 1 }, { from: 5, to: 5 }]))
      .toEqual([0, 1, 4, 5, 6])
  })

  it('vacío significa todo el documento, no «ninguna»', () => {
    expect(parsePagesField('', 10)).toBeUndefined()
    expect(parsePagesField('   ', 10)).toBeUndefined()
  })

  it('devuelve los índices base 0 de lo que se escribió', () => {
    expect(parsePagesField('1-3, 8', 10)).toEqual([0, 1, 2, 7])
  })

  it('null cuando el rango no cierra o se sale del documento', () => {
    expect(parsePagesField('1-99', 10)).toBeNull()
    expect(parsePagesField('uno', 10)).toBeNull()
  })
})
