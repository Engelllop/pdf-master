import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({
  apiFetch: (p: string, i?: RequestInit) => apiFetch(p, i),
  setDeadDocReopener: () => {},
}))
vi.mock('./uiPrompt', () => ({ askForm: vi.fn(async () => null) }))
vi.mock('./blobUrl', () => ({ revokePageUrl: () => {} }))

import { mensajeDeFallos, motivoDeApertura, openDocument } from './openDocument'
import { usePdfStore } from '../store/usePdfStore'
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
