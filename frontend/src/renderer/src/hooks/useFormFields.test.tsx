import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const formFieldUndoable = vi.fn()
vi.mock('../lib/pageUndo', () => ({
  formFieldUndoable: (...a: unknown[]) => formFieldUndoable(...a),
  transformFormFieldUndoable: vi.fn(),
}))

import { useFormFields } from './useFormFields'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  apiFetch.mockReset()
  formFieldUndoable.mockReset()
})

describe('campos de formulario', () => {
  it('un 404 del motor no rompe la capa: la lista queda vacía', async () => {
    // El doc_id muerto devuelve {detail: "..."}; si se guardaba tal cual, el .map
    // de la capa de campos reventaba la vista entera.
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({ detail: 'Document not found' }) })
    const { result } = renderHook(() => useFormFields('doc-1', 0))
    await waitFor(() => expect(Array.isArray(result.current.fields)).toBe(true))
    expect(result.current.fields).toHaveLength(0)
  })

  it('si guardar el campo falla, se avisa en vez de revertir en silencio', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => [] })
    formFieldUndoable.mockRejectedValue(new Error('motor caído'))
    const { result } = renderHook(() => useFormFields('doc-1', 0))

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.updateField('nombre', 'Engell') })

    expect(ok).toBe(false)
    expect(usePdfStore.getState().toasts.some((t) => /no se pudo guardar el campo/i.test(t.message))).toBe(true)
  })
})
