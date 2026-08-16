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
