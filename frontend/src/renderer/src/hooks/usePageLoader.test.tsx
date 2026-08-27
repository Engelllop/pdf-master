import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePageLoader } from './usePageLoader'
import { usePdfStore } from '../store/usePdfStore'

// Cada render devuelve un blob URL nuevo, y `cachePage` REVOCA el que reemplaza: dos
// rasterizaciones de la misma página compitiendo por la misma entrada del cache dejan
// un blob revocado, que en un <img> es una página en blanco.
type Pendiente = { page: number; scale: number; resolver: (url: string) => void }
let pendientes: Pendiente[] = []
let nUrl = 0

const renderPdfPage = vi.fn(
  (_d: string, _v: number, page: number, scale: number) =>
    new Promise((resolve) => {
      pendientes.push({
        page, scale,
        resolver: (url: string) => resolve({ url, width: 800 * scale, height: 600 * scale, originalWidth: 800, originalHeight: 600 }),
      })
    }),
)

vi.mock('../lib/pdfjs', () => ({
  renderPdfPage: (d: string, v: number, p: number, s: number) => renderPdfPage(d, v, p, s),
  isDeadDocError: () => false,
}))
vi.mock('../lib/openDocument', () => ({ reopenDeadDoc: vi.fn() }))
vi.mock('../lib/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }))

const revoke = vi.fn()
const initialState = usePdfStore.getState()

function abrir(pages = 5) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:/planos/a.pdf',
    page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
}

/** Resuelve la rasterización pendiente de esa página (la primera que quede). */
async function resolver(page: number, url: string) {
  const i = pendientes.findIndex((p) => p.page === page)
  expect(i, `no hay render pendiente de la página ${page}`).toBeGreaterThanOrEqual(0)
  const [p] = pendientes.splice(i, 1)
  p.resolver(url)
  await waitFor(() => expect(true).toBe(true))
}

const enCache = (page: number) => usePdfStore.getState().getCachedPage('doc-1', page)

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  pendientes = []
  nUrl = 0
  renderPdfPage.mockClear()
  revoke.mockClear()
  vi.stubGlobal('URL', { createObjectURL: () => `blob:x${++nUrl}`, revokeObjectURL: revoke })
})

describe('vista doble', () => {
  // El panel derecho ES `page + 1`: precargarla además rasterizaba la misma página dos
  // veces (a dos resoluciones) y las dos carreras se pisaban en la misma entrada.
  it('no rasteriza dos veces la página del panel derecho', async () => {
    abrir()
    usePdfStore.getState().setViewMode('double')
    renderHook(() => usePageLoader())
    await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0))
    const dePagina1 = renderPdfPage.mock.calls.filter((c) => c[2] === 1)
    expect(dePagina1).toHaveLength(1)
  })

  it('sigue precargando la siguiente pareja', async () => {
    abrir()
    usePdfStore.getState().setViewMode('double')
    renderHook(() => usePageLoader())
    await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0))
    expect(renderPdfPage.mock.calls.some((c) => c[2] === 2)).toBe(true)
  })
})

describe('el preload no pisa el bitmap que se está mostrando', () => {
  it('descarta y libera su bitmap si la página ya se rasterizó de verdad', async () => {
    abrir()
    usePdfStore.getState().setViewMode('double')
    renderHook(() => usePageLoader())
    await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0))

    // La página 2 se precarga (baja resolución). Antes de que termine, alguien la
    // rasteriza de verdad y la deja en el cache: es la que se está mostrando.
    usePdfStore.getState().cachePage('doc-1', 2, {
      image: 'blob:buena', width: 1600, height: 1200, originalWidth: 800, originalHeight: 600,
    })
    await resolver(2, 'blob:preload')

    expect(enCache(2)?.image).toBe('blob:buena')
    expect(revoke).toHaveBeenCalledWith('blob:preload')
    expect(revoke).not.toHaveBeenCalledWith('blob:buena')
  })

  it('si nadie la rasterizó, el preload sí llena el cache', async () => {
    abrir()
    renderHook(() => usePageLoader())
    await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0))
    await resolver(1, 'blob:preload')
    expect(enCache(1)?.image).toBe('blob:preload')
    expect(revoke).not.toHaveBeenCalledWith('blob:preload')
  })
})
