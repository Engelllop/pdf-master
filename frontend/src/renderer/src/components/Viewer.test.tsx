import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

// El visor es el archivo más grande del renderer (1200 líneas) y no tenía ni un test:
// lo que se comprueba acá es el contrato que ve el usuario —qué marcas se dibujan y
// qué pasa al pincharlas—, no cada rama interna.

vi.mock('../lib/pdfjs', () => ({
  renderPdfPage: vi.fn(async (_d: string, _v: number, page: number, scale: number) => ({
    url: `blob:p${page}-z${scale}`,
    width: 612 * scale, height: 792 * scale,
    originalWidth: 612, originalHeight: 792,
  })),
  revokePageUrl: vi.fn(),
  isDeadDocError: () => false,
}))
vi.mock('../lib/openDocument', () => ({ reopenDeadDoc: vi.fn(), openDocument: vi.fn() }))
vi.mock('../lib/api', () => ({
  apiFetch: async () => ({ ok: true, json: async () => ({ spans: [] }) }) as unknown as Response,
}))
vi.mock('../hooks/useFormFields', () => ({ useFormFields: () => ({ fields: [] }) }))
vi.mock('../hooks/useFileDrop', () => ({
  useFileDrop: () => ({ handleDragOver: () => {}, handleDrop: () => {} }),
}))

import Viewer from './Viewer'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function abrir(pages = 4) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\plano-a.pdf',
    page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
}

function marca(over: Partial<Annotation> = {}): Annotation {
  return {
    id: over.id ?? crypto.randomUUID(),
    type: 'rect',
    page: 0,
    x: 100, y: 100, width: 80, height: 60,
    color: '#ff0000',
    ...over,
  }
}

/** Los rectángulos que dibujó la capa de marcas, por su color de trazo: es lo que
 * distingue una marca del chrome de selección y de la propia página. */
const rectangulosDe = (c: HTMLElement, color: string) =>
  [...c.querySelectorAll('rect')].filter((r) => r.getAttribute('stroke') === color)

async function montar() {
  const r = render(<Viewer />)
  await waitFor(() => expect(screen.getByAltText('Página 1')).toBeTruthy())
  return r
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
})

describe('sin documento abierto', () => {
  it('muestra la portada con la zona de arrastre, no un visor vacío', () => {
    render(<Viewer />)
    expect(screen.getByText(/Arrastrá un PDF acá/)).toBeTruthy()
    expect(screen.queryByAltText('Página 1')).toBeNull()
  })
})

describe('con un documento abierto', () => {
  beforeEach(() => { abrir() })

  it('rasteriza y muestra la página actual', async () => {
    await montar()
    expect(screen.getByAltText('Página 1').getAttribute('src')).toContain('blob:p0')
  })

  it('al cambiar de página, la que se muestra es la nueva', async () => {
    await montar()
    await act(async () => { usePdfStore.getState().setPage('doc-1', 2) })
    await waitFor(() => expect(screen.getByAltText('Página 3')).toBeTruthy())
  })
})

describe('la capa de marcas', () => {
  beforeEach(() => { abrir() })

  it('dibuja las marcas de la página que se está viendo', async () => {
    usePdfStore.getState().addAnnotation('doc-1', marca({ color: '#00ff00' }))
    const { container } = await montar()
    expect(rectangulosDe(container, '#00ff00')).toHaveLength(1)
  })

  it('NO dibuja las de otras páginas', async () => {
    usePdfStore.getState().addAnnotation('doc-1', marca({ page: 3, color: '#00ff00' }))
    const { container } = await montar()
    expect(rectangulosDe(container, '#00ff00')).toHaveLength(0)
  })

  it('no dibuja las de una capa oculta', async () => {
    const s = usePdfStore.getState()
    s.addAnnotation('doc-1', marca({ color: '#00ff00', layer: 'Estructura' }))
    const { container } = await montar()
    expect(rectangulosDe(container, '#00ff00')).toHaveLength(1)

    await act(async () => { usePdfStore.getState().toggleLayerVisible('doc-1', 'Estructura') })
    await waitFor(() => expect(rectangulosDe(container, '#00ff00')).toHaveLength(0))
  })

  it('una marca nueva aparece sin recargar la página', async () => {
    const { container } = await montar()
    expect(rectangulosDe(container, '#0000ff')).toHaveLength(0)
    await act(async () => { usePdfStore.getState().addAnnotation('doc-1', marca({ color: '#0000ff' })) })
    await waitFor(() => expect(rectangulosDe(container, '#0000ff')).toHaveLength(1))
  })
})

describe('selección de marcas', () => {
  beforeEach(() => { abrir() })

  it('pinchar una marca la selecciona', async () => {
    const a = marca({ color: '#00ff00' })
    usePdfStore.getState().addAnnotation('doc-1', a)
    const { container } = await montar()

    fireEvent.click(rectangulosDe(container, '#00ff00')[0])

    await waitFor(() => expect(usePdfStore.getState().selectedAnnotationId).toBe(a.id))
  })

  it('el clic no se propaga al fondo: seleccionar no deselecciona en el mismo gesto', async () => {
    // `renderAnnotation` hace stopPropagation justo por esto; sin ello, el clic
    // llegaba al SVG y la marca quedaba seleccionada y deseleccionada de una vez.
    const a = marca({ color: '#00ff00' })
    usePdfStore.getState().addAnnotation('doc-1', a)
    const { container } = await montar()

    const rect = rectangulosDe(container, '#00ff00')[0]
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    rect.dispatchEvent(ev)

    await waitFor(() => expect(usePdfStore.getState().selectedAnnotationId).toBe(a.id))
  })
})
