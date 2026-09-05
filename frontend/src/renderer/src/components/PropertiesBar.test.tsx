import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PropertiesBar from './PropertiesBar'
import { COUNT_MAX, COUNT_MIN, usePdfStore } from '../store/usePdfStore'

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
    fireEvent.click(screen.getByLabelText('Rojo'))
    expect(usePdfStore.getState().annotationColor.toLowerCase()).toBe('#ef4444')
  })
})

describe('edición de la anotación seleccionada', () => {
  it('no muestra inspector: la marca se edita en la barra flotante', () => {
    openDoc()
    const docId = 'doc-1'
    usePdfStore.getState().addAnnotation(docId, {
      id: 'a1', type: 'rect', page: 0, x: 10, y: 10, width: 100, height: 50, lineWidth: 2,
    })
    usePdfStore.getState().selectAnnotation(docId, 'a1')
    const { container } = render(<PropertiesBar />)
    expect(container.firstChild).toBeNull()
  })

  it('el grosor exacto respeta el mismo tope que el store', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'rect' })
    render(<PropertiesBar />)
    const campo = screen.getByLabelText('Grosor exacto') as HTMLInputElement
    expect(campo.max).toBe('20')

    fireEvent.change(campo, { target: { value: '99' } })
    expect(usePdfStore.getState().annotationLineWidth).toBe(20)
  })

  it('los colores se anuncian por nombre, no por su código hex', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'rect' })
    render(<PropertiesBar />)
    expect(screen.getByLabelText('Ámbar')).toBeTruthy()
    expect(screen.queryByLabelText('Color #fbbf24')).toBeNull()
  })
})

describe('tamaño de la burbuja de conteo', () => {
  it('con la herramienta de conteo aparecen color y tamaño', () => {
    // El conteo no estaba en ninguna lista de la barra, así que ni el color de la
    // categoría ni el tamaño se podían tocar sin salir a otro sitio.
    openDoc()
    usePdfStore.setState({ activeTool: 'count' })
    render(<PropertiesBar />)
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('Tamaño')).toBeTruthy()
    expect(screen.getByLabelText('Tamaño de la burbuja de conteo')).toBeTruthy()
  })

  it('el tamaño se elige en puntos del PDF y se guarda', () => {
    openDoc()
    usePdfStore.setState({ activeTool: 'count' })
    render(<PropertiesBar />)
    fireEvent.click(screen.getByLabelText('Burbuja de 36 puntos'))
    expect(usePdfStore.getState().countSize).toBe(36)
    // En PUNTOS, no en píxeles: una burbuja puesta al 400% tiene que salir igual
    // que una puesta al 50%.
    expect(screen.getByText('36 pt')).toBeTruthy()
  })

  it('el deslizador no deja salirse del rango', () => {
    openDoc()
    usePdfStore.getState().setCountSize(999)
    expect(usePdfStore.getState().countSize).toBe(COUNT_MAX)
    usePdfStore.getState().setCountSize(1)
    expect(usePdfStore.getState().countSize).toBe(COUNT_MIN)
  })
})
