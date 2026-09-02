import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SearchHits from './SearchHits'

const RESULTADOS = [
  { page: 0, x: 10, y: 20, width: 40, height: 12 },
  { page: 1, x: 5, y: 5, width: 30, height: 10 },
  { page: 1, x: 50, y: 80, width: 30, height: 10 },
]

const pintar = (page: number, index: number) =>
  render(
    <svg>
      <SearchHits results={RESULTADOS} index={index} page={page} escalaX={2} escalaY={3} />
    </svg>,
  ).container

const rects = (c: HTMLElement) => [...c.querySelectorAll('rect')]

describe('coincidencias de la búsqueda', () => {
  it('solo pinta las de esa página', () => {
    expect(rects(pintar(1, -1))).toHaveLength(2)
    expect(rects(pintar(0, -1))).toHaveLength(1)
    expect(rects(pintar(5, -1))).toHaveLength(0)
  })

  it('escala los puntos PDF al tamaño en pantalla', () => {
    const r = rects(pintar(0, -1))[0]
    expect(r.getAttribute('x')).toBe('20')
    expect(r.getAttribute('y')).toBe('60')
    expect(r.getAttribute('width')).toBe('80')
    expect(r.getAttribute('height')).toBe('36')
  })

  // En una lámina con doscientas etiquetas, saber que hay 12 resultados no sirve si no
  // se ve en cuál estás: la actual va en --hit-active y latiendo.
  it('distingue la coincidencia actual', () => {
    const c = pintar(1, 2)
    const marcados = rects(c).map((r) => r.getAttribute('data-search-hit'))
    expect(marcados).toEqual(['otro', 'actual'])
    const actual = rects(c)[1]
    expect(actual.getAttribute('fill')).toBe('rgb(var(--hit-active))')
    expect(actual.querySelector('animate')).toBeTruthy()
  })

  it('sin coincidencia seleccionada ninguna late', () => {
    const c = pintar(1, -1)
    expect(rects(c).every((r) => r.getAttribute('data-search-hit') === 'otro')).toBe(true)
    expect(c.querySelector('animate')).toBeNull()
  })

  it('no captura el ratón: por debajo se sigue pudiendo marcar', () => {
    expect(rects(pintar(0, 0))[0].getAttribute('pointer-events')).toBe('none')
  })
})
