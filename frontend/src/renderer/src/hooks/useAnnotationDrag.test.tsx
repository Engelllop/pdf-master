import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnnotationDrag } from './useAnnotationDrag'
import { getAnnotationBounds } from '../components/viewer/annotationRender'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

// El bitmap se rasteriza a 1× (1 px = 1 pt) pero se MUESTRA a la mitad: es el caso
// normal, porque el zoom de la vista casi nunca coincide con el paso de 0.5 al que se
// cuantiza la resolución de rasterizado. `offsetX` (mousedown) llega en px del bitmap
// —el navegador deshace el transform— y `clientX` (mousemove) en px de pantalla.
const ESCALA_EN_PANTALLA = 0.5
const pageData = { width: 1000, height: 1000, originalWidth: 1000, originalHeight: 1000 }
const toScreen = (x: number, y: number) => ({ x, y })

function svgFalso() {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000 * ESCALA_EN_PANTALLA, height: 1000 * ESCALA_EN_PANTALLA }) as DOMRect
  return { current: el as unknown as SVGSVGElement }
}

const marca = (): Annotation => ({
  id: 'a1', type: 'rect', page: 0, x: 100, y: 100, width: 200, height: 100, color: '#ff0000',
})

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  usePdfStore.getState().addDoc({
    doc_id: 'd1', file_path: 'C:/planos/a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 1000, height: 1000 }],
  })
  usePdfStore.getState().addAnnotation('d1', marca())
  usePdfStore.getState().selectAnnotation('d1', 'a1')
  usePdfStore.getState().setActiveTool('select')
})

const annActual = () => usePdfStore.getState().docs[0].annotations[0]

describe('redimensionado de marcas', () => {
  // Bitmap rasterizado a 2x: 1 pt = 2 px. Los valores de arranque que manda
  // SelectionOverlay están en px del bitmap; el delta del ratón se convierte a puntos.
  const page2x = { width: 2000, height: 2000, originalWidth: 1000, originalHeight: 1000 }

  it('el ancho crece lo que se arrastra, no el doble', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 2000 }) as DOMRect
    const ref = { current: el as unknown as SVGSVGElement }
    const { result } = renderHook(() =>
      useAnnotationDrag(ref, 'd1', page2x, (x: number, y: number) => ({ x: x * 2, y: y * 2 }), getAnnotationBounds))

    act(() => {
      result.current.setResizingAnn({
        id: 'a1', corner: 'e',
        startX: 600, startY: 400,          // borde derecho de la marca, en px del bitmap
        startW: 400, startH: 200,          // 200x100 pt vistos a 2x
        startBoundsX: 200, startBoundsY: 200,
      })
    })
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 400 })) })

    // 100 px de bitmap = 50 pt: 200 + 50.
    expect(annActual().width).toBeCloseTo(250, 5)
    expect(annActual().height).toBeCloseTo(100, 5)
  })

  it('arrastrar el borde izquierdo mueve la esquina y ajusta el ancho', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 2000 }) as DOMRect
    const ref = { current: el as unknown as SVGSVGElement }
    const { result } = renderHook(() =>
      useAnnotationDrag(ref, 'd1', page2x, (x: number, y: number) => ({ x: x * 2, y: y * 2 }), getAnnotationBounds))

    act(() => {
      result.current.setResizingAnn({
        id: 'a1', corner: 'w',
        startX: 200, startY: 400,
        startW: 400, startH: 200,
        startBoundsX: 200, startBoundsY: 200,
      })
    })
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 400 })) })

    // El borde se mete 50 pt: ancho 150 y x pasa de 100 a 150.
    expect(annActual().width).toBeCloseTo(150, 5)
    expect(annActual().x).toBeCloseTo(150, 5)
  })
})

describe('arrastre de marcas', () => {
  it('la marca sigue al cursor aunque la página se muestre a otra escala', () => {
    const ref = svgFalso()
    const { result } = renderHook(() =>
      useAnnotationDrag(ref, 'd1', pageData, toScreen, getAnnotationBounds))

    // Mousedown en (150,150) del bitmap: 50 pt dentro de la marca.
    act(() => {
      result.current.handleMouseDown({} as React.MouseEvent, { x: 150, y: 150 })
    })

    // El cursor va a (100,100) en px de PANTALLA = (200,200) del bitmap.
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    })

    // Agarrada 50 pt adentro, la esquina tiene que quedar en 200-50 = 150.
    expect(annActual().x).toBeCloseTo(150, 5)
    expect(annActual().y).toBeCloseTo(150, 5)
  })

  it('sin escalado, arrastrar sigue funcionando igual', () => {
    const ref = { current: (() => {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
      return el as unknown as SVGSVGElement
    })() }
    const { result } = renderHook(() =>
      useAnnotationDrag(ref, 'd1', pageData, toScreen, getAnnotationBounds))
    act(() => { result.current.handleMouseDown({} as React.MouseEvent, { x: 150, y: 150 }) })
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 })) })
    expect(annActual().x).toBeCloseTo(350, 5)
    expect(annActual().y).toBeCloseTo(250, 5)
  })
})
