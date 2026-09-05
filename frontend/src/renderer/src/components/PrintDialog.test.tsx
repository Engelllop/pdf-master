import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const pushAnnotations = vi.fn(async (_id: string, _opts?: { excluirCapasOcultas?: boolean }) => true)
vi.mock('../lib/saveDocument', () => ({
  pushAnnotations: (id: string, opts?: { excluirCapasOcultas?: boolean }) => pushAnnotations(id, opts),
}))

import PrintDialog from './PrintDialog'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()
// Con la firma real: tipado sin argumentos, `mock.calls[0][1]` no compila.
type OpcionesImpresion = { pageRanges?: string; copies?: number; landscape?: boolean }
const printPdf = vi.fn(async (_docId: string, _opts?: OpcionesImpresion) => ({ success: true }))

/** Documento con `apaisadas` láminas de 36×24 in y `verticales` A4, en ese orden. */
function abrir(apaisadas: number, verticales: number) {
  const sizes = [
    ...Array.from({ length: apaisadas }, (_, i) => ({ page_num: i, width: 2592, height: 1728 })),
    ...Array.from({ length: verticales }, (_, i) => ({ page_num: apaisadas + i, width: 595, height: 842 })),
  ]
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: sizes.length,
    title: null, author: null, subject: null, page_sizes: sizes,
  })
  return sizes.length
}

const opcionesDeImpresion = () => printPdf.mock.calls[0][1] as OpcionesImpresion

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  printPdf.mockClear()
  pushAnnotations.mockClear()
  Object.assign(window, { api: { ...window.api, printPdf } })
})

async function imprimir(pages: number, currentPage = 0) {
  render(<PrintDialog docId="doc-1" pageCount={pages} currentPage={currentPage} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
  await waitFor(() => expect(printPdf).toHaveBeenCalled())
}

// Chromium imprime en vertical si no se le dice otra cosa: un juego de láminas
// apaisadas salía girado y encogido a una esquina del papel.
describe('orientación', () => {
  it('un juego de láminas apaisadas se manda apaisado', async () => {
    const n = abrir(3, 0)
    await imprimir(n)
    expect(opcionesDeImpresion().landscape).toBe(true)
  })

  it('un informe vertical se manda vertical', async () => {
    const n = abrir(0, 3)
    await imprimir(n)
    expect(opcionesDeImpresion().landscape).toBe(false)
  })

  it('«página actual» mira ESA página, no el documento', async () => {
    const n = abrir(1, 3) // la 0 es apaisada, el resto verticales
    render(<PrintDialog docId="doc-1" pageCount={n} currentPage={0} onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Página actual (1)', { selector: 'input' }))
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
    await waitFor(() => expect(printPdf).toHaveBeenCalled())
    expect(opcionesDeImpresion().landscape).toBe(true)
  })

  it('un rango decide con las páginas del rango', async () => {
    const n = abrir(3, 3) // 0-2 apaisadas, 3-5 verticales
    render(<PrintDialog docId="doc-1" pageCount={n} currentPage={0} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('ej. 1-5, 8'), { target: { value: '4-6' } })
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
    await waitFor(() => expect(printPdf).toHaveBeenCalled())
    expect(opcionesDeImpresion().landscape).toBe(false)
    expect(opcionesDeImpresion().pageRanges).toBe('4-6')
  })
})

// Las capas apagadas se ven en el archivo pero no en pantalla: imprimirlas sin avisar
// sorprende, y excluirlas del GUARDADO sería borrarlas.
describe('capas apagadas', () => {
  const conCapaOculta = () => {
    const n = abrir(1, 0)
    usePdfStore.getState().addAnnotation('doc-1', { id: 'a1', type: 'rect', page: 0, x: 0, y: 0, width: 10, height: 10, layer: 'Eléctrico' })
    usePdfStore.getState().toggleLayerVisible('doc-1', 'Eléctrico')
    return n
  }

  it('la opción solo aparece si hay marcas ocultas', async () => {
    const n = abrir(1, 0)
    render(<PrintDialog docId="doc-1" pageCount={n} currentPage={0} onClose={() => {}} />)
    expect(screen.queryByText(/No imprimir las capas apagadas/)).toBeNull()
  })

  it('con marcas ocultas aparece, dice cuántas y viene marcada', async () => {
    const n = conCapaOculta()
    render(<PrintDialog docId="doc-1" pageCount={n} currentPage={0} onClose={() => {}} />)
    expect(screen.getByText(/No imprimir las capas apagadas/)).toBeTruthy()
    expect(screen.getByText(/1 marca\(s\) oculta\(s\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
    await waitFor(() => expect(pushAnnotations).toHaveBeenCalled())
    expect(pushAnnotations.mock.calls[0][1]).toEqual({ excluirCapasOcultas: true })
  })

  it('desmarcándola se imprimen todas', async () => {
    const n = conCapaOculta()
    render(<PrintDialog docId="doc-1" pageCount={n} currentPage={0} onClose={() => {}} />)
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')) })
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
    await waitFor(() => expect(pushAnnotations).toHaveBeenCalled())
    expect(pushAnnotations.mock.calls[0][1]).toEqual({ excluirCapasOcultas: false })
  })
})

describe('acción primaria', () => {
  it('Imprimir usa el botón primario del sistema, no un color propio', async () => {
    render(<PrintDialog docId="doc-1" pageCount={3} currentPage={0} onClose={() => {}} />)
    const imprimir = screen.getByRole('button', { name: /Imprimir$/ })
    // Lo que importa es que el MISMO rol se pinte igual en toda la app: antes este
    // diálogo iba en tinta y el de «sin guardar» en acento. Ahora los dos salen de
    // `btnPrimary`, que en el sistema monocromo es relleno de tinta.
    expect(imprimir.className).toMatch(/bg-fg/)
    expect(imprimir.className).toMatch(/text-panel/)
    // La acción primaria no puede confundirse con un estado elegido, que es el
    // relleno gris: son dos cosas distintas y ahora las dos son sin color.
    expect(imprimir.className).not.toMatch(/bg-selected/)
  })
})
