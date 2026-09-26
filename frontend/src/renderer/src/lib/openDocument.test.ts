import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
let baseDelMotor = 'http://localhost:8745'
vi.mock('./api', () => ({
  apiFetch: (p: string, i?: RequestInit) => apiFetch(p, i),
  setDeadDocReopener: () => {},
  baseConocida: () => baseDelMotor,
}))
vi.mock('./uiPrompt', () => ({ askForm: vi.fn(async () => null) }))
vi.mock('./blobUrl', () => ({ revokePageUrl: () => {} }))

import { avisoDeReinicio, mensajeDeFallos, motivoDeApertura, openDocument, reopenDeadDoc } from './openDocument'
import { deletePagesUndoable, insertBlankUndoable, reorderPagesUndoable, rotatePagesUndoable } from './pageUndo'
import { usePdfStore, type Annotation, type PageCommand } from '../store/usePdfStore'
import { loadRecents } from './recents'

const initialState = usePdfStore.getState()

/** Respuesta del motor: 422 con el detalle que da cuando el archivo no está. */
const respuesta = (status: number, detail?: string) => ({
  ok: status < 400, status,
  json: async () => (detail !== undefined ? { detail } : {}),
} as unknown as Response)

const avisos = () => usePdfStore.getState().toasts.map((t) => t.message)

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  apiFetch.mockReset()
  vi.useRealTimers()
})

// El motor ya explica por qué falla (`detail`) y la app lo tiraba para decir siempre
// «No se pudo abrir el PDF»: con un plano movido, eso manda a buscar un problema que no
// existe.
describe('el motivo del fallo', () => {
  it('un archivo que ya no está se dice tal cual', () => {
    expect(motivoDeApertura('a.pdf', 422, 'El archivo no existe: C:/planos/a.pdf'))
      .toContain('ya no está en esa carpeta')
  })

  it('otros 422 y el tope de tamaño usan el detalle del motor', () => {
    expect(motivoDeApertura('a.docx', 422, "Extensión no permitida: '.docx'")).toContain('no permitida')
    expect(motivoDeApertura('a.pdf', 413, 'El PDF supera el tope de 500 MB')).toContain('supera el tope')
  })

  it('el token rechazado señala al otro motor, no al PDF', () => {
    // El 403 del middleware del token significa que hay otro pdf-engine en el puerto:
    // con el genérico, el usuario buscaba el problema en el archivo.
    expect(motivoDeApertura('a.pdf', 403, 'unauthorized')).toContain('otro PDF Master')
    expect(motivoDeApertura('a.pdf', 403, 'unauthorized')).toContain('8745')
  })

  it('el 403 nombra el puerto que se está usando, no el 8745 de siempre', () => {
    // Con el fallback de puerto, decirle al usuario "el 8745" cuando el motor está en
    // el 8748 lo manda a mirar el proceso equivocado.
    baseDelMotor = 'http://localhost:8748'
    try {
      expect(motivoDeApertura('a.pdf', 403, 'unauthorized')).toContain('puerto 8748')
    } finally {
      baseDelMotor = 'http://localhost:8745'
    }
  })

  it('sin base conocida todavía, el 403 no inventa un puerto', () => {
    baseDelMotor = ''
    try {
      const msg = motivoDeApertura('a.pdf', 403, 'unauthorized')
      expect(msg).toContain('otro PDF Master')
      expect(msg).not.toMatch(/\d{4}/)
    } finally {
      baseDelMotor = 'http://localhost:8745'
    }
  })

  it('un fallo sin explicación cae al mensaje genérico', () => {
    expect(motivoDeApertura('a.pdf', 500, '')).toBe('No se pudo abrir «a.pdf»')
  })
})

// Un lote de 60 planos no puede sacar 60 avisos.
describe('avisos de un lote', () => {
  it('uno solo dice el motivo', () => {
    expect(mensajeDeFallos(1, 1, '«a.pdf» ya no está')).toBe('«a.pdf» ya no está')
  })

  it('si TODOS faltan, eso es lo útil: se movió la carpeta', () => {
    expect(mensajeDeFallos(12, 12, 'x')).toBe('No se encontraron 12 PDFs: ¿movidos o borrados?')
  })

  it('mezcla: dice cuántos ya no están', () => {
    expect(mensajeDeFallos(12, 3, 'x')).toContain('3 ya no están')
  })

  it('ninguno falta: solo la cuenta', () => {
    expect(mensajeDeFallos(12, 0, null)).toBe('No se pudieron abrir 12 PDFs')
  })
})

