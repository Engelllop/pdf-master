import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanZoom } from './usePanZoom'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

const pageData = { width: 800, height: 1000, originalWidth: 1600 }

/** Un contenedor con métricas de scroll de verdad: en jsdom todas valen 0, así que sin
 * esto «estoy al final de la página» es siempre cierto y el test no prueba nada. */
function contenedor(metricas: Partial<{ scrollTop: number; scrollHeight: number; clientHeight: number; scrollLeft: number }> = {}) {
  const el = document.createElement('div')
  const valores = { scrollTop: 0, scrollHeight: 2000, clientHeight: 1000, scrollLeft: 0, ...metricas }
  for (const [prop, valor] of Object.entries(valores)) {
    Object.defineProperty(el, prop, { value: valor, writable: true, configurable: true })
  }
  el.scrollTo = vi.fn(({ top }: ScrollToOptions = {}) => { el.scrollTop = top ?? 0 }) as unknown as typeof el.scrollTo
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(el)
  return el
}

function abrirDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\plano-a.pdf',
    page_count: 5,
    title: null,
    author: null,
    subject: null,
    page_sizes: Array.from({ length: 5 }, (_, i) => ({ page_num: i, width: 1600, height: 2000 })),
  })
}

function montar(el: HTMLDivElement) {
  const ref = { current: el }
  // Suscrito al store, como el componente real: el hook recibe `activeDoc` por
  // parámetro y `useStoreSlice` no mira el zoom, así que con `getState()` una vez el
  // hook se quedaría con un doc viejo y el test mediría contra un zoom que ya cambió.
  const hook = renderHook(() => {
    const doc = usePdfStore((s) => s.docs[0])
    return usePanZoom(ref, doc, pageData)
  })
  return { ...hook, ref }
}

/** Lo mínimo de un React.WheelEvent que el hook mira. */
function rueda(over: Partial<{ deltaY: number; ctrlKey: boolean; metaKey: boolean; clientX: number; clientY: number }> = {}) {
  const preventDefault = vi.fn()
  const ev = {
    deltaY: 1, ctrlKey: false, metaKey: false, clientX: 500, clientY: 500,
    preventDefault, ...over,
  }
  return ev as unknown as React.WheelEvent & { preventDefault: typeof preventDefault }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  document.body.innerHTML = ''
  abrirDoc()
})

describe('arrastrar para desplazar', () => {
  it('el movimiento del ratón desplaza el contenedor en sentido contrario', () => {
    const el = contenedor({ scrollLeft: 300, scrollTop: 400 })
    const { result } = montar(el)

    act(() => { result.current.startPan(100, 100) })
    expect(result.current.isPanning).toBe(true)

    // Arrastrar a la derecha y abajo acerca el contenido: el scroll baja.
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 150 })) })
    expect(el.scrollLeft).toBe(270)
    expect(el.scrollTop).toBe(350)
  })

  it('sigue funcionando con el ratón fuera del SVG: los listeners van en window', () => {
    // Antes de esto, salirse del documento a media panorámica dejaba el arrastre
    // pegado (el mouseup caía fuera del elemento y nadie lo veía).
    const el = contenedor({ scrollLeft: 100, scrollTop: 100 })
    const { result } = montar(el)
    act(() => { result.current.startPan(0, 0) })
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })
    expect(result.current.isPanning).toBe(false)
    // Ya suelto, mover el ratón no debe seguir desplazando.
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 })) })
    expect(el.scrollLeft).toBe(100)
  })

  it('stopPan lo corta a mano', () => {
    const { result } = montar(contenedor())
    act(() => { result.current.startPan(0, 0) })
    act(() => { result.current.stopPan() })
    expect(result.current.isPanning).toBe(false)
  })
})

