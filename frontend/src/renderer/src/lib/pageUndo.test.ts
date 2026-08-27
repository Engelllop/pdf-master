import { describe, it, expect, beforeEach, vi } from 'vitest'
import { remapAnnsAfterDelete, remapAnnsAfterInsert, remapPageIndexAfterDelete, deletePagesUndoable, invertOrder, reorderPagesUndoable, cropPageUndoable, watermarkUndoable, mergePdfUndoable, replaceTextUndoable, metadataUndoable, makeSearchableUndoable, formFieldUndoable, addFormFieldUndoable, transformFormFieldUndoable } from './pageUndo'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initial = usePdfStore.getState()

beforeEach(() => {
  usePdfStore.setState(initial, true)
  Object.assign(window, { api: { getApiToken: async () => '' } })
})

function a(page: number, id = `p${page}`): Annotation {
  return { id, type: 'note', page, x: 10, y: 10 }
}

describe('remapAnnsAfterDelete', () => {
  it('saca las marcas de las páginas borradas y corre el resto', () => {
    const anns = [a(0), a(1), a(2), a(3)]
    expect(remapAnnsAfterDelete(anns, [1, 2]).map((x) => x.page)).toEqual([0, 1])
    expect(remapAnnsAfterDelete(anns, [1, 2]).map((x) => x.id)).toEqual(['p0', 'p3'])
  })

  it('borrar la primera página corre todas', () => {
    expect(remapAnnsAfterDelete([a(0), a(1)], [0]).map((x) => x.page)).toEqual([0])
  })
})

describe('remapAnnsAfterInsert', () => {
  it('corre las marcas desde el índice insertado', () => {
    expect(remapAnnsAfterInsert([a(0), a(1), a(2)], [1]).map((x) => x.page)).toEqual([0, 2, 3])
  })
})

describe('remapPageIndexAfterDelete', () => {
  it('mantiene el índice si la página actual no se borró', () => {
    expect(remapPageIndexAfterDelete(2, [0])).toBe(1)
    expect(remapPageIndexAfterDelete(0, [2])).toBe(0)
  })
})

describe('deletePagesUndoable', () => {
  it('apila un comando de página y remapea las marcas', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 3,
      title: null, author: null, subject: null,
      page_sizes: [0, 1, 2].map((i) => ({ page_num: i, width: 100, height: 100 })),
    })
    usePdfStore.getState().addAnnotation('doc-1', a(0, 'n0'))
    usePdfStore.getState().addAnnotation('doc-1', a(1, 'n1'))
    usePdfStore.getState().addAnnotation('doc-1', a(2, 'n2'))

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/delete-pages/')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 'stash-1' }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            page_count: 2,
            page_sizes: [0, 1].map((i) => ({ page_num: i, width: 100, height: 100 })),
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))

    await deletePagesUndoable('doc-1', [1])
    const state = usePdfStore.getState()
    expect(state.docs[0].annotations.map((x) => x.id)).toEqual(['n0', 'n2'])
    expect(state.docs[0].annotations.map((x) => x.page)).toEqual([0, 1])
    const last = state.undoStack[state.undoStack.length - 1]
    expect(last.kind).toBe('page')
    if (last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'restore', stashId: 'stash-1', at: [1] })
    }
    vi.unstubAllGlobals()
  })
})

describe('invertOrder', () => {
  it('invierte una permutación', () => {
    expect(invertOrder([2, 0, 1])).toEqual([1, 2, 0])
    expect(invertOrder([0, 1, 2])).toEqual([0, 1, 2])
  })
})

