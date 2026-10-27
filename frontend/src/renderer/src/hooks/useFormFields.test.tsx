import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const formFieldUndoable = vi.fn()
vi.mock('../lib/pageUndo', () => ({
  formFieldUndoable: (...a: unknown[]) => formFieldUndoable(...a),
  transformFormFieldUndoable: vi.fn(),
}))

import { useFormFields, aplicarValorLocal, type FormField } from './useFormFields'
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

  it('tras elegir una opción, el valor local enciende solo esa (no todo el grupo)', async () => {
    const opcion = (xref: number, on: string): FormField => ({
      xref, field_name: 'sexo', field_type: 'RadioButton', value: 'Off', on_state: on, options: [],
      rect: { x: 0, y: 0, width: 10, height: 10 },
    })
    apiFetch.mockResolvedValue({ ok: true, json: async () => [opcion(6, 'Choice1'), opcion(7, 'Choice2')] })
    formFieldUndoable.mockResolvedValue(undefined)
    const { result } = renderHook(() => useFormFields('doc-2', 0))
    await waitFor(() => expect(result.current.fields).toHaveLength(2))

    await act(async () => { await result.current.updateField('sexo', 'Choice2', 7) })

    // El widget tocado viaja al motor: escribe sobre ESA opción.
    expect(formFieldUndoable).toHaveBeenCalledWith('doc-2', 0, 'sexo', 'Choice2', 7)
    expect(result.current.fields.map((f) => f.value)).toEqual(['Off', 'Choice2'])
  })
})

describe('aplicarValorLocal', () => {
  const base = { field_type: 'CheckBox', options: [], rect: { x: 0, y: 0, width: 1, height: 1 } }
  it('apagar una casilla la deja en Off', () => {
    const fs: FormField[] = [{ ...base, xref: 1, field_name: 'a', value: '1', on_state: '1' }]
    expect(aplicarValorLocal(fs, 'a', 'Off', 1)[0].value).toBe('Off')
  })
  it('sin xref elige por estado activo; los campos de texto copian el valor', () => {
    const fs: FormField[] = [
      { ...base, field_type: 'RadioButton', xref: 1, field_name: 'g', value: 'Off', on_state: 'Si' },
      { ...base, field_type: 'RadioButton', xref: 2, field_name: 'g', value: 'Si', on_state: 'No' },
      { ...base, field_type: 'Text', xref: 3, field_name: 't', value: 'x' },
    ]
    expect(aplicarValorLocal(fs, 'g', 'Si').map((f) => f.value)).toEqual(['Si', 'Off', 'x'])
    expect(aplicarValorLocal(fs, 't', 'y')[2].value).toBe('y')
  })
})

