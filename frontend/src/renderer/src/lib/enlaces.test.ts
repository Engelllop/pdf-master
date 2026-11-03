import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const askForm = vi.fn()
vi.mock('./uiPrompt', () => ({ askForm: (...a: unknown[]) => askForm(...a), askConfirm: vi.fn() }))
const crearEnlaceUndoable = vi.fn(async () => {})
const editarEnlaceUndoable = vi.fn(async () => {})
const quitarEnlaceUndoable = vi.fn(async () => {})
vi.mock('./pageUndo', () => ({
  crearEnlaceUndoable: (...a: unknown[]) => crearEnlaceUndoable(...(a as [])),
  editarEnlaceUndoable: (...a: unknown[]) => editarEnlaceUndoable(...(a as [])),
  quitarEnlaceUndoable: (...a: unknown[]) => quitarEnlaceUndoable(...(a as [])),
}))

import {
  TIPO_PAGINA, TIPO_WEB, cargarEnlaces, interpretarFormulario, pedirDestino, pedirYCrearEnlace, pedirYEditarEnlace,
  type EnlacePdf,
} from './enlaces'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()
const ZONA = { x0: 10, y0: 20, x1: 110, y1: 50 }

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  apiFetch.mockReset(); askForm.mockReset()
  crearEnlaceUndoable.mockReset(); crearEnlaceUndoable.mockResolvedValue(undefined)
  editarEnlaceUndoable.mockReset(); editarEnlaceUndoable.mockResolvedValue(undefined)
  quitarEnlaceUndoable.mockReset(); quitarEnlaceUndoable.mockResolvedValue(undefined)
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\x.pdf', page_count: 5, title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 5 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
})

const ultimoAviso = () => usePdfStore.getState().toasts.at(-1)

describe('interpretarFormulario', () => {
  it('una dirección web va tal cual (el motor la normaliza)', () => {
    expect(interpretarFormulario({ tipo: TIPO_WEB, uri: '  www.ejemplo.com ', pagina: '3' }, 5))
      .toEqual({ destino: { uri: 'www.ejemplo.com' } })
  })
  it('una página se manda en base 0', () => {
    expect(interpretarFormulario({ tipo: TIPO_PAGINA, uri: '', pagina: '3' }, 5)).toEqual({ destino: { target_page: 2 } })
  })
  it('lo que se escribió en el otro campo se ignora', () => {
    expect(interpretarFormulario({ tipo: TIPO_PAGINA, uri: 'https://a.com', pagina: '1' }, 5)).toEqual({ destino: { target_page: 0 } })
    expect(interpretarFormulario({ tipo: TIPO_WEB, uri: 'a.com', pagina: '99' }, 5)).toEqual({ destino: { uri: 'a.com' } })
  })
  it('una dirección vacía es un error', () => {
    expect(interpretarFormulario({ tipo: TIPO_WEB, uri: '   ', pagina: '1' }, 5)).toEqual({ error: expect.stringMatching(/dirección/) })
  })
  it.each(['0', '6', '2.5', 'abc', ''])('la página «%s» fuera de 1–5 o no entera es un error', (p) => {
    expect(interpretarFormulario({ tipo: TIPO_PAGINA, uri: '', pagina: p }, 5)).toEqual({ error: expect.stringMatching(/entre 1 y 5/) })
  })
  it('quitar manda sobre todo lo demás', () => {
    expect(interpretarFormulario({ tipo: TIPO_WEB, uri: '', pagina: '', quitar: true }, 5)).toEqual({ quitar: true })
  })
})

describe('pedirDestino', () => {
  it('cancelar devuelve null', async () => {
    askForm.mockResolvedValue(null)
    expect(await pedirDestino(5)).toBeNull()
  })

  it('si lo escrito no sirve avisa y vuelve a preguntar con lo escrito, no con lo de antes', async () => {
    askForm
      .mockResolvedValueOnce({ tipo: TIPO_PAGINA, uri: 'https://guardada.com', pagina: '99' })
      .mockResolvedValueOnce({ tipo: TIPO_PAGINA, uri: 'https://guardada.com', pagina: '4' })
    expect(await pedirDestino(5)).toEqual({ destino: { target_page: 3 } })
    expect(askForm).toHaveBeenCalledTimes(2)
    expect(ultimoAviso()?.message).toMatch(/entre 1 y 5/)
    const campos = askForm.mock.calls[1][1] as Array<{ name: string; defaultValue: unknown }>
    expect(campos.find((c) => c.name === 'uri')?.defaultValue).toBe('https://guardada.com')
    expect(campos.find((c) => c.name === 'tipo')?.defaultValue).toBe(TIPO_PAGINA)
    expect(campos.find((c) => c.name === 'pagina')?.defaultValue).toBe(99)
  })

  it('crear no ofrece «quitar»; editar sí y parte de lo que ya tiene el enlace', async () => {
    askForm.mockResolvedValue(null)
    await pedirDestino(5)
    expect((askForm.mock.calls[0][1] as Array<{ name: string }>).map((c) => c.name)).toEqual(['tipo', 'uri', 'pagina'])
    expect(askForm.mock.calls[0][0]).toBe('Crear enlace')

    const goto: EnlacePdf = { index: 0, kind: 'goto', x0: 0, y0: 0, x1: 1, y1: 1, uri: null, page: 2 }
    await pedirDestino(5, goto)
    const campos = askForm.mock.calls[1][1] as Array<{ name: string; defaultValue: unknown }>
    expect(askForm.mock.calls[1][0]).toBe('Editar enlace')
    expect(campos.map((c) => c.name)).toEqual(['tipo', 'uri', 'pagina', 'quitar'])
    expect(campos.find((c) => c.name === 'tipo')?.defaultValue).toBe(TIPO_PAGINA)
    expect(campos.find((c) => c.name === 'pagina')?.defaultValue).toBe(3)
  })

  it('un enlace web existente se abre en «Dirección web» con su dirección', async () => {
    askForm.mockResolvedValue(null)
    await pedirDestino(5, { index: 1, kind: 'uri', x0: 0, y0: 0, x1: 1, y1: 1, uri: 'https://a.com', page: null })
    const campos = askForm.mock.calls[0][1] as Array<{ name: string; defaultValue: unknown }>
    expect(campos.find((c) => c.name === 'tipo')?.defaultValue).toBe(TIPO_WEB)
    expect(campos.find((c) => c.name === 'uri')?.defaultValue).toBe('https://a.com')
  })
})

