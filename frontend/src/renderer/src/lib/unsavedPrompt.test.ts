import { describe, it, expect, vi, beforeEach } from 'vitest'
import { askUnsaved, registerUnsavedHandler } from './unsavedPrompt'

// Este puente decide qué pasa cuando `closeDocument` pregunta y NADIE está escuchando
// (el diálogo vive en React; si el árbol no montó o se desmontó, no hay handler). Que
// devuelva 'cancel' y no 'discard' es lo que impide que un cierre silencioso se lleve
// las marcas sin guardar, y no había nada que lo fijara.

beforeEach(() => {
  registerUnsavedHandler(null as unknown as (ids: string[]) => Promise<'save' | 'discard' | 'cancel'>)
})

describe('puente del aviso de cambios sin guardar', () => {
  it('sin handler registrado cancela: nunca descarta por defecto', async () => {
    expect(await askUnsaved(['d1'])).toBe('cancel')
  })

  it('con handler, le pasa los doc_id y devuelve su respuesta', async () => {
    const handler = vi.fn(async () => 'save' as const)
    registerUnsavedHandler(handler)
    expect(await askUnsaved(['d1', 'd2'])).toBe('save')
    expect(handler).toHaveBeenCalledWith(['d1', 'd2'])
  })

  it('el último registro gana (la ventana nueva reemplaza a la anterior)', async () => {
    registerUnsavedHandler(async () => 'save')
    registerUnsavedHandler(async () => 'discard')
    expect(await askUnsaved(['d1'])).toBe('discard')
  })
})