describe('reorderPagesUndoable', () => {
  it('apila el orden inverso y remapea marcas', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 3,
      title: null, author: null, subject: null,
      page_sizes: [0, 1, 2].map((i) => ({ page_num: i, width: 100, height: 100 })),
    })
    usePdfStore.getState().addAnnotation('doc-1', a(0, 'n0'))
    usePdfStore.getState().addAnnotation('doc-1', a(2, 'n2'))

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true }) }),
    ))

    await reorderPagesUndoable('doc-1', [2, 0, 1])
    const state = usePdfStore.getState()
    expect(state.docs[0].annotations.find((x) => x.id === 'n0')?.page).toBe(1)
    expect(state.docs[0].annotations.find((x) => x.id === 'n2')?.page).toBe(0)
    const last = state.undoStack[state.undoStack.length - 1]
    expect(last.kind).toBe('page')
    if (last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'reorder', order: [1, 2, 0] })
    }
    vi.unstubAllGlobals()
  })
})

describe('cropPageUndoable', () => {
  it('guarda el stash para poder deshacer', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/crop/')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 'crop-1' }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ page_count: 1, page_sizes: [{ page_num: 0, width: 80, height: 80 }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    await cropPageUndoable('doc-1', 0, { top: 10, right: 10, bottom: 10, left: 10 })
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'crop-1' })
    }
    vi.unstubAllGlobals()
  })
})

describe('watermarkUndoable', () => {
  it('apila restoreDoc con el stash', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/watermark/')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 'wm-1' }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ page_count: 1, page_sizes: [{ page_num: 0, width: 100, height: 100 }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    await watermarkUndoable('doc-1', 'CONFIDENCIAL')
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'restoreDoc', stashId: 'wm-1' })
      expect(last.forward).toEqual({ type: 'watermark', text: 'CONFIDENCIAL' })
    }
    vi.unstubAllGlobals()
  })

  // El rango tiene que viajar en el cuerpo Y quedar en el comando: si no, rehacer
  // (Ctrl+Y) volvía a sellar el documento entero.
  it('manda el rango de páginas y lo guarda para rehacer', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:/a.pdf',
      page_count: 10,
      title: null, author: null, subject: null,
      page_sizes: Array.from({ length: 10 }, (_, i) => ({ page_num: i, width: 100, height: 100 })),
    })
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.includes('/watermark/')) {
        body = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 'wm-2' }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ page_count: 10, page_sizes: [{ page_num: 0, width: 100, height: 100 }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    await watermarkUndoable('doc-1', 'BORRADOR', [0, 1, 4])
    expect(body.pages).toEqual([0, 1, 4])
    const last = usePdfStore.getState().undoStack.at(-1)
    if (last && last.kind === 'page') {
      expect(last.forward).toEqual({ type: 'watermark', text: 'BORRADOR', pages: [0, 1, 4] })
    }
    vi.unstubAllGlobals()
  })
})

describe('mergePdfUndoable', () => {
  it('deshace sacando las páginas agregadas', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 2,
      title: null, author: null, subject: null,
      page_sizes: [0, 1].map((i) => ({ page_num: i, width: 100, height: 100 })),
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/merge/')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            page_count: 5,
            page_sizes: [0, 1, 2, 3, 4].map((i) => ({ page_num: i, width: 100, height: 100 })),
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    await mergePdfUndoable('doc-1', 'C:\\b.pdf')
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'remove', pages: [2, 3, 4] })
    }
    vi.unstubAllGlobals()
  })
})

describe('replaceTextUndoable', () => {
  it('apila replace de página cuando el stash es de una sola', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/replace-text/')) {
        return Promise.resolve({ ok: true, json: async () => ({ replaced: 2, stash_id: 'rt-1', stash_page: 0 }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ page_count: 1, page_sizes: [{ page_num: 0, width: 100, height: 100 }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    const n = await replaceTextUndoable('doc-1', {
      query: 'foo', replace: 'bar', page: 0, caseSensitive: false, replaceAll: true,
    })
    expect(n).toBe(2)
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'rt-1' })
    }
    vi.unstubAllGlobals()
  })
})

