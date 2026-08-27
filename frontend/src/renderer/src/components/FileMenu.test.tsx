import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileMenu from './FileMenu'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('FileMenu', () => {
  it('Esc cierra el menú Archivo', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByRole('button', { name: /Archivo/ }))
    expect(screen.getByRole('menu', { name: 'Archivo' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Archivo' })).toBeNull()
  })
})

describe('recientes', () => {
  it('busca sin tildes: «ingenieria» encuentra la carpeta «Ingeniería»', () => {
    localStorage.setItem('pdfmaster_recent_v2', JSON.stringify([
      { path: 'C:/planos/Ingeniería/fachada.pdf', lastOpened: Date.now() },
      { path: 'C:/planos/estructura.pdf', lastOpened: Date.now() },
    ]))
    render(<FileMenu />)
    fireEvent.click(screen.getByText('Archivo'))
    fireEvent.change(screen.getByPlaceholderText('Buscar en recientes…'), { target: { value: 'ingenieria' } })
    expect(screen.getByText('fachada.pdf')).toBeTruthy()
    expect(screen.queryByText('estructura.pdf')).toBeNull()
  })

  it('los atajos del menú van como tecla, no como texto gris suelto', () => {
    render(<FileMenu />)
    fireEvent.click(screen.getByText('Archivo'))
    const abrir = screen.getByRole('menuitem', { name: /Abrir…/ })
    expect(abrir.querySelector('kbd')?.textContent).toBe('Ctrl+O')
  })
})
