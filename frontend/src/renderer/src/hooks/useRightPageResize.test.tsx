import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRightPageResize } from './useRightPageResize'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

// La página derecha de la vista doble tiene su propio hook, y ya se había
// desincronizado de la izquierda una vez (le faltaban la regla del círculo y la
// proporción de las imágenes). Nada lo cubría.
const pageDataRight = { width: 1000, height: 1000, originalWidth: 1000, originalHeight: 1000 }

function svgFalso(escala = 1) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000 * escala, height: 1000 * escala }) as DOMRect
  return { current: el as unknown as SVGSVGElement }
}

const annActual = () => usePdfStore.getState().docs[0].annotations[0]

function abrirCon(ann: Annotation) {
  usePdfStore.getState().addDoc({
    doc_id: 'd1', file_path: 'C:/planos/a.pdf', page_count: 2,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 1000, height: 1000 }, { page_num: 1, width: 1000, height: 1000 }],
  })
  usePdfStore.getState().addAnnotation('d1', ann)
}

const mover = (clientX: number, clientY: number) => {
  act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY })) })
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
})

describe('redimensionado en la página derecha', () => {
  it('el ancho crece lo que se arrastra', () => {
    abrirCon({ id: 'a1', type: 'rect', page: 1, x: 100, y: 100, width: 100, height: 100, color: '#f00' })
    const { result } = renderHook(() => useRightPageResize(svgFalso(), 'd1', pageDataRight))

    act(() => {
      result.current.setResizingAnnRight({
        id: 'a1', corner: 'e',
        startX: 200, startY: 150,
        startW: 100, startH: 100,
        startBoundsX: 100, startBoundsY: 100,
      })
    })
    mover(300, 150)

    expect(annActual().width).toBeCloseTo(200, 5)
    expect(annActual().height).toBeCloseTo(100, 5)
  })

  it('un trazo redimensionado en varios pasos escala una sola vez', () => {
    // `geometriaRedimensionada` escala los puntos con un factor ACUMULADO desde la
    // caja de origen, así que hay que pasarle los puntos del arranque. Con los ya
    // escalados del paso anterior, el trazo se dispara.
    abrirCon({
      id: 'p1', type: 'draw', page: 1, x: 100, y: 100, color: '#f00',
      points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }],
    })
    const { result } = renderHook(() => useRightPageResize(svgFalso(), 'd1', pageDataRight))

    act(() => {
      result.current.setResizingAnnRight({
        id: 'p1', corner: 'e',
        startX: 200, startY: 150,
        startW: 100, startH: 100,
        startBoundsX: 100, startBoundsY: 100,
      })
    })
    for (const x of [225, 250, 275, 300]) mover(x, 150)

    expect(annActual().points!.map((p) => p.x)).toEqual([100, 300, 300])
  })

  it('el círculo se mantiene circular al arrastrar una esquina', () => {
    // Esta es una de las reglas que a esta copia le faltaba.
    abrirCon({ id: 'c1', type: 'circle', page: 1, x: 100, y: 100, width: 100, height: 100, color: '#f00' })
    const { result } = renderHook(() => useRightPageResize(svgFalso(), 'd1', pageDataRight))

    act(() => {
      result.current.setResizingAnnRight({
        id: 'c1', corner: 'se',
        startX: 200, startY: 200,
        startW: 100, startH: 100,
        startBoundsX: 100, startBoundsY: 100,
      })
    })
    mover(320, 250)  // +120 en x, +50 en y

    expect(annActual().width).toBeCloseTo(annActual().height!, 5)
  })

  it('soltar deja un paso de deshacer del gesto entero', () => {
    abrirCon({ id: 'a1', type: 'rect', page: 1, x: 100, y: 100, width: 100, height: 100, color: '#f00' })
    const { result } = renderHook(() => useRightPageResize(svgFalso(), 'd1', pageDataRight))

    act(() => {
      result.current.setResizingAnnRight({
        id: 'a1', corner: 'e', startX: 200, startY: 150,
        startW: 100, startH: 100, startBoundsX: 100, startBoundsY: 100,
      })
    })
    mover(250, 150)
    mover(300, 150)
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })

    expect(result.current.resizingAnnRight).toBeNull()
    act(() => { usePdfStore.getState().undo() })
    expect(annActual().width).toBeCloseTo(100, 5)
  })

  it('al desmontar deja de escuchar', () => {
    abrirCon({ id: 'a1', type: 'rect', page: 1, x: 100, y: 100, width: 100, height: 100, color: '#f00' })
    const { result, unmount } = renderHook(() => useRightPageResize(svgFalso(), 'd1', pageDataRight))
    act(() => {
      result.current.setResizingAnnRight({
        id: 'a1', corner: 'e', startX: 200, startY: 150,
        startW: 100, startH: 100, startBoundsX: 100, startBoundsY: 100,
      })
    })
    unmount()
    mover(400, 150)
    expect(annActual().width).toBeCloseTo(100, 5)
  })

  it('sin bitmap de la derecha no toca nada', () => {
    abrirCon({ id: 'a1', type: 'rect', page: 1, x: 100, y: 100, width: 100, height: 100, color: '#f00' })
    const { result } = renderHook(() => useRightPageResize(svgFalso(), 'd1', null))
    act(() => {
      result.current.setResizingAnnRight({
        id: 'a1', corner: 'e', startX: 200, startY: 150,
        startW: 100, startH: 100, startBoundsX: 100, startBoundsY: 100,
      })
    })
    expect(() => mover(300, 150)).not.toThrow()
    expect(annActual().width).toBeCloseTo(100, 5)
  })
})
