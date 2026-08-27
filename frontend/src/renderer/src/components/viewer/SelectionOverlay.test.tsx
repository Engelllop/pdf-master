import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import SelectionOverlay from './SelectionOverlay'
import { type Annotation } from '../../store/usePdfStore'

const pageData = { width: 800, height: 600, originalWidth: 800, originalHeight: 600, image: '' }
const toScreen = (x: number, y: number) => ({ x, y })

function pintar(ann: Annotation) {
  const { container } = render(
    <svg>
      <SelectionOverlay ann={ann} pageData={pageData} toScreen={toScreen} onResizeStart={vi.fn()} />
    </svg>,
  )
  return container
}

// Los tiradores con cursor de redimensión son los que reciben el arrastre.
const tiradores = (c: Element) =>
  [...c.querySelectorAll('rect')].filter((r) => (r.getAttribute('style') || '').includes('resize'))

describe('caja de selección', () => {
  it('una marca con ancho y alto ofrece los 8 tiradores', () => {
    const c = pintar({ id: 'r1', type: 'rect', page: 0, x: 10, y: 10, width: 100, height: 50 })
    expect(tiradores(c).length).toBe(8)
  })

  // Antes estas marcas no ofrecían tiradores porque el redimensionado escribía
  // x/y/width/height y ellas se dibujan desde sus `points`: el tirador movía la caja y
  // dejaba la forma quieta. Desde que `geometriaRedimensionada` escala los puntos, los
  // tiradores sirven (el escalado se prueba en resizeGeometry.test.ts).
  it('un trazo también ofrece tiradores: el redimensionado escala sus puntos', () => {
    const c = pintar({
      id: 'd1', type: 'draw', page: 0, x: 10, y: 10,
      points: [{ x: 10, y: 10 }, { x: 60, y: 40 }, { x: 90, y: 20 }],
    })
    expect(tiradores(c).length).toBe(8)
    expect(c.querySelectorAll('rect[stroke-dasharray]').length).toBe(1)
  })

  it('una medición de perímetro igual', () => {
    const c = pintar({
      id: 'p1', type: 'measure_perimeter', page: 0, x: 0, y: 0,
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    })
    expect(tiradores(c).length).toBe(8)
  })

  // Una cota horizontal tiene alto 0: el guard de «w<=0 || h<=0» la descartaba y se
  // quedaba sin caja de selección, sin barra de propiedades y sin poder arrastrarla.
  it('una cota horizontal se puede seleccionar y tiene tiradores', () => {
    const c = pintar({ id: 'c1', type: 'measure_distance', page: 0, x: 0, y: 0, width: 120, height: 0 })
    expect(tiradores(c).length).toBe(8)
    expect(c.querySelectorAll('rect[stroke-dasharray]').length).toBe(1)
  })

  it('una medición de área se puede seleccionar y redimensionar', () => {
    const c = pintar({
      id: 'a1', type: 'measure_area', page: 0, x: 0, y: 0,
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
    })
    expect(c.querySelectorAll('rect[stroke-dasharray]').length).toBe(1)
    expect(tiradores(c).length).toBe(8)
  })

  it('una firma también se puede seleccionar', () => {
    const c = pintar({
      id: 'f1', type: 'signature', page: 0, x: 0, y: 0,
      points: [{ x: 0, y: 0 }, { x: 30, y: 10 }],
    })
    expect(c.querySelectorAll('rect[stroke-dasharray]').length).toBe(1)
  })
})
