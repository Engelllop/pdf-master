import { describe, it, expect, beforeEach, vi } from 'vitest'
import { anotarPaso, marcasEnVersionDeDisco, pasoDeMarcas, remapAnnsAfterDelete, remapAnnsAfterInsert, remapAnnsAfterRotate, rotatePagesUndoable, remapPageIndexAfterDelete, deletePagesUndoable, invertOrder, reorderPagesUndoable, cropPageUndoable, watermarkUndoable, mergePdfUndoable, replaceTextUndoable, metadataUndoable, makeSearchableUndoable, formFieldUndoable, addFormFieldUndoable, transformFormFieldUndoable } from './pageUndo'
import { usePdfStore, type Annotation, type PageCommand } from '../store/usePdfStore'

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
      expect(last.inverse).toEqual({ type: 'replace', page: 0, stashId: 'crop-1', desplazar: { dx: 10, dy: 10 } })
    }
    vi.unstubAllGlobals()
  })

  it('mueve las marcas de la página al nuevo origen y deshacer las devuelve', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1',
      file_path: 'C:\\a.pdf',
      page_count: 2,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 100, height: 100 }, { page_num: 1, width: 100, height: 100 }],
    })
    const antes: Annotation[] = [
      { id: 'r', type: 'rect', page: 0, x: 40, y: 50, width: 10, height: 10 },
      { id: 'd', type: 'draw', page: 0, x: 40, y: 50, points: [{ x: 40, y: 50 }, { x: 45, y: 55 }] },
      { id: 'otra', type: 'rect', page: 1, x: 40, y: 50, width: 10, height: 10 },
    ]
    usePdfStore.getState().setAnnotations('doc-1', antes)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ success: true, stash_id: 's' }) })))
    await cropPageUndoable('doc-1', 0, { top: 20, right: 0, bottom: 0, left: 30 })
    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns.find((m) => m.id === 'r')).toMatchObject({ x: 10, y: 30 })
    expect(anns.find((m) => m.id === 'd')?.points).toEqual([{ x: 10, y: 30 }, { x: 15, y: 35 }])
    expect(anns.find((m) => m.id === 'otra')).toMatchObject({ x: 40, y: 50 })
    const last = usePdfStore.getState().undoStack.at(-1)
    expect(last?.kind === 'page' && last.beforeAnns).toEqual(antes)
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

