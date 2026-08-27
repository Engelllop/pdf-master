import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

// El diálogo de la capa viene de `lib/uiPrompt`.
const askForm = vi.fn(async (_t: string, _f: unknown[], _s?: string): Promise<Record<string, unknown> | null> => ({ capa: 'Eléctrico' }))
vi.mock('../lib/uiPrompt', () => ({
  askForm: (t: string, f: unknown[], s?: string) => askForm(t, f, s),
  askConfirm: vi.fn(async () => true),
}))

import ReviewPanel from './ReviewPanel'

const initialState = usePdfStore.getState()

function conMarcas(marcas: Annotation[]) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 3,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 3 }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
  usePdfStore.getState().setAnnotations('doc-1', marcas)
  return usePdfStore.getState().docs[0]
}

const marca = (id: string, extra: Partial<Annotation> = {}): Annotation =>
  ({ id, type: 'rect', page: 0, x: 10, y: 10, width: 20, height: 20, ...extra })

const anns = () => usePdfStore.getState().docs[0].annotations

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  askForm.mockClear()
  askForm.mockResolvedValue({ capa: 'Eléctrico' })
})

// Las capas eran solo un filtro: nada en la app ponía una marca en otra capa (todo se
// creaba en «Marcas»), así que el selector solo servía para lo que llegaba importado.
describe('mover marcas a una capa', () => {
  it('mueve lo que muestra el filtro, en un paso de deshacer', async () => {
    const doc = conMarcas([marca('a'), marca('b'), marca('c', { page: 1 })])
    render(<ReviewPanel activeDoc={doc} />)
    usePdfStore.setState({ undoStack: [], redoStack: [] })

    await act(async () => { fireEvent.click(screen.getByText('Mover a capa…')) })

    expect(anns().every((a) => a.layer === 'Eléctrico')).toBe(true)
    expect(usePdfStore.getState().undoStack.length).toBe(1)
    usePdfStore.getState().undo()
    expect(anns().every((a) => a.layer === undefined)).toBe(true)
  })

  it('respeta el filtro de estado: solo mueve las que se ven', async () => {
    const doc = conMarcas([marca('a', { status: 'open' }), marca('b', { status: 'resolved' })])
    render(<ReviewPanel activeDoc={doc} />)
    fireEvent.click(screen.getByText('Resueltas'))
    await act(async () => { fireEvent.click(screen.getByText('Mover a capa…')) })

    const porId = Object.fromEntries(anns().map((a) => [a.id, a.layer]))
    expect(porId['b']).toBe('Eléctrico')
    expect(porId['a']).toBeUndefined()
  })

  it('si se cancela el diálogo no cambia nada', async () => {
    const doc = conMarcas([marca('a')])
    askForm.mockResolvedValueOnce(null)
    render(<ReviewPanel activeDoc={doc} />)
    await act(async () => { fireEvent.click(screen.getByText('Mover a capa…')) })
    expect(anns()[0].layer).toBeUndefined()
  })

  it('un nombre en blanco no crea una capa vacía', async () => {
    const doc = conMarcas([marca('a')])
    askForm.mockResolvedValueOnce({ capa: '   ' })
    render(<ReviewPanel activeDoc={doc} />)
    await act(async () => { fireEvent.click(screen.getByText('Mover a capa…')) })
    expect(anns()[0].layer).toBeUndefined()
  })
})