describe('abrir un archivo que ya no está', () => {
  it('avisa nombrándolo y lo quita de recientes', async () => {
    localStorage.setItem('pdfmaster_recent_v2', JSON.stringify([
      { path: 'C:/planos/a.pdf', lastOpened: 1000 },
    ]))
    apiFetch.mockResolvedValue(respuesta(422, 'El archivo no existe: C:/planos/a.pdf'))
    expect(await openDocument('C:\\Planos\\A.pdf')).toBeNull()
    // El aviso se agrupa en una ventana corta.
    await new Promise((r) => setTimeout(r, 700))
    expect(avisos().join(' ')).toContain('ya no está en esa carpeta')
    expect(loadRecents()).toHaveLength(0)
  })

  // Una fijada la puso el usuario a propósito y el archivo puede volver (un disco de
  // red, una carpeta sincronizada que aún no bajó).
  it('respeta las fijadas', async () => {
    localStorage.setItem('pdfmaster_recent_v2', JSON.stringify([
      { path: 'C:/planos/a.pdf', lastOpened: 1000, pinned: true },
    ]))
    apiFetch.mockResolvedValue(respuesta(422, 'El archivo no existe: C:/planos/a.pdf'))
    expect(await openDocument('C:/planos/a.pdf')).toBeNull()
    expect(loadRecents()).toHaveLength(1)
  })

  it('un fallo que no es «no existe» no toca la lista', async () => {
    localStorage.setItem('pdfmaster_recent_v2', JSON.stringify([
      { path: 'C:/planos/a.pdf', lastOpened: 1000 },
    ]))
    apiFetch.mockResolvedValue(respuesta(500))
    expect(await openDocument('C:/planos/a.pdf')).toBeNull()
    expect(loadRecents()).toHaveLength(1)
  })
})

// Abrir el mismo PDF con la ruta escrita de otra forma abría una SEGUNDA pestaña: cada
// una con su lista de marcas, y guardar desde una descartaba las de la otra.
describe('el mismo archivo no abre dos pestañas', () => {
  it('activa la que ya está, aunque la ruta venga con otras barras', async () => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 3,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 612, height: 792 }],
    })
    usePdfStore.getState().addDoc({
      doc_id: 'doc-2', file_path: 'C:/planos/b.pdf', page_count: 1,
      title: null, author: null, subject: null,
      page_sizes: [{ page_num: 0, width: 612, height: 792 }],
    })
    expect(usePdfStore.getState().activeDocId).toBe('doc-2')

    expect(await openDocument('c:\\PLANOS\\a.pdf')).toBe('doc-1')
    expect(usePdfStore.getState().docs).toHaveLength(2)
    expect(usePdfStore.getState().activeDocId).toBe('doc-1')
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

