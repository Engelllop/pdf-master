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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rotar' } })
    expect(screen.getByText('Rotar a la derecha')).toBeTruthy()
    expect(screen.queryByText('Abrir PDF')).toBeNull()
  })

  it('encuentra sin tildes: nadie escribe «Página» con acento en un buscador', () => {
    render(<CommandPalette onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pagina rotar' } })
    expect(screen.getByText('Rotar a la derecha')).toBeTruthy()
  })

  it('agrupa por sección en vez de repetir el grupo en cada fila', () => {
    render(<CommandPalette onClose={() => {}} />)
    const grupos = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(grupos).toEqual(['Archivo', 'Página'])
    // El nombre del grupo aparece UNA vez (la cabecera), no pegado a cada comando.
    expect(screen.getAllByText('Archivo')).toHaveLength(1)
  })

  it('el comando resaltado usa el color de texto del relleno, no el del panel', () => {
    render(<CommandPalette onClose={() => {}} />)
    const fila = screen.getByRole('option', { selected: true })
    expect(fila.className).toMatch(/bg-accent/)
    // `text-toolbar` sobre relleno azul dejaba texto oscuro sobre oscuro en tema oscuro.
    expect(fila.className).toMatch(/text-on-accent/)
    expect(fila.className).not.toMatch(/text-toolbar/)
  })
})
