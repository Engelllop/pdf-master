import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AIPanel from './AIPanel'
import { usePdfStore } from '../store/usePdfStore'

// El panel vive detrás de una clave guardada en el almacén cifrado del proceso
// principal: sin este mock nunca sale de la pantalla de conexión.
const apiStub = {
  aiHasKey: vi.fn(async () => true),
  aiSetKey: vi.fn(async () => ({ ok: true })),
  onAiChunk: vi.fn(() => () => {}),
  onAiDone: vi.fn(() => () => {}),
  onAiError: vi.fn(() => () => {}),
  aiChat: vi.fn(async () => ({ ok: true })),
  aiStop: vi.fn(async () => {}),
}

const initialState = usePdfStore.getState()

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  Object.values(apiStub).forEach((f) => f.mockClear?.())
  Object.defineProperty(window, 'api', { value: apiStub, writable: true, configurable: true })
})

async function panel() {
  const r = render(<AIPanel onClose={() => {}} />)
  await waitFor(() => expect(screen.getByLabelText('Pregunta para el asistente')).toBeTruthy())
  return r
}

describe('panel de IA', () => {
  it('el contexto es un carril segmentado, como el resto de la app', async () => {
    const { container } = await panel()
    const doc = screen.getByRole('button', { name: 'Documento' })
    // Eran dos botones sueltos: el único segmentado del proyecto sin su marco.
    const carril = doc.parentElement!
    expect(carril.className).toMatch(/border-border/)
    expect(carril.className).toMatch(/bg-surface/)
    expect(container.querySelectorAll('[aria-pressed]').length).toBe(2)
  })

  it('la respuesta del asistente no se hunde dentro del panel', async () => {
    await panel()
    fireEvent.change(screen.getByLabelText('Pregunta para el asistente'), { target: { value: '¿de qué trata?' } })
    fireEvent.click(screen.getByLabelText('Enviar la pregunta'))
    await waitFor(() => expect(screen.getByText('¿de qué trata?')).toBeTruthy())

    const burbujas = [...document.querySelectorAll('[role="log"] .rounded-token')]
    expect(burbujas.length).toBeGreaterThanOrEqual(2)
    // `bg-surface` es la mesa del documento: en tema oscuro es MÁS oscura que el
    // panel que la contiene, así que cada respuesta quedaba como un agujero.
    burbujas.forEach((b) => expect(b.className).not.toMatch(/bg-surface/))
    expect(burbujas.some((b) => b.className.includes('bg-active'))).toBe(true)
  })
})
