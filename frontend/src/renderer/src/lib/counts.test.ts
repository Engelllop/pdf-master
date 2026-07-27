import { describe, it, expect } from 'vitest'
import { countNumbers } from './counts'
import { type Annotation } from '../store/usePdfStore'

const mark = (id: string, cat: string, at: number, page = 0): Annotation => ({
  id, type: 'count', page, x: 0, y: 0, text: cat, createdAt: at,
})

describe('numeración de conteo', () => {
  it('numera por categoría en orden de creación', () => {
    const n = countNumbers([
      mark('a', 'Luminarias', 10),
      mark('b', 'Tomas', 20),
      mark('c', 'Luminarias', 30, 3),
    ])
    expect(n.get('a')).toBe(1)
    expect(n.get('b')).toBe(1)
    expect(n.get('c')).toBe(2)
  })

  it('renumera sin huecos al borrar una marca intermedia', () => {
    const all = [mark('a', 'L', 10), mark('b', 'L', 20), mark('c', 'L', 30)]
    const n = countNumbers(all.filter((a) => a.id !== 'b'))
    expect(n.get('a')).toBe(1)
    expect(n.get('c')).toBe(2)
  })

  it('ignora lo que no son marcas de conteo', () => {
    const n = countNumbers([{ id: 'x', type: 'rect', page: 0, x: 0, y: 0 }, mark('a', 'L', 5)])
    expect(n.get('x')).toBeUndefined()
    expect(n.get('a')).toBe(1)
  })

  it('agrupa las marcas sin categoría bajo General', () => {
    const n = countNumbers([
      { id: 'a', type: 'count', page: 0, x: 0, y: 0, createdAt: 1 },
      { id: 'b', type: 'count', page: 0, x: 0, y: 0, text: 'General', createdAt: 2 },
    ])
    expect(n.get('b')).toBe(2)
  })
})
