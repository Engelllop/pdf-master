import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CommandPalette from './CommandPalette'
import { registerCommands } from '../lib/commands'

const run1 = vi.fn()
const run2 = vi.fn()

beforeEach(() => {
  run1.mockReset(); run2.mockReset()
  registerCommands([
    { id: 'a.uno', group: 'Archivo', label: 'Abrir PDF', run: run1 },
    { id: 'p.dos', group: 'Página', label: 'Rotar a la derecha', run: run2 },
  ])
})

describe('paleta de comandos', () => {
  it('el campo apunta al comando resaltado para los lectores de pantalla', () => {
    render(<CommandPalette onClose={() => {}} />)
    const campo = screen.getByRole('combobox')
    expect(campo.getAttribute('aria-activedescendant')).toBe('paleta-cmd-a.uno')

    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    expect(campo.getAttribute('aria-activedescendant')).toBe('paleta-cmd-p.dos')
  })

  it('filtra por palabras sueltas del nombre y del grupo', () => {
    render(<CommandPalette onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pagina rotar' } })
    // «pagina» sin tilde no coincide con «Página»: se busca tal cual se escribe.
    expect(screen.queryByText('Rotar a la derecha')).toBeNull()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rotar' } })
    expect(screen.getByText('Rotar a la derecha')).toBeTruthy()
  })
})
