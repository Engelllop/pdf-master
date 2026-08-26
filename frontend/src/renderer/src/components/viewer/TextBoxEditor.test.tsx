import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TextBoxEditor from './TextBoxEditor'

const base = {
  x: 20, y: 30, zoom: 1, wrapperWidth: 800,
  fontFamily: 'Helvetica', fontSize: 14, color: '#000000',
  style: { bold: false, italic: false, align: 'left' as const, listStyle: 'none' as const, lineHeight: 1.15 },
}

function renderEditor(over: Partial<Parameters<typeof TextBoxEditor>[0]> = {}) {
  const props = {
    ...base,
    value: 'hola',
    onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn(),
    onFontFamily: vi.fn(), onFontSize: vi.fn(), onColor: vi.fn(), onStyle: vi.fn(),
    ...over,
  }
  return { props, ...render(<TextBoxEditor {...props} />) }
}

describe('editor de cuadro de texto', () => {
  it('los botones de la barra no le quitan el foco al texto', () => {
    renderEditor()
    for (const nombre of ['Negrita', 'Cursiva', 'Aumentar tamaño', 'Confirmar']) {
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      screen.getByLabelText(nombre).dispatchEvent(ev)
      expect(ev.defaultPrevented, nombre).toBe(true)
    }
  })

  it('el desplegable de fuente sí puede tomar el foco', () => {
    renderEditor()
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const select = document.querySelector('select') as HTMLSelectElement
    select.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Ctrl+Enter confirma y Esc cancela', () => {
    const { props } = renderEditor()
    const area = screen.getByLabelText('Texto')
    fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true })
    expect(props.onCommit).toHaveBeenCalled()
    fireEvent.keyDown(area, { key: 'Escape' })
    expect(props.onCancel).toHaveBeenCalled()
  })
})
