import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TabStrip from './TabStrip'
import { usePdfStore } from '../store/usePdfStore'

class ResizeObserverStub {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)
Element.prototype.scrollIntoView = vi.fn()

const initialState = usePdfStore.getState()

function openDoc(id: string, name: string) {
  usePdfStore.getState().addDoc({
    doc_id: id, file_path: `C:\\${name}`, page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('cierre de pestaña', () => {
  it('en la pestaña activa el cierre queda a la vista (no solo al hover)', () => {
    openDoc('doc-1', 'a.pdf')
    render(<TabStrip />)
    const close = screen.getByLabelText('Cerrar pestaña')
    const classes = close.className.split(/\s+/)
    expect(classes).toContain('opacity-100')
    expect(classes).not.toContain('opacity-0')
  })

  it('en las demás el cierre espera hover o foco', () => {
    openDoc('doc-1', 'a.pdf')
    openDoc('doc-2', 'b.pdf')
    usePdfStore.getState().setActiveDoc('doc-2')
    render(<TabStrip />)
    const closes = screen.getAllByLabelText('Cerrar pestaña')
    const hidden = closes.find((el) => el.className.split(/\s+/).includes('opacity-0'))
    expect(hidden).toBeTruthy()
    expect(hidden?.className).toMatch(/group-hover:opacity-100/)
  })
})

describe('sucio', () => {
  it('el punto de la pestaña anuncia Sin guardar', () => {
    openDoc('doc-1', 'a.pdf')
    usePdfStore.getState().setDocDirty('doc-1', true)
    render(<TabStrip />)
    expect(screen.getByRole('img', { name: 'Sin guardar' })).toBeTruthy()
  })
})
