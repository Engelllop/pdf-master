import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Tooltip from './Tooltip'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function abrir(content = 'Imprimir', shortcut?: string) {
  const r = render(
    <Tooltip content={content} shortcut={shortcut}>
      <button>Botón</button>
    </Tooltip>,
  )
  fireEvent.mouseEnter(screen.getByText('Botón').parentElement!)
  act(() => { vi.advanceTimersByTime(600) })
  return r
}

describe('tooltip', () => {
  it('espera antes de aparecer: pasar el ratón por la cinta no la llena de globos', () => {
    render(<Tooltip content="Imprimir"><button>Botón</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByText('Botón').parentElement!)
    // El retardo es de medio segundo: cruzar la cinta para llegar al documento no
    // puede dejar un reguero de globos tapando lo que hay debajo.
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('un clic lo cierra, aunque el ratón siga sobre el botón', () => {
    abrir()
    // Al abrir un menú desde ese botón, el ratón no sale: `onMouseLeave` nunca
    // llegaba y el globo se quedaba flotando ENCIMA del menú recién abierto.
    fireEvent.mouseDown(screen.getByText('Botón'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('Esc lo cierra', () => {
    abrir()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('aparece al enfocar con el teclado', () => {
    render(<Tooltip content="Imprimir" shortcut="Ctrl+P"><button>Botón</button></Tooltip>)
    fireEvent.focus(screen.getByText('Botón'))
    act(() => { vi.advanceTimersByTime(600) })
    // Navegando con Tab no se veía ni el nombre completo ni el atajo.
    expect(screen.getByRole('tooltip').textContent).toContain('Ctrl+P')
  })

  it('un texto largo envuelve en vez de estirarse fuera de la ventana', () => {
    abrir('Borrador: pasá sobre un dibujo y lo corta, como el borrador de un lápiz')
    const globo = screen.getByRole('tooltip')
    expect(globo.className).not.toMatch(/whitespace-nowrap/)
    expect(globo.className).toMatch(/max-w-/)
  })

  it('no repite lo que el propio control ya dice', () => {
    // Un botón con su etiqueta a la vista no necesita un globo que la repita: solo
    // tapa la interfaz. Con atajo sí sale, porque el atajo no está escrito.
    render(<Tooltip content="Resaltar"><button>Resaltar</button></Tooltip>)
    fireEvent.mouseEnter(screen.getByText('Resaltar').parentElement!)
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
