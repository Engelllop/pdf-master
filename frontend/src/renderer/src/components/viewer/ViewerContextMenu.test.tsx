import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ViewerContextMenu, { type ViewerContextMenuProps } from './ViewerContextMenu'

const props = (extra: Partial<ViewerContextMenuProps> = {}): ViewerContextMenuProps => ({
  x: 10, y: 10,
  selectionCount: 0,
  canPaste: false,
  pageMarkCount: 0,
  canExportImage: true,
  onCopy: vi.fn(), onDuplicate: vi.fn(), onDeleteAnnotation: vi.fn(),
  onPaste: vi.fn(), onSelectAllOnPage: vi.fn(), onClearPage: vi.fn(),
  onAddBookmark: vi.fn(), onExportImage: vi.fn(), onCopyText: vi.fn(),
  ...extra,
})

describe('ViewerContextMenu', () => {
  it('sin selección no ofrece acciones de marca', () => {
    render(<ViewerContextMenu {...props()} />)
    expect(screen.queryByText(/Eliminar/)).toBeNull()
    expect(screen.queryByText(/Duplicar/)).toBeNull()
    expect(screen.getByText('Agregar marcador')).toBeTruthy()
  })

  it('con varias marcas seleccionadas los rótulos dicen cuántas', () => {
    render(<ViewerContextMenu {...props({ selectionCount: 3 })} />)
    expect(screen.getByText('Copiar 3 marcas')).toBeTruthy()
    expect(screen.getByText('Eliminar 3 marcas')).toBeTruthy()
  })

  it('«pegar acá» solo aparece si hay algo en el portapapeles', () => {
    const { rerender } = render(<ViewerContextMenu {...props()} />)
    expect(screen.queryByText('Pegar acá')).toBeNull()
    rerender(<ViewerContextMenu {...props({ canPaste: true })} />)
    expect(screen.getByText('Pegar acá')).toBeTruthy()
  })

  it('borrar la página dice cuántas marcas se lleva', () => {
    render(<ViewerContextMenu {...props({ pageMarkCount: 12 })} />)
    expect(screen.getByText('Borrar las 12 marcas de la página')).toBeTruthy()
  })

  it('se repliega para no salirse de la ventana', () => {
    // jsdom no hace layout: se le da tamaño al menú para poder comprobar el ajuste.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 248, height: 200 } as DOMRect)
    render(<ViewerContextMenu {...props({ x: window.innerWidth - 5, y: 4 })} />)
    const menu = screen.getByRole('menu')
    expect(parseInt(menu.style.left)).toBe(window.innerWidth - 248 - 8)
    expect(parseInt(menu.style.top)).toBe(8)
    rect.mockRestore()
  })
})
