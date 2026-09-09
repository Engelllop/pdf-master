import { describe, it, expect, vi, beforeEach } from 'vitest'

// La ruta de pérdida de trabajo (cerrar una pestaña con marcas sin guardar) no tenía
// ni un test: 566 tests y ninguno cubría lo único que puede tirar a la basura una
// mañana de marcas.

const closeDoc = vi.fn()
const showToast = vi.fn()
const updateRecentMeta = vi.fn()
const saveDocument = vi.fn(async (_docId: string) => true)
const askUnsaved = vi.fn(async (_ids: string[]) => 'discard' as 'save' | 'discard' | 'cancel')

type DocFalso = { doc_id: string; file_name: string; file_path: string; dirty: boolean; currentPage: number; page_count: number }
let docs: DocFalso[] = []

vi.mock('../store/usePdfStore', () => ({
  usePdfStore: { getState: () => ({ docs, closeDoc, showToast }) },
}))
vi.mock('./recents', () => ({ updateRecentMeta: (p: string, m: unknown) => updateRecentMeta(p, m) }))
vi.mock('./saveDocument', () => ({ saveDocument: (id: string) => saveDocument(id) }))
vi.mock('./unsavedPrompt', () => ({ askUnsaved: (ids: string[]) => askUnsaved(ids) }))

import { requestCloseDoc, requestCloseDocs } from './closeDocument'

const doc = (over: Partial<DocFalso> = {}): DocFalso => ({
  doc_id: 'd1',
  file_name: 'plano-a.pdf',
  file_path: 'C:\\planos\\plano-a.pdf',
  dirty: false,
  currentPage: 4,
  page_count: 12,
  ...over,
})

beforeEach(() => {
  closeDoc.mockClear(); showToast.mockClear(); updateRecentMeta.mockClear()
  saveDocument.mockClear(); saveDocument.mockResolvedValue(true)
  askUnsaved.mockClear(); askUnsaved.mockResolvedValue('discard')
  docs = [doc()]
})

describe('cerrar un documento sin cambios', () => {
  it('cierra sin preguntar y guarda la última página en recientes', async () => {
    expect(await requestCloseDoc('d1')).toBe(true)
    expect(askUnsaved).not.toHaveBeenCalled()
    expect(closeDoc).toHaveBeenCalledWith('d1')
    expect(updateRecentMeta).toHaveBeenCalledWith('C:\\planos\\plano-a.pdf', { lastPage: 4, pageCount: 12 })
  })

  it('un doc_id que ya no está se considera cerrado, sin tocar nada', async () => {
    docs = []
    expect(await requestCloseDoc('fantasma')).toBe(true)
    expect(closeDoc).not.toHaveBeenCalled()
    expect(updateRecentMeta).not.toHaveBeenCalled()
  })
})

describe('cerrar un documento con cambios sin guardar', () => {
  beforeEach(() => { docs = [doc({ dirty: true })] })

  it('pregunta antes de descartar nada', async () => {
    await requestCloseDoc('d1')
    expect(askUnsaved).toHaveBeenCalledWith(['d1'])
  })

  it('«cancelar» NO cierra y lo dice al que llamó', async () => {
    askUnsaved.mockResolvedValue('cancel')
    expect(await requestCloseDoc('d1')).toBe(false)
    expect(closeDoc).not.toHaveBeenCalled()
    expect(saveDocument).not.toHaveBeenCalled()
    // Ni siquiera se toca recientes: el documento sigue abierto.
    expect(updateRecentMeta).not.toHaveBeenCalled()
  })

  it('«descartar» cierra sin guardar', async () => {
    askUnsaved.mockResolvedValue('discard')
    expect(await requestCloseDoc('d1')).toBe(true)
    expect(saveDocument).not.toHaveBeenCalled()
    expect(closeDoc).toHaveBeenCalledWith('d1')
  })

  it('«guardar» guarda primero y solo entonces cierra', async () => {
    askUnsaved.mockResolvedValue('save')
    expect(await requestCloseDoc('d1')).toBe(true)
    expect(saveDocument).toHaveBeenCalledWith('d1')
    expect(closeDoc).toHaveBeenCalledWith('d1')
  })

  it('si el guardado falla NO se cierra: perder el trabajo por un disco lleno sería peor', async () => {
    askUnsaved.mockResolvedValue('save')
    saveDocument.mockResolvedValue(false)
    expect(await requestCloseDoc('d1')).toBe(false)
    expect(closeDoc).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('No se pudo guardar'), 'error')
  })

  it('si el documento se guardó mientras el diálogo estaba abierto, no se vuelve a guardar', async () => {
    askUnsaved.mockImplementation(async () => {
      // Alguien lo guardó con Ctrl+S mientras el aviso estaba en pantalla.
      docs = [doc({ dirty: false })]
      return 'save'
    })
    expect(await requestCloseDoc('d1')).toBe(true)
    expect(saveDocument).not.toHaveBeenCalled()
    expect(closeDoc).toHaveBeenCalledWith('d1')
  })
})

describe('cerrar varios («cerrar las demás», «cerrar todas»)', () => {
  beforeEach(() => {
    docs = [doc({ doc_id: 'd1' }), doc({ doc_id: 'd2' }), doc({ doc_id: 'd3' })]
  })

  it('los cierra en fila', async () => {
    await requestCloseDocs(['d1', 'd2', 'd3'])
    expect(closeDoc.mock.calls.map((c) => c[0])).toEqual(['d1', 'd2', 'd3'])
  })

  it('se detiene en el primero que el usuario cancela: los de atrás no se tocan', async () => {
    docs = [doc({ doc_id: 'd1' }), doc({ doc_id: 'd2', dirty: true }), doc({ doc_id: 'd3' })]
    askUnsaved.mockResolvedValue('cancel')
    await requestCloseDocs(['d1', 'd2', 'd3'])
    expect(closeDoc.mock.calls.map((c) => c[0])).toEqual(['d1'])
  })

  it('un solo diálogo por documento sucio, no uno por cada uno a la vez', async () => {
    docs = [doc({ doc_id: 'd1', dirty: true }), doc({ doc_id: 'd2', dirty: true })]
    askUnsaved.mockResolvedValue('discard')
    await requestCloseDocs(['d1', 'd2'])
    expect(askUnsaved.mock.calls).toEqual([[['d1']], [['d2']]])
  })
})
