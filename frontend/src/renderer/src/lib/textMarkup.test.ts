import { describe, it, expect } from 'vitest'
import { computeLineRects } from './textMarkup'
import { type SpanItem } from './spans'

const span = (x0: number, y0: number, x1: number, y1: number, text = 'abc'): SpanItem =>
  ({ text, x0, y0, x1, y1, size: y1 - y0 })

describe('computeLineRects', () => {
  it('agrupa spans en líneas y devuelve un rect por línea ordenado por y', () => {
    const spans = [
      span(10, 100, 80, 112), span(85, 101, 200, 113), // línea 1 (dos spans)
      span(10, 120, 150, 132), // línea 2
    ]
    const rects = computeLineRects(spans, { x: 0, y: 90, width: 300, height: 60 })
    expect(rects).toHaveLength(2)
    expect(rects[0]).toEqual({ x0: 10, y0: 100, x1: 200, y1: 113 })
    expect(rects[1]).toEqual({ x0: 10, y0: 120, x1: 150, y1: 132 })
  })

  it('recorta horizontalmente al rect de selección', () => {
    const spans = [span(10, 100, 200, 112)]
    const rects = computeLineRects(spans, { x: 50, y: 95, width: 100, height: 25 })
    expect(rects).toHaveLength(1)
    expect(rects[0].x0).toBe(50)
    expect(rects[0].x1).toBe(150)
  })

  it('normaliza arrastres hacia atrás (width/height negativos)', () => {
    const spans = [span(10, 100, 200, 112)]
    const rects = computeLineRects(spans, { x: 150, y: 120, width: -100, height: -25 })
    expect(rects).toHaveLength(1)
    expect(rects[0]).toEqual({ x0: 50, y0: 100, x1: 150, y1: 112 })
  })

  it('devuelve [] sin texto bajo la selección (fallback a marcado libre)', () => {
    const spans = [span(10, 100, 200, 112)]
    expect(computeLineRects(spans, { x: 0, y: 300, width: 100, height: 50 })).toEqual([])
    expect(computeLineRects([], { x: 0, y: 0, width: 100, height: 50 })).toEqual([])
  })

  it('ignora spans de solo espacios', () => {
    const spans = [span(10, 100, 200, 112, '   ')]
    expect(computeLineRects(spans, { x: 0, y: 90, width: 300, height: 40 })).toEqual([])
  })

  it('no mezcla líneas distintas aunque estén cerca (solape < 50%)', () => {
    const spans = [span(10, 100, 100, 110), span(10, 109, 100, 121)]
    const rects = computeLineRects(spans, { x: 0, y: 90, width: 300, height: 50 })
    expect(rects).toHaveLength(2)
  })
})
