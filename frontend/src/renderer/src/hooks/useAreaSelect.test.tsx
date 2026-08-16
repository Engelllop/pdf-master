import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAreaSelect } from './useAreaSelect'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()
// display 400x300, original 800x600 → factor de escala a puntos PDF = 2
const pageData = { width: 400, height: 300, originalWidth: 800, originalHeight: 600 }

function openDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
  return usePdfStore.getState().docs[0]
}

function okFetch() {
  return vi.fn((_path: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, stash_id: 's1' }), text: async () => '' } as unknown as Response))
}

function setup() {
  const doc = openDoc()
  return renderHook(() => useAreaSelect(doc, pageData))
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  Object.assign(window, { api: { getApiToken: async () => '' } })
})

describe('setArea', () => {
  it('sincroniza estado y ref', () => {
    const { result } = setup()
    act(() => { result.current.setArea({ x0: 1, y0: 2, x1: 3, y1: 4 }) })
    expect(result.current.areaSel).toEqual({ x0: 1, y0: 2, x1: 3, y1: 4 })
    expect(result.current.areaSelRef.current).toEqual({ x0: 1, y0: 2, x1: 3, y1: 4 })
  })
})

describe('applyArea', () => {
  it('redactarea: escala las coordenadas a puntos PDF y marca dirty', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await act(async () => { await result.current.applyArea('redactarea', { x0: 10, y0: 10, x1: 60, y1: 40 }) })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/pdf/redact/doc-1')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ x: 20, y: 20, width: 100, height: 60 })
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })

  it('ignora selecciones demasiado pequeñas sin llamar al backend', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await act(async () => { await result.current.applyArea('croparea', { x0: 10, y0: 10, x1: 11, y1: 11 }) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