// Las capas se filtraban en la lista del panel, pero en pantalla se dibujaban todas: en
// un plano con «Eléctrico» y «Estructura» encima, lo que uno quiere es apagar una.
describe('apagar y prender capas', () => {
  const dosCapas = () => conMarcas([
    marca('a', { layer: 'Eléctrico' }),
    marca('b', { layer: 'Estructura' }),
  ])

  it('el visor deja de recibir las marcas de la capa apagada', () => {
    const doc = dosCapas()
    render(<ReviewPanel activeDoc={doc} />)
    expect(usePdfStore.getState().getAnnotationsForPage('doc-1', 0).map((a) => a.id)).toEqual(['a', 'b'])

    fireEvent.click(screen.getByTitle('Ocultar la capa Eléctrico'))
    expect(usePdfStore.getState().getAnnotationsForPage('doc-1', 0).map((a) => a.id)).toEqual(['b'])

    fireEvent.click(screen.getByTitle('Mostrar la capa Eléctrico'))
    expect(usePdfStore.getState().getAnnotationsForPage('doc-1', 0).map((a) => a.id)).toEqual(['a', 'b'])
  })

  // Ocultar es estado de vista: si se cayera del documento sería borrar sin decirlo.
  it('las marcas ocultas siguen en el documento', () => {
    const doc = dosCapas()
    render(<ReviewPanel activeDoc={doc} />)
    fireEvent.click(screen.getByTitle('Ocultar la capa Eléctrico'))
    expect(anns().map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('con una sola capa no se ofrece el control', () => {
    const doc = conMarcas([marca('a')])
    render(<ReviewPanel activeDoc={doc} />)
    expect(screen.queryByText('Ver:')).toBeNull()
  })
})

describe('estado deshabilitado', () => {
  it('un botón apagado se ve apagado y lo dice el cursor', () => {
    const doc = conMarcas([marca('a')])
    render(<ReviewPanel activeDoc={doc} />)
    fireEvent.click(screen.getByTitle('Responder'))
    const enviar = screen.getByLabelText('Enviar respuesta')
    expect((enviar as HTMLButtonElement).disabled).toBe(true)
    // Había cuatro opacidades distintas para «deshabilitado» (30/40/50/70) y solo
    // 2 de 19 botones cambiaban el cursor.
    expect(enviar.className).toMatch(/disabled:opacity-40/)
    expect(enviar.className).toMatch(/disabled:cursor-not-allowed/)
  })
})

describe('densidad y jerarquía del panel', () => {
  it('el tipo de marca pesa más que sus metadatos', () => {
    const doc = conMarcas([marca('a', { author: 'Engell', text: 'revisar cota' })])
    render(<ReviewPanel activeDoc={doc} />)
    // Antes el panel entero era text-micro: título, texto, autor y fecha al mismo
    // tamaño, sin punto de entrada para el ojo.
    const titulo = screen.getAllByText('Rectángulo').find((el) => el.tagName === 'SPAN')!
    expect(titulo.className).toMatch(/text-mini/)
    const meta = screen.getAllByText(/Engell/).find((el) => el.tagName === 'DIV')!
    expect(meta.className).toMatch(/text-micro/)
  })

  it('la cabecera de página se queda a la vista al desplazar', () => {
    const doc = conMarcas([marca('a'), marca('b', { page: 1 })])
    render(<ReviewPanel activeDoc={doc} />)
    expect(screen.getByText(/Página 1/).closest('button')!.className).toMatch(/sticky/)
  })

  it('«Mover a capa» sale del bloque de filtros y baja al pie', () => {
    const doc = conMarcas([marca('a')])
    const { container } = render(<ReviewPanel activeDoc={doc} />)
    const boton = screen.getByText('Mover a capa…').closest('button')!
    const filtros = container.querySelector('.border-b')!
    // Ocupaba una quinta fila fija de cabecera en un panel de 320 px de ancho.
    expect(filtros.contains(boton)).toBe(false)
  })

  it('una marca resuelta apaga su contenido, no sus acciones', () => {
    const doc = conMarcas([marca('a', { status: 'resolved' })])
    render(<ReviewPanel activeDoc={doc} />)
    const borrar = screen.getByLabelText('Eliminar anotación')
    expect(borrar.closest('div')!.className).not.toMatch(/^opacity-60/)
    expect(borrar.className).not.toMatch(/opacity-60/)
  })
})
