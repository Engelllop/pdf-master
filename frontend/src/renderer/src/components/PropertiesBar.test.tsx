import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PropertiesBar from './PropertiesBar'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function openDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('visibilidad', () => {
  it('no renderiza nada sin documento ni herramienta', () => {
    const { container } = render(<PropertiesBar />)
    expect(container.firstChild).toBeNull()
  })

  it('con la herramienta rect muestra color, grosor y relleno', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'rect' })
    render(<PropertiesBar />)
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('Grosor')).toBeTruthy()
    expect(screen.getByText('Relleno')).toBeTruthy()
  })

  it('ya no relista las formas: eso vive en el menú Dibujar de la cinta', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'draw' })
    render(<PropertiesBar />)
    expect(screen.queryByLabelText('Lápiz')).toBeNull()
    expect(screen.queryByLabelText('Polígono')).toBeNull()
  })
})

describe('edición de defaults (sin anotación seleccionada)', () => {
  it('clic en un swatch fija el color de anotación por defecto', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'rect' })
    render(<PropertiesBar />)
    fireEvent.click(screen.getByLabelText('Color #ef4444'))
    expect(usePdfStore.getState().annotationColor.toLowerCase()).toBe('#ef4444')
  })
})

describe('edición de la anotación seleccionada', () => {
  it('cambiar el grosor aplica a la anotación, no al default', () => {
    openDoc()
    const docId = 'doc-1'
    usePdfStore.getState().addAnnotation(docId, {
      id: 'a1', type: 'rect', page: 0, x: 10, y: 10, width: 100, height: 50, lineWidth: 2,
    })
    usePdfStore.getState().selectAnnotation(docId, 'a1')
    const defaultWidthBefore = usePdfStore.getState().annotationLineWidth
    render(<PropertiesBar />)
    fireEvent.click(screen.getByLabelText('Grosor 8'))
    const ann = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'a1')
    expect(ann?.lineWidth).toBe(8)
    expect(usePdfStore.getState().annotationLineWidth).toBe(defaultWidthBefore)
  })
})