// Tras un reinicio del motor se reabre el archivo de DISCO: lo que el motor muerto tenía
// sin guardar (rotar, borrar, OCR…) se perdió. Antes se remapeaba el id sin más: el
// store seguía con el page_count viejo, la pila de deshacer apuntaba a páginas que ya no
// existían y el usuario no se enteraba de nada.
describe('reabrir un documento tras un reinicio del motor', () => {
  const paginas = (n: number) => Array.from({ length: n }, (_, i) => ({ page_num: i, width: 612, height: 792 }))
  const pasoDePagina: PageCommand = {
    kind: 'page', docId: 'doc-1',
    inverse: { type: 'restore', stashId: 's', at: [3] },
    forward: { type: 'remove', pages: [3] },
    beforeAnns: [], afterAnns: [],
  }

  function abrirConCambiosDelMotor() {
    const s = usePdfStore.getState()
    s.addDoc({ doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 3, title: null, author: null, subject: null, page_sizes: paginas(3) })
    s.addAnnotation('doc-1', { id: 'm1', type: 'rect', page: 0, x: 1, y: 1, width: 5, height: 5 })
    usePdfStore.setState((st) => ({ undoStack: [...st.undoStack, pasoDePagina], redoStack: [{ ...pasoDePagina }] }))
    s.incrementDocVersion('doc-1')
    s.setPage('doc-1', 2)
    apiFetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ doc_id: 'doc-nuevo', page_count: 4, page_sizes: paginas(4) }),
    } as unknown as Response)
  }

  it('toma page_count y maquetación del archivo reabierto', async () => {
    abrirConCambiosDelMotor()
    expect(await reopenDeadDoc('doc-1')).toBe('doc-nuevo')
    const d = usePdfStore.getState().docs[0]
    expect(d.doc_id).toBe('doc-nuevo')
    expect(d.page_count).toBe(4)
    expect(d.page_sizes).toHaveLength(4)
    expect(d.engineDirty).toBe(false)
  })

  it('si el archivo tiene menos páginas, la página actual no queda fuera', async () => {
    abrirConCambiosDelMotor()
    apiFetch.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ doc_id: 'doc-nuevo', page_count: 1, page_sizes: paginas(1) }),
    } as unknown as Response)
    await reopenDeadDoc('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
  })

  it('tira los pasos de página de deshacer/rehacer y conserva los de marcas y las marcas', async () => {
    abrirConCambiosDelMotor()
    await reopenDeadDoc('doc-1')
    const st = usePdfStore.getState()
    expect(st.undoStack).toHaveLength(1)
    expect(st.undoStack[0].kind).not.toBe('page')
    expect(st.undoStack[0].docId).toBe('doc-nuevo')
    expect(st.redoStack).toHaveLength(0)
    expect(st.docs[0].annotations.map((a) => a.id)).toEqual(['m1'])
  })

  it('avisa, y el aviso no se va solo, si el motor tenía cambios sin guardar', async () => {
    vi.useFakeTimers()
    abrirConCambiosDelMotor()
    await reopenDeadDoc('doc-1')
    vi.advanceTimersByTime(10_000)
    const aviso = avisos().find((m) => m.includes('El motor se reinició'))
    expect(aviso).toContain('«a.pdf»')
    expect(aviso).toContain('las marcas se conservan')
  })

  it('sin cambios del motor (o ya guardados) no avisa', async () => {
    abrirConCambiosDelMotor()
    usePdfStore.getState().setDocDirty('doc-1', false)
    await reopenDeadDoc('doc-1')
    expect(avisos().some((m) => m.includes('El motor se reinició'))).toBe(false)
  })
})

