import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Toolbar son 990 líneas sin un solo test, y encima la búsqueda en todos los
// documentos acaba de pasar a `correrLote` (antes era una copia a mano del recorrido
// de `runBatch`): esto fija lo que el usuario ve —resultados, avisos y barra de
// progreso— para que el cambio no se pueda desandar sin que algo se ponga rojo.

const apiFetch = vi.fn(async (_ruta: string, _init?: RequestInit) => ({
  ok: true, json: async () => [] as unknown,
}) as unknown as Response)
vi.mock('../lib/api', () => ({
  apiFetch: (r: string, i?: RequestInit) => apiFetch(r, i),
  // `openDocument` (que Toolbar arrastra por FileMenu) registra el reabridor al
  // importarse, así que el mock tiene que ofrecerlo aunque este test no lo use.
  setDeadDocReopener: () => {},
  baseConocida: () => 'http://localhost:8745',
}))
vi.mock('../hooks/usePdfActions', () => ({
  usePdfActions: () => new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('../lib/speech', () => ({ leerEnVozAlta: vi.fn(), detenerLectura: vi.fn() }))
vi.mock('./PrintDialog', () => ({ default: () => null }))
vi.mock('./PropertiesBar', () => ({ default: () => null }))
vi.mock('./FormModal', () => ({ useFormModal: () => ({ modal: null, ask: vi.fn() }) }))

import Toolbar from './Toolbar'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function abrir(ids: string[] = ['doc-1']) {
  for (const id of ids) {
    usePdfStore.getState().addDoc({
      doc_id: id,
      file_path: `C:\\planos\\${id}.pdf`,
      page_count: 3,
      title: null, author: null, subject: null,
      page_sizes: Array.from({ length: 3 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
    })
  }
  usePdfStore.getState().setActiveDoc(ids[0])
}

/** Cada documento devuelve `n` resultados en su página 1. */
function motorConResultados(n: number) {
  apiFetch.mockImplementation(async (ruta: string) => ({
    ok: true,
    json: async () => (ruta.includes('/pdf/search/')
      ? Array.from({ length: n }, (_, i) => ({ page: 1, text: `hit ${i}`, x0: 0, y0: 0, x1: 10, y1: 10 }))
      : []),
  }) as unknown as Response)
}

async function abrirBuscador() {
  render(<Toolbar />)
  fireEvent.click(screen.getByLabelText('Buscar'))
  return await screen.findByLabelText('Buscar en el documento')
}

const avisos = () => usePdfStore.getState().toasts.map((t) => t.message)
const rutasBuscadas = () => apiFetch.mock.calls.map((c) => c[0]).filter((r) => r.includes('/pdf/search/'))

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  apiFetch.mockClear()
  apiFetch.mockImplementation(async () => ({ ok: true, json: async () => [] }) as unknown as Response)
})

describe('el buscador', () => {
  beforeEach(() => { abrir() })

  it('se abre y se cierra desde el botón', async () => {
    render(<Toolbar />)
    expect(screen.queryByLabelText('Buscar en el documento')).toBeNull()
    fireEvent.click(screen.getByLabelText('Buscar'))
    expect(await screen.findByLabelText('Buscar en el documento')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Cerrar búsqueda'))
    await waitFor(() => expect(screen.queryByLabelText('Buscar en el documento')).toBeNull())
  })

  it('con el campo vacío no llama al motor', async () => {
    const campo = await abrirBuscador()
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(rutasBuscadas()).toHaveLength(0))
  })

  it('busca en el documento activo y guarda los resultados', async () => {
    motorConResultados(3)
    const campo = await abrirBuscador()
    fireEvent.change(campo, { target: { value: 'viga' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    await waitFor(() => expect(usePdfStore.getState().docs[0].searchResults).toHaveLength(3))
    expect(rutasBuscadas()[0]).toContain('/pdf/search/doc-1')
    expect(rutasBuscadas()[0]).toContain('query=viga')
  })

  it('escapa el texto en el query: un «&» no puede partir la URL', async () => {
    const campo = await abrirBuscador()
    fireEvent.change(campo, { target: { value: 'A&B 100%' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(rutasBuscadas()).toHaveLength(1))
    expect(rutasBuscadas()[0]).toContain(`query=${encodeURIComponent('A&B 100%')}`)
  })

  it('salta a la página del primer resultado', async () => {
    motorConResultados(2)
    const campo = await abrirBuscador()
    fireEvent.change(campo, { target: { value: 'viga' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(usePdfStore.getState().docs[0].currentPage).toBe(1))
  })

  it('un fallo del motor lo dice, no se queda callado', async () => {
    apiFetch.mockImplementation(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
    const campo = await abrirBuscador()
    fireEvent.change(campo, { target: { value: 'viga' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(avisos()).toContain('No se pudo buscar'))
  })

  it('deja la barra de progreso cerrada al terminar', async () => {
    motorConResultados(1)
    const campo = await abrirBuscador()
    fireEvent.change(campo, { target: { value: 'viga' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(usePdfStore.getState().docs[0].searchResults).toHaveLength(1))
    expect(usePdfStore.getState().progress).toBeNull()
  })
})

describe('buscar en TODOS los documentos abiertos', () => {
  beforeEach(() => { abrir(['doc-1', 'doc-2', 'doc-3']) })

  async function buscarEnTodos(texto = 'viga') {
    const campo = await abrirBuscador()
    // «Todos los docs» vive en la fila de Reemplazar, así que hay que abrirla antes
    // (que la opción de buscar en todo esté escondida detrás de «Reemplazar» es raro,
    // pero es lo que hay hoy: el test describe la UI actual, no la que debería ser).
    fireEvent.click(screen.getByText('Reemplazar', { selector: 'button' }))
    fireEvent.click(await screen.findByLabelText('Buscar en todos los documentos abiertos'))
    fireEvent.change(campo, { target: { value: texto } })
    fireEvent.keyDown(campo, { key: 'Enter' })
  }

  it('recorre los tres, de a uno (el motor tiene un solo worker de fitz)', async () => {
    motorConResultados(2)
    await buscarEnTodos()
    await waitFor(() => expect(rutasBuscadas()).toHaveLength(3))
    expect(rutasBuscadas().map((r) => r.split('/pdf/search/')[1].split('?')[0]))
      .toEqual(['doc-1', 'doc-2', 'doc-3'])
  })

  it('guarda los resultados en cada documento, no solo en el activo', async () => {
    motorConResultados(2)
    await buscarEnTodos()
    await waitFor(() => {
      expect(usePdfStore.getState().docs.map((d) => d.searchResults.length)).toEqual([2, 2, 2])
    })
  })

  it('avisa el total sumado de los tres', async () => {
    motorConResultados(2)
    await buscarEnTodos()
    await waitFor(() => expect(avisos().some((m) => m.includes('6 resultado(s)'))).toBe(true))
  })

  it('cero resultados en todos es un aviso informativo, no un error', async () => {
    motorConResultados(0)
    await buscarEnTodos()
    await waitFor(() => expect(usePdfStore.getState().toasts.length).toBeGreaterThan(0))
    expect(usePdfStore.getState().toasts.at(-1)?.type).toBe('info')
  })

  it('si el motor falla en todos, sale un error', async () => {
    apiFetch.mockImplementation(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
    await buscarEnTodos()
    await waitFor(() => expect(avisos()).toContain('No se pudo buscar'))
  })

  it('cierra la barra de progreso aunque el motor reviente a mitad de camino', async () => {
    // El `finally` de `correrLote`: sin él, un fallo dejaba la barra puesta y la app
    // parecía colgada para siempre.
    apiFetch.mockImplementation(async (ruta: string) => {
      if (ruta.includes('doc-2')) throw new Error('el motor murió')
      return { ok: true, json: async () => [] } as unknown as Response
    })
    await buscarEnTodos()
    await waitFor(() => expect(usePdfStore.getState().progress).toBeNull())
  })

  it('cancelar a mitad conserva lo ya buscado y lo dice', async () => {
    motorConResultados(1)
    apiFetch.mockImplementation(async (ruta: string) => {
      // El usuario le da a cancelar justo después del primero.
      if (ruta.includes('doc-1')) usePdfStore.getState().requestCancel()
      return {
        ok: true,
        json: async () => [{ page: 1, text: 'hit', x0: 0, y0: 0, x1: 10, y1: 10 }],
      } as unknown as Response
    })
    await buscarEnTodos()
    await waitFor(() => expect(avisos().some((m) => m.startsWith('Cancelado:'))).toBe(true))
    expect(rutasBuscadas().length).toBeLessThan(3)
  })
})
