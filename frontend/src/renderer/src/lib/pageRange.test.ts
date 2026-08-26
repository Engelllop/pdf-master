import { describe, it, expect } from 'vitest'
import { parsePageRanges } from './pageRange'

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
