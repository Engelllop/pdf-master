import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePdfActions } from './usePdfActions'
import { usePdfStore } from '../store/usePdfStore'
import { type FormValues } from '../components/FormModal'

const initialState = usePdfStore.getState()

function openDoc(pages = 4) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\a.pdf',
    page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
  return usePdfStore.getState().docs[0]
}

function okFetch(json: unknown = { success: true }) {
  return vi.fn((_path: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true, status: 200, json: async () => json, text: async () => '' } as unknown as Response))
}

const helpers = () => ({
  askForm: vi.fn(async (): Promise<FormValues | null> => ({ text: 'CONFIDENCIAL' })),
  askConfirm: vi.fn(async (): Promise<boolean> => true),
  toastActionError: vi.fn(),
})

function setup(h = helpers()) {
  const doc = openDoc()
  const r = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: doc } })
  return { ...r, h, doc }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  Object.assign(window, { api: {
    saveFile: vi.fn(async () => 'C:\\out.pdf'),
    openFile: vi.fn(async () => 'C:\\img.png'),
    readFileBase64: vi.fn(async () => 'QkFTRTY0'),
    logError: vi.fn(async () => {}),
  } })
})

describe('handleToolClick', () => {
  it('activa y alterna una herramienta no-imagen', async () => {
    const { result } = setup()
    await act(async () => { await result.current.handleToolClick('text') })
    expect(usePdfStore.getState().activeTool).toBe('text')
    await act(async () => { await result.current.handleToolClick('text') })
    expect(usePdfStore.getState().activeTool).toBeNull()
  })

  it('para "image" carga el archivo y deja la herramienta lista', async () => {
    const { result } = setup()
    await act(async () => { await result.current.handleToolClick('image') })
    expect(window.api.openFile).toHaveBeenCalled()
    expect(usePdfStore.getState().activeTool).toBe('image')
    expect(usePdfStore.getState().selectedImageData).toContain('base64,QkFTRTY0')
  })
})

describe('handleWatermark', () => {
  it('pide el texto, llama a /watermark y marca el doc como modificado', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const h = helpers()
    const { result } = setup(h)
    await act(async () => { await result.current.handleWatermark() })
    expect(h.askForm).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pdf/watermark/doc-1'), expect.objectContaining({ method: 'POST' }))
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })

  it('no llama al backend si el usuario cancela el formulario', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const h = { ...helpers(), askForm: vi.fn(async () => null) }
    const { result } = setup(h)
    await act(async () => { await result.current.handleWatermark() })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('handleSplit', () => {
  it('para "even" envía los índices de páginas pares (1-based impares en 0-index)', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await act(async () => { await result.current.handleSplit('even') })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.pages).toEqual([1, 3])
  })
})
