import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import UnsavedDialog from './UnsavedDialog'
import { askUnsaved } from '../lib/unsavedPrompt'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  window.api.onConfirmClose = vi.fn(() => () => {})
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
  usePdfStore.getState().setDocDirty('doc-1', true)
})

describe('UnsavedDialog', () => {
  it('Esc cancela y no descarta', async () => {
    render(<UnsavedDialog />)
    const choice = askUnsaved(['doc-1'])
    expect(await screen.findByRole('dialog')).toBeTruthy()
    // El listener de Escape se registra en un `useEffect`, que corre DESPUÉS del
    // commit: `findByRole` puede resolver en cuanto el nodo existe, así que sin
    // vaciar los efectos pendientes la tecla llegaba a veces antes que el listener y
    // el test se colgaba los 5 s esperando una promesa que ya nadie iba a resolver.
    // Fallaba ~1 de cada 5 corridas completas, y cambiaba de víctima según el reparto
    // de archivos entre workers.
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'Escape' })
    await expect(choice).resolves.toBe('cancel')
    // La respuesta no espera a la animación de salida, así que el diálogo sigue en el
    // DOM un instante marcado como saliente; lo que importa es que se vaya solo.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })
})
