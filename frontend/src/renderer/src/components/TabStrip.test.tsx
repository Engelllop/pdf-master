import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    // La etiqueta lleva el nombre del archivo: con varias pestañas abiertas,
    // «Cerrar pestaña» repetido no dice cuál se cierra.
    const close = screen.getByLabelText('Cerrar a.pdf')
    const classes = close.className.split(/\s+/)
    expect(classes).toContain('opacity-100')
    expect(classes).not.toContain('opacity-0')
  })

  it('en las demás el cierre espera hover o foco', () => {
    openDoc('doc-1', 'a.pdf')
    openDoc('doc-2', 'b.pdf')
    usePdfStore.getState().setActiveDoc('doc-2')
    render(<TabStrip />)
    const closes = [screen.getByLabelText('Cerrar a.pdf'), screen.getByLabelText('Cerrar b.pdf')]
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

describe('jerarquía de la tira', () => {
  it('la pestaña activa no se pinta hundida: se marca con el acento', () => {
    openDoc('doc-1', 'a.pdf')
    openDoc('doc-2', 'b.pdf')
    render(<TabStrip />)
    const activa = screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!
    // `bg-surface` es la mesa del documento: sobre la barra blanca dejaba la pestaña
    // activa MÁS oscura que las inactivas, o sea hundida.
    expect(activa.className).not.toMatch(/bg-surface/)
    expect(activa.querySelector('.bg-accent')).toBeTruthy()
  })

  it('en la lista de pestañas, el activo no se marca con el color del hover', () => {
    openDoc('doc-1', 'a.pdf')
    openDoc('doc-2', 'b.pdf')
    render(<TabStrip />)
    fireEvent.click(screen.getByLabelText('Lista de pestañas'))
    // La pestaña y su fila del menú comparten `title` (la ruta): interesa la fila.
    const activa = screen.getAllByRole('button').find((b) => b.title.endsWith('a.pdf'))!
    // Con `bg-hover` había dos filas idénticas en cuanto el ratón tocaba otra.
    expect(activa.className).not.toMatch(/(^|\s)bg-hover/)
  })
})
