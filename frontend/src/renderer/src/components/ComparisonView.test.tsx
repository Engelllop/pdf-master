import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../lib/pdfjs', () => ({
  renderPdfPage: vi.fn(async () => ({ url: 'blob:p', width: 20, height: 26, originalWidth: 612, originalHeight: 792 })),
  revokePageUrl: vi.fn(),
}))

import ComparisonView from './ComparisonView'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function doc(id: string, pages: number) {
  return {
    doc_id: id, file_path: `C:/planos/${id}.pdf`, page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  usePdfStore.getState().addDoc(doc('rev-a', 5))
  usePdfStore.getState().addDoc(doc('rev-b', 5))
  usePdfStore.getState().setActiveDoc('rev-a')
  usePdfStore.setState({ compareMode: true, compareDocId: 'rev-b' })
})

const contador = (n: number, total: number) => screen.getByText(`${n} / ${total}`)

describe('comparar dos revisiones', () => {
  it('con el candado abierto, el panel derecho tiene sus propios controles', () => {
    usePdfStore.setState({ compareSync: false })
    render(<ComparisonView />)
    const siguiente = screen.getByLabelText('Página siguiente del documento de la derecha')
    fireEvent.click(siguiente)
    expect(contador(2, 5)).toBeTruthy()
    // El izquierdo no se movió: eso es lo que significa navegación independiente.
    expect(contador(1, 5)).toBeTruthy()
  })

  it('con el candado cerrado no se muestran controles separados', () => {
    usePdfStore.setState({ compareSync: true })
    render(<ComparisonView />)
    expect(screen.queryByLabelText('Página siguiente del documento de la derecha')).toBeNull()
  })
})
