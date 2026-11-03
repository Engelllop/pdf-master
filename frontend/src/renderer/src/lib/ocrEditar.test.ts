import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const askConfirm = vi.fn()
vi.mock('./uiPrompt', () => ({ askConfirm: (...a: unknown[]) => askConfirm(...a) }))
const makeSearchableUndoable = vi.fn()
vi.mock('./pageUndo', () => ({ makeSearchableUndoable: (...a: unknown[]) => makeSearchableUndoable(...a) }))

import { ofrecerOcrParaEditar } from './ocrEditar'
import { usePdfStore } from '../store/usePdfStore'

const json = (data: unknown, ok = true) => ({ ok, json: async () => data })

/** Respuestas del motor por ruta. */
function motor(opts: { pendientes?: number[]; ocr?: boolean }) {
  apiFetch.mockImplementation(async (ruta: string) => {
    if (ruta.startsWith('/pdf/ocr-pending/')) return json({ pages: opts.pendientes ?? [], count: (opts.pendientes ?? []).length })
    if (ruta === '/pdf/ocr-available') return json({ available: opts.ocr ?? true, languages: ['eng', 'spa'] })
    throw new Error(`ruta inesperada ${ruta}`)
  })
}

const toasts = () => usePdfStore.getState().toasts ?? []

describe('ofrecerOcrParaEditar', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    askConfirm.mockReset()
    makeSearchableUndoable.mockReset()
  })

  it('una página con texto no ofrece nada: el clic simplemente no cayó sobre el texto', async () => {
    motor({ pendientes: [3] })
    expect(await ofrecerOcrParaEditar('d1', 0)).toBe('no-escaneada')
    expect(askConfirm).not.toHaveBeenCalled()
  })

  it('un fallo al preguntar tampoco molesta: se trata como página con texto', async () => {
    apiFetch.mockRejectedValue(new Error('sin motor'))
    expect(await ofrecerOcrParaEditar('d1', 0)).toBe('no-escaneada')
  })

  it('sin reconocedor en la instalación lo dice y no pregunta', async () => {
    motor({ pendientes: [0], ocr: false })
    expect(await ofrecerOcrParaEditar('d1', 0)).toBe('sin-motor')
    expect(askConfirm).not.toHaveBeenCalled()
    expect(makeSearchableUndoable).not.toHaveBeenCalled()
  })

  it('si el usuario no quiere, no se reconoce nada', async () => {
    motor({ pendientes: [0] })
    askConfirm.mockResolvedValue(false)
    expect(await ofrecerOcrParaEditar('d1', 0)).toBe('rechazado')
    expect(makeSearchableUndoable).not.toHaveBeenCalled()
  })

  it('si acepta, reconoce la página y queda lista para editar', async () => {
    motor({ pendientes: [0, 1] })
    askConfirm.mockResolvedValue(true)
    makeSearchableUndoable.mockResolvedValue(77)
    expect(await ofrecerOcrParaEditar('d1', 1)).toBe('listo')
    expect(makeSearchableUndoable).toHaveBeenCalledWith('d1', 1)
    expect(askConfirm.mock.calls[0][0]).toBe('Esta página es una imagen')
    // El progreso se cierra siempre.
    expect(usePdfStore.getState().progress).toBeNull()
  })

  it('una página sin letras avisa en vez de abrir un editor vacío', async () => {
    motor({ pendientes: [0] })
    askConfirm.mockResolvedValue(true)
    makeSearchableUndoable.mockResolvedValue(0)
    expect(await ofrecerOcrParaEditar('d1', 0)).toBe('sin-texto')
  })

  it('si el reconocimiento falla, el progreso se cierra igual y el error sube', async () => {
    motor({ pendientes: [0] })
    askConfirm.mockResolvedValue(true)
    makeSearchableUndoable.mockRejectedValue(new Error('El reconocimiento de texto (OCR) no está disponible'))
    await expect(ofrecerOcrParaEditar('d1', 0)).rejects.toThrow(/OCR/)
    expect(usePdfStore.getState().progress).toBeNull()
    void toasts()
  })
})
