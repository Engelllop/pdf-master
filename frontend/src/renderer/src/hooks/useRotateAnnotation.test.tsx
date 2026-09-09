import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRotateAnnotation } from './useRotateAnnotation'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

// Bitmap de 1000 px que se MUESTRA a la mitad: el caso normal, porque el zoom de la
// vista casi nunca coincide con el paso de 0.5 al que se cuantiza el rasterizado.
const ESCALA_EN_PANTALLA = 0.5
const pageData = { width: 1000 }

function svgFalso(escala = ESCALA_EN_PANTALLA) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000 * escala, height: 1000 * escala }) as DOMRect
  return { current: el as unknown as SVGSVGElement }
}

const marca = (over: Partial<Annotation> = {}): Annotation => ({
  id: 'a1', type: 'rect', page: 0, x: 100, y: 100, width: 200, height: 100, color: '#ff0000', ...over,
})

const annActual = () => usePdfStore.getState().docs[0].annotations[0]

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  usePdfStore.getState().addDoc({
    doc_id: 'd1', file_path: 'C:/planos/a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 1000, height: 1000 }],
  })
  usePdfStore.getState().addAnnotation('d1', marca())
})

/** Gesto de giro con el centro en (500,500) del bitmap y el agarre a la derecha
 * (ángulo 0), que es como lo arma `SelectionOverlay`. */
function empezarGiro(result: { current: ReturnType<typeof useRotateAnnotation> }, startRotation = 0) {
  act(() => {
    result.current.setRotatingAnn({
      id: 'a1', startAngle: 0, startRotation,
      centerX: 500, centerY: 500,
    })
  })
}

const mover = (clientX: number, clientY: number) => {
  act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY })) })
}

describe('giro por arrastre', () => {
  it('90° abajo del centro son 90° de rotación', () => {
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', pageData))
    empezarGiro(result)
    // (500,750) del bitmap = (250,375) de pantalla: recto hacia abajo desde el centro.
    mover(250, 375)
    expect(annActual().rotation).toBeCloseTo(90, 5)
  })

  it('parte de la rotación que ya tenía, no de cero', () => {
    usePdfStore.getState().updateAnnotation('d1', 'a1', { rotation: 30 })
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', pageData))
    empezarGiro(result, 30)
    mover(250, 375)
    expect(annActual().rotation).toBeCloseTo(120, 5)
  })

  it('varios mousemove no acumulan: el ángulo depende de DÓNDE está el ratón', () => {
    // El giro se calcula desde `startAngle`/`startRotation` (absolutos), así que
    // pasar por posiciones intermedias no puede sumar de más.
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', pageData))
    empezarGiro(result)
    mover(375, 312.5)  // (750,625) bitmap: ~26.6°
    mover(312.5, 375)  // (625,750) bitmap: ~63.4°
    mover(250, 375)    // (500,750) bitmap: 90°
    expect(annActual().rotation).toBeCloseTo(90, 5)
  })

  it('des-escala el ratón: sin eso el ángulo sale torcido cuando la página no está 1:1', () => {
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(1), 'd1', pageData))
    empezarGiro(result)
    // Sin escalado, (500,750) de pantalla es (500,750) del bitmap: los mismos 90°.
    mover(500, 750)
    expect(annActual().rotation).toBeCloseTo(90, 5)
  })

  it('soltar deja un paso de deshacer del gesto entero', () => {
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', pageData))
    empezarGiro(result)
    mover(250, 375)
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })

    expect(result.current.rotatingAnn).toBeNull()
    act(() => { usePdfStore.getState().undo() })
    // Un solo Ctrl+Z devuelve la marca sin girar, no un paso por cada mousemove.
    expect(annActual().rotation ?? 0).toBe(0)
  })

  it('al desmontar deja de escuchar', () => {
    const { result, unmount } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', pageData))
    empezarGiro(result)
    unmount()
    mover(250, 375)
    expect(annActual().rotation ?? 0).toBe(0)
  })

  it('sin datos de página no gira ni revienta', () => {
    const { result } = renderHook(() => useRotateAnnotation(svgFalso(), 'd1', null))
    empezarGiro(result)
    expect(() => mover(250, 375)).not.toThrow()
    expect(annActual().rotation ?? 0).toBe(0)
  })
})