// Las marcas viven en el espacio de la VISTA (viewport de PDF.js a escala 1, que ya
// incluye el /Rotate): al girar la página el contenido se mueve y las marcas tienen que
// ir con él. Antes se quedaban clavadas y un cuadro sobre un muro pasaba a no rodear nada.
describe('remapAnnsAfterRotate', () => {
  // Página apaisada 600×400 (en la vista): girar 90° la deja 400×600.
  const sizes = [{ page_num: 0, width: 600, height: 400 }, { page_num: 1, width: 300, height: 200 }]
  const caja: Annotation = { id: 'r', type: 'rect', page: 0, x: 10, y: 20, width: 100, height: 50 }
  const geo = (x: Annotation) => ({ x: x.x, y: x.y, width: x.width, height: x.height })

  it('90°: la esquina de arriba a la izquierda pasa a arriba a la derecha', () => {
    const [r] = remapAnnsAfterRotate([caja], [0], 90, sizes)
    expect(geo(r)).toEqual({ x: 330, y: 10, width: 50, height: 100 })
  })

  it('180°: queda en la esquina opuesta con el mismo tamaño', () => {
    const [r] = remapAnnsAfterRotate([caja], [0], 180, sizes)
    expect(geo(r)).toEqual({ x: 490, y: 330, width: 100, height: 50 })
  })

  it('270° (y -90°, que es el inverso de deshacer)', () => {
    expect(geo(remapAnnsAfterRotate([caja], [0], 270, sizes)[0])).toEqual({ x: 20, y: 490, width: 50, height: 100 })
    expect(geo(remapAnnsAfterRotate([caja], [0], -90, sizes)[0])).toEqual({ x: 20, y: 490, width: 50, height: 100 })
  })

  it('90° y luego -90° devuelve la marca a su sitio', () => {
    const girada = remapAnnsAfterRotate([caja], [0], 90, sizes)
    const vuelta = remapAnnsAfterRotate(girada, [0], -90, [{ page_num: 0, width: 400, height: 600 }, sizes[1]])
    expect(geo(vuelta[0])).toEqual(geo(caja))
  })

  it('líneas: el vector al otro extremo gira con signo; los puntos también', () => {
    const linea: Annotation = { id: 'l', type: 'line', page: 0, x: 10, y: 20, width: 100, height: 50 }
    const trazo: Annotation = { id: 'd', type: 'draw', page: 0, x: 10, y: 20, points: [{ x: 10, y: 20 }, { x: 110, y: 70 }] }
    const [l, d] = remapAnnsAfterRotate([linea, trazo], [0], 90, sizes)
    expect(geo(l)).toEqual({ x: 380, y: 10, width: -50, height: 100 })
    expect(d.points).toEqual([{ x: 380, y: 10 }, { x: 330, y: 110 }])
    expect({ x: d.x, y: d.y }).toEqual({ x: 380, y: 10 })
  })

  it('texto e imagen conservan su caja y se mudan con el centro; la imagen gira', () => {
    const img: Annotation = { id: 'i', type: 'image', page: 0, x: 10, y: 20, width: 100, height: 50 }
    const txt: Annotation = { id: 't', type: 'text', page: 0, x: 10, y: 20, width: 100, height: 50, text: 'hola' }
    const [i, t] = remapAnnsAfterRotate([img, txt], [0], 90, sizes)
    expect(geo(i)).toEqual({ x: 305, y: 35, width: 100, height: 50 })
    expect(i.rotation).toBe(90)
    expect(geo(t)).toEqual({ x: 305, y: 35, width: 100, height: 50 })
    expect(t.rotation).toBeUndefined()
  })

  it("'all' gira todas las páginas, cada una con su tamaño; una lista solo las suyas", () => {
    const otra: Annotation = { ...caja, id: 'r1', page: 1 }
    const todas = remapAnnsAfterRotate([caja, otra], 'all', 90, sizes)
    expect(geo(todas[0])).toEqual({ x: 330, y: 10, width: 50, height: 100 })
    expect(geo(todas[1])).toEqual({ x: 130, y: 10, width: 50, height: 100 })
    const soloLa1 = remapAnnsAfterRotate([caja, otra], [1], 90, sizes)
    expect(soloLa1[0]).toBe(caja)
    expect(geo(soloLa1[1])).toEqual({ x: 130, y: 10, width: 50, height: 100 })
  })
})

describe('rotatePagesUndoable', () => {
  it('gira las marcas con la página y deshacer las devuelve a su sitio', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1', file_path: 'C:/a.pdf', page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 600, height: 400 }],
    })
    const original: Annotation = { id: 'r', type: 'rect', page: 0, x: 10, y: 20, width: 100, height: 50 }
    usePdfStore.getState().addAnnotation('doc-1', original)
    let girada = false
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const path = String(url)
      if (path.includes('/rotate/')) girada = !girada
      if (path.includes('/info/')) {
        const s = girada ? { width: 400, height: 600 } : { width: 600, height: 400 }
        return Promise.resolve({ ok: true, json: async () => ({ page_count: 1, page_sizes: [{ page_num: 0, ...s }] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
    }))

    await rotatePagesUndoable('doc-1', [0], 90)
    const tras = usePdfStore.getState().docs[0].annotations[0]
    expect({ x: tras.x, y: tras.y, width: tras.width, height: tras.height }).toEqual({ x: 330, y: 10, width: 50, height: 100 })

    usePdfStore.getState().undo()
    await vi.waitFor(() => expect(usePdfStore.getState().pageUndoBusy).toBe(false))
    await vi.waitFor(() => expect(usePdfStore.getState().docs[0].page_sizes[0].width).toBe(600))
    const deshecha = usePdfStore.getState().docs[0].annotations[0]
    expect({ x: deshecha.x, y: deshecha.y, width: deshecha.width, height: deshecha.height })
      .toEqual({ x: 10, y: 20, width: 100, height: 50 })

    usePdfStore.getState().redo()
    await vi.waitFor(() => expect(usePdfStore.getState().docs[0].page_sizes[0].width).toBe(400))
    expect(usePdfStore.getState().docs[0].annotations[0].x).toBe(330)
    vi.unstubAllGlobals()
  })
})