describe('pedirYCrearEnlace', () => {
  it('crea el enlace con la zona y el destino, y avisa', async () => {
    askForm.mockResolvedValue({ tipo: TIPO_WEB, uri: 'www.ejemplo.com', pagina: '1' })
    expect(await pedirYCrearEnlace('doc-1', 2, ZONA)).toBe(true)
    expect(crearEnlaceUndoable).toHaveBeenCalledWith('doc-1', 2, ZONA, { uri: 'www.ejemplo.com' })
    expect(ultimoAviso()).toMatchObject({ message: expect.stringMatching(/Enlace creado/), type: 'success' })
  })

  it('el total de páginas que ofrece es el del documento', async () => {
    askForm.mockResolvedValue(null)
    await pedirYCrearEnlace('doc-1', 0, ZONA)
    const pagina = (askForm.mock.calls[0][1] as Array<{ name: string; max?: number }>).find((c) => c.name === 'pagina')
    expect(pagina?.max).toBe(5)
  })

  it('cancelar no crea nada ni avisa', async () => {
    askForm.mockResolvedValue(null)
    expect(await pedirYCrearEnlace('doc-1', 0, ZONA)).toBe(false)
    expect(crearEnlaceUndoable).not.toHaveBeenCalled()
    expect(usePdfStore.getState().toasts).toHaveLength(0)
  })

  it('si el motor rechaza la dirección muestra el motivo', async () => {
    askForm.mockResolvedValue({ tipo: TIPO_WEB, uri: 'javascript:alert(1)', pagina: '1' })
    crearEnlaceUndoable.mockRejectedValue(new Error('La dirección no es válida: use http(s)://, mailto: o tel:'))
    expect(await pedirYCrearEnlace('doc-1', 0, ZONA)).toBe(false)
    expect(ultimoAviso()).toMatchObject({ message: expect.stringMatching(/La dirección no es válida/), type: 'error' })
  })
})

describe('pedirYEditarEnlace', () => {
  const web: EnlacePdf = { index: 3, kind: 'uri', x0: 0, y0: 0, x1: 9, y1: 9, uri: 'https://a.com', page: null }

  it('guarda el cambio de destino sobre ese índice', async () => {
    askForm.mockResolvedValue({ tipo: TIPO_PAGINA, uri: 'https://a.com', pagina: '2', quitar: false })
    expect(await pedirYEditarEnlace('doc-1', 1, web)).toBe(true)
    expect(editarEnlaceUndoable).toHaveBeenCalledWith('doc-1', 1, 3, { target_page: 1 })
    expect(quitarEnlaceUndoable).not.toHaveBeenCalled()
  })

  it('«Quitar este enlace» lo quita y no edita', async () => {
    askForm.mockResolvedValue({ tipo: TIPO_WEB, uri: 'https://a.com', pagina: '1', quitar: true })
    expect(await pedirYEditarEnlace('doc-1', 1, web)).toBe(true)
    expect(quitarEnlaceUndoable).toHaveBeenCalledWith('doc-1', 1, 3)
    expect(editarEnlaceUndoable).not.toHaveBeenCalled()
    expect(ultimoAviso()?.message).toMatch(/quitado/)
  })

  it('cancelar no toca nada', async () => {
    askForm.mockResolvedValue(null)
    expect(await pedirYEditarEnlace('doc-1', 1, web)).toBe(false)
    expect(editarEnlaceUndoable).not.toHaveBeenCalled()
    expect(quitarEnlaceUndoable).not.toHaveBeenCalled()
  })

  it('si el motor falla avisa y devuelve false', async () => {
    askForm.mockResolvedValue({ tipo: TIPO_WEB, uri: 'x', pagina: '1', quitar: false })
    editarEnlaceUndoable.mockRejectedValue(new Error('No se pudo editar el enlace'))
    expect(await pedirYEditarEnlace('doc-1', 1, web)).toBe(false)
    expect(ultimoAviso()?.type).toBe('error')
  })
})

describe('cargarEnlaces', () => {
  it('devuelve los enlaces de la página', async () => {
    const links = [{ index: 0, kind: 'uri', x0: 1, y0: 2, x1: 3, y1: 4, uri: 'https://a.com', page: null }]
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ links }) })
    expect(await cargarEnlaces('doc-1', 2)).toEqual(links)
    expect(apiFetch).toHaveBeenCalledWith('/pdf/links/doc-1/2')
  })
  it.each([
    ['el motor responde error', { ok: false, json: async () => ({}) }],
    ['la respuesta no es una lista', { ok: true, json: async () => ({ links: 'x' }) }],
  ])('si %s, devuelve vacío sin romper', async (_n, resp) => {
    apiFetch.mockResolvedValue(resp)
    expect(await cargarEnlaces('doc-1', 0)).toEqual([])
  })
  it('si falla la red, devuelve vacío', async () => {
    apiFetch.mockRejectedValue(new Error('sin motor'))
    expect(await cargarEnlaces('doc-1', 0)).toEqual([])
  })
})
