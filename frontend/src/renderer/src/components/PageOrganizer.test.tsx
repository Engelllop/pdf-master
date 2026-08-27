import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'

const renderPdfThumbnail = vi.fn(async (_d: string, _v: number, p: number) => ({
  url: `blob:t${p}`, width: 225, height: 300, originalWidth: 612, originalHeight: 792,
}))
vi.mock('../lib/pdfjs', () => ({ renderPdfThumbnail: (d: string, v: number, p: number) => renderPdfThumbnail(d, v, p) }))

// Se captura el callback del observer para simular qué celdas entran al viewport:
// jsdom no calcula layout, así que sin esto nada intersecta nunca.
type IOCb = (entries: { isIntersecting: boolean; target: Element }[]) => void
let ioCb: IOCb | null = null
const observados: Element[] = []
beforeEach(() => {
  ioCb = null
  observados.length = 0
  globalThis.IntersectionObserver = class {
    constructor(cb: IOCb) { ioCb = cb }
    observe = (el: Element) => { observados.push(el) }
    unobserve = vi.fn()
    disconnect = vi.fn()
    takeRecords = vi.fn(() => [])
    root = null
    rootMargin = ''
    thresholds = []
  } as unknown as typeof IntersectionObserver
})

import PageOrganizer from './PageOrganizer'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function doc(id: string, pages: number) {
  return {
    doc_id: id, file_path: `C:/planos/${id}.pdf`, page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  usePdfStore.getState().addDoc(doc('plano', 300))
  usePdfStore.getState().setActiveDoc('plano')
  renderPdfThumbnail.mockClear()
})

// Abrir el organizador de un documento de 300 páginas pedía las 300 miniaturas de
// golpe (y antes, una a una al motor, tomando el único lock de MuPDF).
describe('organizador de páginas', () => {
  it('solo rasteriza las páginas que llegan al viewport', async () => {
    render(<PageOrganizer onClose={() => {}} />)
    expect(observados.length).toBe(300)
    expect(renderPdfThumbnail).not.toHaveBeenCalled()

    await act(async () => {
      ioCb!([0, 1, 2].map((i) => ({ isIntersecting: true, target: observados[i] })))
    })
    expect(renderPdfThumbnail.mock.calls.map((c) => c[2]).sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('no vuelve a rasterizar una página ya pedida', async () => {
    render(<PageOrganizer onClose={() => {}} />)
    await act(async () => {
      ioCb!([{ isIntersecting: true, target: observados[5] }])
    })
    await act(async () => {
      ioCb!([{ isIntersecting: true, target: observados[5] }, { isIntersecting: true, target: observados[6] }])
    })
    expect(renderPdfThumbnail.mock.calls.map((c) => c[2]).sort((a, b) => a - b)).toEqual([5, 6])
  })

  it('al desmontar revoca los blobs de las miniaturas rasterizadas', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { unmount } = render(<PageOrganizer onClose={() => {}} />)
    await act(async () => {
      ioCb!([{ isIntersecting: true, target: observados[0] }])
    })
    revoke.mockClear()
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:t0')
    revoke.mockRestore()
  })
})

describe('tarjeta de página y barra', () => {
  it('el número va fuera del papel, como en el panel de miniaturas', () => {
    const { container } = render(<PageOrganizer onClose={() => {}} />)
    const celda = container.querySelector('[data-page="0"]') as HTMLElement
    const papel = celda.querySelector('.ring-1, .ring-2') as HTMLElement
    // Las dos vistas de páginas del proyecto se veían distintas: aquí el borde de
    // 2 px englobaba el rótulo y el papel no tenía filo ni sombra.
    expect(papel).toBeTruthy()
    expect(papel.textContent).toBe('1')
    expect(celda.lastElementChild!.textContent).toBe('1')
    expect(celda.lastElementChild).not.toBe(papel)
  })

  it('no hay dos formas de cerrar pegadas en la misma barra', () => {
    render(<PageOrganizer onClose={() => {}} />)
    // «Volver» y una ✕ hacían exactamente lo mismo, separadas por seis botones.
    expect(screen.queryByLabelText('Cerrar')).toBeNull()
    expect(screen.getByTitle('Volver (Esc)')).toBeTruthy()
  })
})
