import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
// El borrado de una categoría pide confirmación por `lib/uiPrompt`.
const askConfirm = vi.fn(async (_t: string, _m: string, _c?: string) => true)
vi.mock('../lib/uiPrompt', () => ({
  askConfirm: (t: string, m: string, c?: string) => askConfirm(t, m, c),
  askForm: vi.fn(async () => null),
}))

import CountPanel from './CountPanel'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function conConteos(categorias: Record<string, number>) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 3,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 3 }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
  let n = 0
  const marcas: Annotation[] = []
  for (const [cat, cuantos] of Object.entries(categorias)) {
    for (let i = 0; i < cuantos; i++) {
      marcas.push({ id: `c${n++}`, type: 'count', page: 0, x: 10 + n, y: 10, text: cat, symbol: 'circle' })
    }
  }
  usePdfStore.getState().setAnnotations('doc-1', marcas)
  return usePdfStore.getState().docs[0]
}

const conteos = () => usePdfStore.getState().docs[0].annotations.filter((a) => a.type === 'count')

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  askConfirm.mockClear()
  askConfirm.mockResolvedValue(true)
})

// La categoría vive en el `text` de cada conteo: con 200 piezas contadas y el nombre
// mal escrito, la única salida era borrarlas y volver a contar.
describe('renombrar una categoría de conteo', () => {
  it('cambia todas las marcas del grupo en un solo paso de deshacer', () => {
    const doc = conConteos({ Luminarais: 3, Tomas: 2 })
    render(<CountPanel activeDoc={doc} />)
    usePdfStore.setState({ undoStack: [], redoStack: [] })

    fireEvent.click(screen.getByLabelText('Renombrar la categoría Luminarais'))
    const input = screen.getByLabelText('Nuevo nombre para la categoría Luminarais')
    fireEvent.change(input, { target: { value: 'Luminarias' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const porCategoria = conteos().reduce<Record<string, number>>((acc, a) => {
      acc[a.text!] = (acc[a.text!] || 0) + 1
      return acc
    }, {})
    expect(porCategoria).toEqual({ Luminarias: 3, Tomas: 2 })
    expect(usePdfStore.getState().undoStack.length).toBe(1)

    usePdfStore.getState().undo()
    expect(conteos().filter((a) => a.text === 'Luminarais').length).toBe(3)
  })

  it('la categoría activa sigue al nombre nuevo', () => {
    const doc = conConteos({ Tomas: 1 })
    usePdfStore.getState().setCountCategory('Tomas')
    render(<CountPanel activeDoc={doc} />)
    fireEvent.click(screen.getByLabelText('Renombrar la categoría Tomas'))
    const input = screen.getByLabelText('Nuevo nombre para la categoría Tomas')
    fireEvent.change(input, { target: { value: 'Tomacorrientes' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(usePdfStore.getState().countCategory).toBe('Tomacorrientes')
  })

  it('Esc cancela y no toca nada', () => {
    const doc = conConteos({ Tomas: 2 })
    render(<CountPanel activeDoc={doc} />)
    fireEvent.click(screen.getByLabelText('Renombrar la categoría Tomas'))
    const input = screen.getByLabelText('Nuevo nombre para la categoría Tomas')
    fireEvent.change(input, { target: { value: 'Otra' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(conteos().every((a) => a.text === 'Tomas')).toBe(true)
  })

  it('un nombre vacío no borra la categoría', () => {
    const doc = conConteos({ Tomas: 2 })
    render(<CountPanel activeDoc={doc} />)
    fireEvent.click(screen.getByLabelText('Renombrar la categoría Tomas'))
    const input = screen.getByLabelText('Nuevo nombre para la categoría Tomas')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(conteos().every((a) => a.text === 'Tomas')).toBe(true)
  })

  it('renombrar a una categoría existente fusiona los grupos', () => {
    const doc = conConteos({ Tomas: 2, Luminarias: 1 })
    render(<CountPanel activeDoc={doc} />)
    fireEvent.click(screen.getByLabelText('Renombrar la categoría Tomas'))
    const input = screen.getByLabelText('Nuevo nombre para la categoría Tomas')
    fireEvent.change(input, { target: { value: 'Luminarias' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(conteos().filter((a) => a.text === 'Luminarias').length).toBe(3)
  })
})

// Mismo motivo que el renombrado: con 200 piezas contadas, cambiar el color o borrar el
// grupo marca por marca no es una opción.
describe('acciones sobre toda la categoría', () => {
  it('el color se aplica a todas y el arrastre del selector es un paso', async () => {
    const doc = conConteos({ Tomas: 3 })
    render(<CountPanel activeDoc={doc} />)
    usePdfStore.setState({ undoStack: [], redoStack: [] })
    const input = screen.getByLabelText('Color de la categoría Tomas')
    for (const c of ['#111111', '#222222', '#ff0000']) {
      fireEvent.change(input, { target: { value: c } })
    }
    expect(conteos().every((a) => a.color === '#ff0000')).toBe(true)
    expect(usePdfStore.getState().undoStack.length).toBe(1)
  })

  it('borrar la categoría pide confirmación y quita solo ese grupo', async () => {
    const doc = conConteos({ Tomas: 2, Luminarias: 1 })
    render(<CountPanel activeDoc={doc} />)
    await fireEvent.click(screen.getByLabelText('Eliminar la categoría Tomas'))
    await Promise.resolve()
    await Promise.resolve()
    expect(askConfirm).toHaveBeenCalled()
    expect(conteos().map((a) => a.text)).toEqual(['Luminarias'])
    usePdfStore.getState().undo()
    expect(conteos().length).toBe(3)
  })

  it('si se cancela la confirmación no borra nada', async () => {
    const doc = conConteos({ Tomas: 2 })
    askConfirm.mockResolvedValueOnce(false)
    render(<CountPanel activeDoc={doc} />)
    await fireEvent.click(screen.getByLabelText('Eliminar la categoría Tomas'))
    await Promise.resolve()
    await Promise.resolve()
    expect(conteos().length).toBe(2)
  })
})