// Los pasos de página sin guardar ya habían movido las marcas (borrar una hoja corre
// las de abajo). Al reabrir el archivo de disco, las marcas quedaban corridas respecto
// de las hojas: una cota del plano 3 aparecía en el plano 2.
describe('las marcas vuelven a la versión de disco tras un reinicio', () => {
  const tam = (n: number, w = 100, h = 200) => Array.from({ length: n }, (_, i) => ({ page_num: i, width: w, height: h }))
  const nota = (id: string, page: number, x = 10, y = 10): Annotation => ({ id, type: 'note', page, x, y })
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response)
  const marcas = () => Object.fromEntries(usePdfStore.getState().docs[0].annotations.map((m) => [m.id, m.page]))
  const aviso = () => avisos().find((m) => m.includes('El motor se reinició')) ?? ''

  let paginasDelMotor = 3
  function abrir(n = 3, anns: Annotation[] = [nota('n0', 0), nota('n1', 1), nota('n2', 2)]) {
    paginasDelMotor = n
    const s = usePdfStore.getState()
    s.addDoc({ doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: n, title: null, author: null, subject: null, page_sizes: tam(n) })
    s.setAnnotations('doc-1', anns)
    apiFetch.mockImplementation(async (p: string) => {
      if (p.startsWith('/pdf/open')) return ok({ doc_id: 'doc-nuevo', page_count: n, page_sizes: tam(n) })
      if (p.includes('/delete-pages/')) { paginasDelMotor--; return ok({ success: true, stash_id: 'st' }) }
      if (p.includes('/insert-blank/') || p.includes('/restore-pages/')) paginasDelMotor++
      if (p.includes('/info/')) return ok({ page_count: paginasDelMotor, page_sizes: tam(paginasDelMotor) })
      return ok({ success: true })
    })
  }
  const terminarDeshacer = () => vi.waitFor(() => expect(usePdfStore.getState().pageUndoBusy).toBe(false))

  it('borrar y reiniciar: cada marca vuelve a su hoja, también las de la hoja borrada', async () => {
    abrir()
    await deletePagesUndoable('doc-1', [1])
    expect(marcas()).toEqual({ n0: 0, n2: 1 })
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
    expect(aviso()).toContain('las marcas se reubicaron en la versión guardada.')
    expect(usePdfStore.getState().docs[0].pasosSinGuardar).toBeUndefined()
  })

  it('insertar y reiniciar: lo dibujado en la hoja nueva se descarta y se cuenta', async () => {
    abrir()
    await insertBlankUndoable('doc-1', 1)
    usePdfStore.getState().addAnnotation('doc-1', nota('nueva', 1))
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
    expect(aviso()).toContain('se descartaron 1 marca de una página que ya no existe')
  })

  it('reordenar y reiniciar: orden inverso', async () => {
    abrir()
    await reorderPagesUndoable('doc-1', [2, 0, 1])
    expect(marcas()).toEqual({ n0: 1, n1: 2, n2: 0 })
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
  })

  it('girar y reiniciar: la marca vuelve a su sitio de la hoja sin girar', async () => {
    abrir(1, [{ id: 'r', type: 'rect', page: 0, x: 10, y: 20, width: 30, height: 40 }])
    await rotatePagesUndoable('doc-1', [0], 90)
    expect(usePdfStore.getState().docs[0].annotations[0]).toMatchObject({ x: 140, y: 10, width: 40, height: 30 })
    await reopenDeadDoc('doc-1')
    expect(usePdfStore.getState().docs[0].annotations[0]).toMatchObject({ x: 10, y: 20, width: 30, height: 40 })
  })

  it('una edición de marcas entre pasos de página sobrevive', async () => {
    abrir()
    await deletePagesUndoable('doc-1', [0])
    const s = usePdfStore.getState()
    s.updateAnnotation('doc-1', 'n2', { x: 50 })
    s.addAnnotation('doc-1', nota('k', 0))
    s.deleteAnnotation('doc-1', 'n1')
    await reorderPagesUndoable('doc-1', [1, 0])
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, k: 1, n2: 2 })
    expect(usePdfStore.getState().docs[0].annotations.find((m) => m.id === 'n2')?.x).toBe(50)
  })

  it('deshacer un paso antes del reinicio no lo revierte dos veces', async () => {
    abrir()
    await deletePagesUndoable('doc-1', [1])
    usePdfStore.getState().undo()
    await terminarDeshacer()
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
    expect(usePdfStore.getState().docs[0].pasosSinGuardar ?? []).toHaveLength(0)
    usePdfStore.getState().updateAnnotation('doc-1', 'n1', { x: 77 })
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
    expect(usePdfStore.getState().docs[0].annotations.find((m) => m.id === 'n1')?.x).toBe(77)
    expect(aviso()).not.toContain('descartaron')
  })

  it('rehacer tras deshacer vuelve a anotar el paso', async () => {
    abrir()
    await deletePagesUndoable('doc-1', [1])
    usePdfStore.getState().undo()
    await terminarDeshacer()
    usePdfStore.getState().redo()
    await terminarDeshacer()
    expect(usePdfStore.getState().docs[0].pasosSinGuardar).toHaveLength(1)
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
  })

  it('guardar borra lo anotado; deshacer después anota el paso contrario', async () => {
    abrir()
    await deletePagesUndoable('doc-1', [1])
    usePdfStore.getState().setDocDirty('doc-1', false)
    expect(usePdfStore.getState().docs[0].pasosSinGuardar).toBeUndefined()
    // El disco ya no tiene la hoja 1: si se deshace el borrado y el motor muere, lo que
    // vivía en esa hoja no tiene dónde ir.
    usePdfStore.getState().undo()
    await terminarDeshacer()
    expect(marcas()).toEqual({ n0: 0, n1: 1, n2: 2 })
    apiFetch.mockResolvedValue(ok({ doc_id: 'doc-nuevo', page_count: 2, page_sizes: tam(2) }))
    await reopenDeadDoc('doc-1')
    expect(marcas()).toEqual({ n0: 0, n2: 1 })
    expect(aviso()).toContain('se descartaron 1 marca')
  })

  it('el aviso pluraliza los descartes', () => {
    expect(avisoDeReinicio('a.pdf', true, 3)).toContain('se descartaron 3 marcas de páginas que ya no existen')
    expect(avisoDeReinicio('a.pdf', false, 0)).toContain('las marcas se conservan')
  })
})
