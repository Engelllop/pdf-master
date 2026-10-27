import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('../lib/api', () => ({
  apiFetch: (r: string, i?: RequestInit) => apiFetch(r, i),
  setDeadDocReopener: () => {},
  baseConocida: () => 'http://localhost:8745',
}))
const selloUndoable = vi.fn(async () => {})
const quitarSelloUndoable = vi.fn(async () => 3)
vi.mock('../lib/pageUndo', () => ({
  selloUndoable: (...a: unknown[]) => selloUndoable(...(a as [])),
  quitarSelloUndoable: (...a: unknown[]) => quitarSelloUndoable(...(a as [])),
}))

import SellosDialog, { compactar } from './SellosDialog'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function abrir() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\planos\\A-101.pdf', page_count: 6,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 6 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
}

function motor(estado: Record<string, unknown> = { encabezado: null, numeracion: null, marca: null }) {
  apiFetch.mockImplementation(async (ruta: string) => {
    if (ruta.startsWith('/pdf/stamps/preview/')) return { ok: true, blob: async () => new Blob(['png']) }
    if (ruta.startsWith('/pdf/stamps/')) return { ok: true, json: async () => estado }
    return { ok: true, json: async () => ({}) }
  })
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  apiFetch.mockReset()
  selloUndoable.mockClear()
  quitarSelloUndoable.mockClear()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:vista')
  globalThis.URL.revokeObjectURL = vi.fn()
  abrir()
})

describe('diálogo de sellos', () => {
  it('abre en la pestaña pedida y pide la vista previa al motor', async () => {
    motor()
    render(<SellosDialog capaInicial="marca" onClose={() => {}} />)
    expect((screen.getByLabelText('Texto de la marca de agua') as HTMLInputElement).value).toBe('BORRADOR')
    await waitFor(() => expect(apiFetch.mock.calls.some(([r]) => String(r).startsWith('/pdf/stamps/preview/doc-1'))).toBe(true))
    const cuerpo = JSON.parse(apiFetch.mock.calls.find(([r]) => String(r).startsWith('/pdf/stamps/preview/'))![1].body)
    expect(cuerpo).toMatchObject({ capa: 'marca', page_num: 0 })
    expect(await screen.findByAltText('Vista previa de la página 1')).toBeTruthy()
  })

  it('aplicar manda la capa, la configuración y el rango en índices base 0', async () => {
    motor()
    const cerrar = vi.fn()
    render(<SellosDialog capaInicial="encabezado" onClose={cerrar} />)
    fireEvent.change(screen.getByLabelText('Arriba a la izquierda'), { target: { value: 'Proyecto {archivo}' } })
    fireEvent.change(screen.getByLabelText('Páginas'), { target: { value: '2-4' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar' })) })
    expect(selloUndoable).toHaveBeenCalledWith('doc-1', 'encabezado',
      expect.objectContaining({ zones: expect.objectContaining({ tl: 'Proyecto {archivo}' }) }), [1, 2, 3])
    expect(cerrar).toHaveBeenCalled()
  })

  it('un rango inválido no aplica nada', async () => {
    motor()
    render(<SellosDialog capaInicial="encabezado" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Páginas'), { target: { value: '9-12' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar' })) })
    expect(selloUndoable).not.toHaveBeenCalled()
    expect(usePdfStore.getState().toasts.at(-1)?.message).toMatch(/Rango de páginas inválido/)
  })

  it('se abre con lo ya aplicado y ofrece reemplazar o quitar', async () => {
    motor({ encabezado: null, marca: null, numeracion: { zones: { tc: '- {n} -' }, start: 5, pages: [1, 2, 3, 5] } })
    render(<SellosDialog capaInicial="numeracion" onClose={() => {}} />)
    await waitFor(() => expect((screen.getByLabelText('Texto de la numeración') as HTMLInputElement).value).toBe('- {n} -'))
    expect((screen.getByLabelText('Número inicial') as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText('Páginas') as HTMLInputElement).value).toBe('2-4, 6')
    expect(screen.getByRole('radio', { name: 'Arriba al centro' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Reemplazar' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Quitar del documento/ })) })
    expect(quitarSelloUndoable).toHaveBeenCalledWith('doc-1', 'numeracion')
  })

  it('mover la numeración de posición lleva el texto a la nueva esquina', async () => {
    motor()
    render(<SellosDialog capaInicial="numeracion" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Arriba a la izquierda' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar' })) })
    expect(selloUndoable).toHaveBeenCalledWith('doc-1', 'numeracion',
      expect.objectContaining({ zones: { tl: 'Página {n} de {total}' } }), undefined)
  })
})

describe('compactar', () => {
  it('vuelve los índices al rango que escribe una persona', () => {
    expect(compactar([0, 1, 2, 4, 5, 6, 9])).toBe('1-3, 5-7, 10')
    expect(compactar([3])).toBe('4')
  })
})
