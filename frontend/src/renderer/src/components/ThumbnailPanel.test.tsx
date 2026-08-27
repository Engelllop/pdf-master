import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const apiFetch = vi.fn(async (_p: string, _i?: RequestInit) => ({ ok: true, json: async () => ({}) }) as unknown as Response)
vi.mock('../lib/api', () => ({ apiFetch: (p: string, i?: RequestInit) => apiFetch(p, i) }))
vi.mock('../lib/pdfjs', () => ({
  renderPdfThumbnail: vi.fn(async (_d: string, _v: number, p: number) => ({
    url: `blob:t${p}`, width: 225, height: 300, originalWidth: 612, originalHeight: 792,
  })),
}))

// El diálogo real es un modal aparte; acá interesa el árbol, así que se acepta solo.
// Los mocks llevan la firma real: tipados sin argumentos, no se pueden inspeccionar los
// textos con los que se llamaron.
const askForm = vi.fn(async (_t: string, _f: Field[], _s?: string): Promise<FormValues | null> => ({ title: 'Alzados' }))
const askConfirm = vi.fn(async (_t: string, _m: string, _s?: string): Promise<boolean> => true)
vi.mock('./FormModal', () => ({
  useFormModal: () => ({ askForm, askConfirm, formModal: null }),
}))

import type { Field, FormValues } from './FormModal'
import ThumbnailPanel from './ThumbnailPanel'
import { usePdfStore, type OutlineItem } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

const INDICE: OutlineItem[] = [
  { title: 'Arquitectura', page: 0, children: [{ title: 'Fachadas', page: 5 }] },
  { title: 'Estructura', page: 8 },
]

function abrirConIndice() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:/planos/a.pdf', page_count: 10,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 10 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
  usePdfStore.getState().setOutline('doc-1', INDICE)
}

/** Índice escrito en la última llamada a `POST /pdf/outline`. */
function indiceEscrito() {
  const llamada = [...apiFetch.mock.calls].reverse().find((c) => String(c[0]).includes('/pdf/outline/'))
  return llamada ? JSON.parse(String((llamada[1] as RequestInit).body)) as OutlineItem[] : null
}

const titulos = (items: OutlineItem[]): string[] =>
  items.flatMap((i) => [i.title, ...titulos(i.children || [])])

async function panelEnEsquema() {
  abrirConIndice()
  const r = render(<ThumbnailPanel />)
  fireEvent.click(screen.getByTitle('Esquema'))
  await waitFor(() => expect(screen.getByText('Fachadas')).toBeTruthy())
  return r
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  apiFetch.mockClear(); askForm.mockClear(); askConfirm.mockClear()
  askConfirm.mockResolvedValue(true)
})

// El índice solo se podía AÑADIR: una entrada mal puesta, o el índice equivocado de un
// PDF ajeno, no había forma de quitarla ni de renombrarla desde la app.
describe('editar el índice del PDF', () => {
  it('borra la entrada y escribe el índice sin ella', async () => {
    await panelEnEsquema()
    fireEvent.click(screen.getByLabelText('Borrar Fachadas'))
    await waitFor(() => expect(indiceEscrito()).not.toBeNull())
    expect(titulos(indiceEscrito()!)).toEqual(['Arquitectura', 'Estructura'])
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })

  it('avisa de cuántas subentradas se lleva', async () => {
    await panelEnEsquema()
    fireEvent.click(screen.getByLabelText('Borrar Arquitectura'))
    await waitFor(() => expect(askConfirm).toHaveBeenCalled())
    expect(String(askConfirm.mock.calls[0][1])).toContain('1 subentrada')
  })

  it('cancelar no escribe nada', async () => {
    askConfirm.mockResolvedValue(false)
    await panelEnEsquema()
    fireEvent.click(screen.getByLabelText('Borrar Fachadas'))
    await waitFor(() => expect(askConfirm).toHaveBeenCalled())
    expect(indiceEscrito()).toBeNull()
  })

  it('renombra manteniendo la página y las hijas', async () => {
    await panelEnEsquema()
    fireEvent.click(screen.getByLabelText('Renombrar Fachadas'))
    await waitFor(() => expect(indiceEscrito()).not.toBeNull())
    const escrito = indiceEscrito()!
    expect(titulos(escrito)).toEqual(['Arquitectura', 'Alzados', 'Estructura'])
    expect(escrito[0].children![0].page).toBe(5)
  })

  it('el título propuesto es el actual', async () => {
    await panelEnEsquema()
    fireEvent.click(screen.getByLabelText('Renombrar Estructura'))
    await waitFor(() => expect(askForm).toHaveBeenCalled())
    expect(askForm.mock.calls[0][1]).toMatchObject([{ defaultValue: 'Estructura' }])
  })
})

// El marcador se guarda por ARCHIVO. El cuadro de abrir puede devolver la ruta con
// barras y mayúsculas distintas a las de la sesión guardada, y comparándolas tal cual
// los marcadores del propio archivo no aparecían.
describe('marcadores del archivo abierto', () => {
  const abrirYMarcar = (rutaDoc: string, rutaMarcador: string) => {
    usePdfStore.getState().addDoc({
      doc_id: 'doc-1', file_path: rutaDoc, page_count: 10,
      title: null, author: null, subject: null,
      page_sizes: Array.from({ length: 10 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
    })
    usePdfStore.getState().addBookmark({ id: 'b1', filePath: rutaMarcador, page: 3, label: 'Página 4' })
    render(<ThumbnailPanel />)
    fireEvent.click(screen.getByTitle('Marcadores'))
  }

  it('los muestra aunque la ruta venga con otras barras y mayúsculas', () => {
    abrirYMarcar('C:\\Planos\\A.pdf', 'c:/planos/a.pdf')
    expect(screen.getByText('Página 4')).toBeTruthy()
  })

  it('no muestra los de otro archivo', () => {
    abrirYMarcar('C:/planos/a.pdf', 'C:/planos/otro.pdf')
    expect(screen.getByText('Sin marcadores')).toBeTruthy()
  })
})
