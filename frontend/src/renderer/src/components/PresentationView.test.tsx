import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

vi.mock('../lib/pdfjs', () => ({
  renderPdfPage: vi.fn(async () => ({ url: 'blob:p', width: 10, height: 10, originalWidth: 10, originalHeight: 10 })),
  revokePageUrl: vi.fn(),
}))

import PresentationView from './PresentationView'
import { renderPdfPage } from '../lib/pdfjs'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function abrirDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 20,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 20 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
}

const pulsar = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })) })
const paginaActual = () => usePdfStore.getState().docs[0].currentPage

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  vi.mocked(renderPdfPage).mockClear()
  abrirDoc()
})

describe('modo presentación', () => {
  it('avanza y retrocede de a UNA página', () => {
    render(<PresentationView />)
    pulsar('PageDown')
    expect(paginaActual()).toBe(1)
    pulsar('ArrowRight')
    expect(paginaActual()).toBe(2)
    pulsar('PageUp')
    expect(paginaActual()).toBe(1)
  })

  it('Home y End saltan a los extremos', () => {
    render(<PresentationView />)
    pulsar('End')
    expect(paginaActual()).toBe(19)
    pulsar('Home')
    expect(paginaActual()).toBe(0)
  })

  it('Esc sale de la presentación', () => {
    usePdfStore.getState().togglePresentationMode()
    render(<PresentationView />)
    pulsar('Escape')
    expect(usePdfStore.getState().presentationMode).toBe(false)
  })

  it('precarga la página siguiente para que el pase no espere al rasterizado', async () => {
    render(<PresentationView />)
    await act(async () => { await Promise.resolve() })
    const paginas = vi.mocked(renderPdfPage).mock.calls.map((c) => c[2])
    expect(paginas).toContain(0)
    expect(paginas).toContain(1)
  })
})
