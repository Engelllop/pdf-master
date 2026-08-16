import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    fireEvent.keyDown(document, { key: 'Escape' })
    await expect(choice).resolves.toBe('cancel')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })
})