describe('marcasEnVersionDeDisco', () => {
  const tam = (n: number) => Array.from({ length: n }, (_, i) => ({ page_num: i, width: 100, height: 200 }))

  it('borrar varias hojas: re-inserta en su lugar y devuelve las marcas de las borradas', () => {
    const antes = [a(0), a(1), a(2), a(3), a(4)]
    const paso = pasoDeMarcas({ type: 'remove', pages: [3, 1] }, antes, tam(5))!
    const despues = remapAnnsAfterDelete(antes, [1, 3])
    const r = marcasEnVersionDeDisco(despues, [paso])
    expect(r.anns.map((m) => `${m.id}@${m.page}`).sort()).toEqual(['p0@0', 'p1@1', 'p2@2', 'p3@3', 'p4@4'])
    expect(r.descartadas).toBe(0)
  })

  it('girar todo 90° y revertir deja cada marca donde estaba', () => {
    const antes: Annotation[] = [{ id: 'l', type: 'line', page: 1, x: 5, y: 7, width: 20, height: -3 }]
    const paso = pasoDeMarcas({ type: 'rotate', pages: 'all', degrees: 90 }, antes, tam(2))!
    const girado = remapAnnsAfterRotate(antes, 'all', 90, tam(2))
    expect(marcasEnVersionDeDisco(girado, [paso]).anns).toEqual(antes)
  })

  it('las operaciones que no mueven marcas no anotan nada', () => {
    expect(pasoDeMarcas({ type: 'watermark', text: 'X' }, [a(0)], tam(1))).toBeNull()
    expect(pasoDeMarcas({ type: 'replace', page: 0, stashId: 's' }, [a(0)], tam(1))).toBeNull()
  })

  it('recortar y revertir devuelve las marcas a su origen, también tras deshacer', () => {
    const antes: Annotation[] = [{ id: 'r', type: 'rect', page: 0, x: 40, y: 50, width: 10, height: 10 }]
    const recorte = pasoDeMarcas({ type: 'crop', page: 0, top: 20, right: 0, bottom: 0, left: 30 }, antes, tam(1))!
    const recortado = marcasEnVersionDeDisco(antes, []).anns.map((m) => ({ ...m, x: m.x - 30, y: m.y - 20 }))
    expect(marcasEnVersionDeDisco(recortado, [recorte]).anns).toEqual(antes)
    const deshacer = pasoDeMarcas({ type: 'replace', page: 0, stashId: 's', desplazar: { dx: 30, dy: 20 } }, recortado, tam(1))!
    expect(marcasEnVersionDeDisco(antes, [deshacer]).anns).toEqual(recortado)
  })
})

describe('anotarPaso', () => {
  const cmd = { kind: 'page', docId: 'd' } as PageCommand
  const paso = { type: 'insert' as const, pages: [0] }

  it('deshacer el último paso anotado lo cancela', () => {
    const log = anotarPaso(undefined, cmd, 'forward', paso)
    expect(anotarPaso(log, cmd, 'inverse', { type: 'delete', pages: [0], dropped: [] })).toEqual([])
  })

  it('deshacer un paso de antes del guardado anota el contrario', () => {
    expect(anotarPaso(undefined, cmd, 'inverse', paso)).toEqual([{ cmd, sentido: 'inverse', paso }])
  })
})
