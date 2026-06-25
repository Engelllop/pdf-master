import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useImageEdit } from './useImageEdit'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()
// display 400x300, original 800x600 → display = original / 2
const pageData = { width: 400, height: 300, originalWidth: 800, originalHeight: 600 }

function openDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
  return usePdfStore.getState().docs[0]
}

function setup() {
  const doc = openDoc()
  return renderHook(() => useImageEdit(doc, pageData))
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('imgLocalOf', () => {
  it('escala el rect en puntos PDF a coordenadas de pantalla', () => {
    const { result } = setup()
    // imagen en 100..300 pt → 50..150 px (factor 0.5)
    expect(result.current.imgLocalOf({ xref: 7, x0: 100, y0: 100, x1: 300, y1: 200 }))
      .toEqual({ l: 50, t: 50, w: 100, h: 50 })
  })
})

describe('carga de imágenes de la página', () => {
  it('hace fetch a /images cuando la herramienta es editimage', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ images: [{ xref: 7, x0: 0, y0: 0, x1: 10, y1: 10 }] }) }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    usePdfStore.setState({ activeTool: 'editimage' })
    const { result } = setup()
    await waitFor(() => expect(result.current.pageImages).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pdf/images/doc-1/0'))
  })
})

describe('applyImageTransform', () => {
  it('delete: llama a /transform-image con delete y marca dirty', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    const im = { xref: 7, x0: 100, y0: 100, x1: 300, y1: 200 }
    await act(async () => { await result.current.applyImageTransform(im, { delete: true }) })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/pdf/transform-image/doc-1')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ xref: 7, delete: true })
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })
})