describe('metadataUndoable', () => {
  it('apila el comando con los metadatos anteriores', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: 'Viejo', author: 'Ana', subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, previous: { title: 'Viejo', author: 'Ana', subject: '', keywords: '' } }),
      }),
    ))
    await metadataUndoable('doc-1', { title: 'Nuevo', author: 'Ana' })
    const state = usePdfStore.getState()
    expect(state.docs[0].title).toBe('Nuevo')
    const last = state.undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse.type).toBe('metadata')
      if (last.inverse.type === 'metadata') expect(last.inverse.title).toBe('Viejo')
      expect(last.forward).toEqual({ type: 'metadata', title: 'Nuevo', author: 'Ana' })
    }
    vi.unstubAllGlobals()
  })
})

describe('makeSearchableUndoable', () => {
  it('apila replace de página cuando el stash es de una sola', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/make-searchable/')) {
        return Promise.resolve({ ok: true, json: async () => ({ words: 4, stash_id: 'ocr-1', stash_page: 0 }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ page_count: 1, page_sizes: [{ page_num: 0, width: 100, height: 100 }] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    const n = await makeSearchableUndoable('doc-1', 0)
    expect(n).toBe(4)
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'ocr-1' })
      expect(last.forward).toEqual({ type: 'makeSearchable', page: 0 })
    }
    vi.unstubAllGlobals()
  })
})

describe('formFieldUndoable', () => {
  it('apila el valor anterior del campo', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, previous: '', stash_id: 'ff-1' }) }),
    ))
    await formFieldUndoable('doc-1', 0, 'nombre', 'Ana')
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'ff-1' })
      expect(last.forward).toEqual({ type: 'formField', page: 0, fieldName: 'nombre', value: 'Ana' })
    }
    vi.unstubAllGlobals()
  })
})

// Un campo con widgets en varias páginas se actualiza en todas, así que el motor
// stashea el documento entero. El cliente exige la bandera explícita: deducirlo de que
// falte `stash_page` haría que un motor viejo —que solo stashea páginas— restaurara un
// stash de UNA hoja encima del documento completo.
describe('formFieldUndoable con campo en varias páginas', () => {
  function conRespuesta(extra: Record<string, unknown>) {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1', file_path: 'C:/f.pdf', page_count: 2,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }, { page_num: 1, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/widgets/')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, previous: 'viejo', stash_id: 'ff-9', ...extra }) })
      }
      if (path.includes('/info/')) {
        return Promise.resolve({ ok: true, json: async () => ({ page_count: 2, page_sizes: [{ page_num: 0, width: 100, height: 100 }] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
  }

  it("con scope 'document' apila restaurar el documento", async () => {
    conRespuesta({ stash_page: null, stash_scope: 'document' })
    await formFieldUndoable('doc-1', 0, 'Nombre', 'Engell')
    const last = usePdfStore.getState().undoStack.at(-1)
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'restoreDoc', stashId: 'ff-9' })
    }
    vi.unstubAllGlobals()
  })

  it('sin bandera (motor viejo) apila restaurar la página, no el documento', async () => {
    conRespuesta({})
    await formFieldUndoable('doc-1', 0, 'Nombre', 'Engell')
    const last = usePdfStore.getState().undoStack.at(-1)
    if (last && last.kind === 'page') {
      expect(last.inverse.type).toBe('replace')
    }
    vi.unstubAllGlobals()
  })
})

describe('addFormFieldUndoable', () => {
  it('apila replace de página con el stash', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, field_name: 'texto', stash_id: 'af-1' }) }),
    ))
    const name = await addFormFieldUndoable('doc-1', {
      page: 0, fieldType: 'text', fieldName: 'texto', x: 10, y: 20, width: 80, height: 16,
    })
    expect(name).toBe('texto')
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'af-1' })
      expect(last.forward.type).toBe('addFormField')
    }
    vi.unstubAllGlobals()
  })
})

describe('transformFormFieldUndoable', () => {
  it('apila el stash al borrar un campo', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }],
    })
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 'tf-1' }) }),
    ))
    await transformFormFieldUndoable('doc-1', 0, { xref: 11, delete: true })
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind).toBe('page')
    if (last && last.kind === 'page') {
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'tf-1' })
      expect(last.forward).toEqual({ type: 'transformFormField', page: 0, xref: 11, delete: true })
    }
    vi.unstubAllGlobals()
  })
})