describe('Ctrl + rueda = zoom', () => {
  it('acerca al subir y aleja al bajar', () => {
    const { result } = montar(contenedor())
    const zoomInicial = usePdfStore.getState().docs[0].zoom

    act(() => { result.current.handleWheel(rueda({ ctrlKey: true, deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].zoom).toBeCloseTo(zoomInicial + 0.08)

    act(() => { result.current.handleWheel(rueda({ ctrlKey: true, deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].zoom).toBeCloseTo(zoomInicial)
  })

  it('cancela el evento para que Chromium no haga SU zoom encima', () => {
    const { result } = montar(contenedor())
    const ev = rueda({ ctrlKey: true, deltaY: -1 })
    act(() => { result.current.handleWheel(ev) })
    expect(ev.preventDefault).toHaveBeenCalled()
  })

  it('Cmd vale igual que Ctrl', () => {
    const { result } = montar(contenedor())
    const antes = usePdfStore.getState().docs[0].zoom
    act(() => { result.current.handleWheel(rueda({ metaKey: true, deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].zoom).toBeGreaterThan(antes)
  })

  it('no pasa de 8x ni baja de 0.1x', () => {
    const { result } = montar(contenedor())
    act(() => { usePdfStore.getState().setZoom('doc-1', 8) })
    act(() => { result.current.handleWheel(rueda({ ctrlKey: true, deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].zoom).toBe(8)

    act(() => { usePdfStore.getState().setZoom('doc-1', 0.1) })
    act(() => { result.current.handleWheel(rueda({ ctrlKey: true, deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].zoom).toBe(0.1)
  })
})

describe('rueda sin Ctrl: pasar de página al llegar al borde', () => {
  it('al final de la página, rodar hacia abajo pasa a la siguiente y sube el scroll', () => {
    const el = contenedor({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(1)
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })

  it('a media página no pasa nada: primero hay que terminar de leerla', () => {
    const el = contenedor({ scrollTop: 200, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    const ev = rueda({ deltaY: 1 })
    act(() => { result.current.handleWheel(ev) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('en la ÚLTIMA página no salta al principio', () => {
    act(() => { usePdfStore.getState().setPage('doc-1', 4) })
    const el = contenedor({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(4)
  })

  it('arriba de la página, hay que rodar hacia arriba DOS veces para retroceder', () => {
    // La primera rueda solo registra la dirección: si no, llegar arriba con inercia
    // te sacaba de la página sin querer.
    act(() => { usePdfStore.getState().setPage('doc-1', 2) })
    const el = contenedor({ scrollTop: 0 })
    const { result } = montar(el)

    act(() => { result.current.handleWheel(rueda({ deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(2)

    act(() => { result.current.handleWheel(rueda({ deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(1)
  })

  it('en la PRIMERA página no salta al final', () => {
    const el = contenedor({ scrollTop: 0 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: -1 })) })
    act(() => { result.current.handleWheel(rueda({ deltaY: -1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
  })

  it('con la rueda en modo «scroll» la página no cambia nunca', () => {
    act(() => { usePdfStore.getState().setWheelMode('scroll') })
    const el = contenedor({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
  })

  it('con una herramienta activa tampoco: se está dibujando, no leyendo', () => {
    act(() => { usePdfStore.getState().setActiveTool('rect') })
    const el = contenedor({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
  })

  it('una segunda rueda inmediata no salta dos páginas de un tirón', () => {
    const el = contenedor({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 1000 })
    const { result } = montar(el)
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    // `isChangingPage` sigue puesto durante 300 ms.
    Object.defineProperty(el, 'scrollTop', { value: 1000, writable: true, configurable: true })
    act(() => { result.current.handleWheel(rueda({ deltaY: 1 })) })
    expect(usePdfStore.getState().docs[0].currentPage).toBe(1)
  })
})

describe('sin datos de página todavía', () => {
  it('la rueda no revienta mientras el bitmap no llegó', () => {
    const ref = { current: contenedor() }
    const { result } = renderHook(() => usePanZoom(ref, usePdfStore.getState().docs[0], null))
    expect(() => act(() => { result.current.handleWheel(rueda({ ctrlKey: true, deltaY: -1 })) })).not.toThrow()
  })
})
