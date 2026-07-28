import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { apiFetch, setDeadDocReopener } from './api'

const DEAD = '11111111-2222-3333-4444-555555555555'
const ALIVE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const res = (status: number) => new Response('{}', { status })

beforeEach(() => {
  vi.restoreAllMocks()
  setDeadDocReopener(async () => null)
})

afterEach(() => { vi.unstubAllGlobals() })

describe('recuperación de doc_id muerto', () => {
  it('reabre y reintenta con el id nuevo cuando la ruta da 404', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', fetchMock)
    const reopen = vi.fn(async () => ALIVE)
    setDeadDocReopener(reopen)

    const out = await apiFetch(`/pdf/watermark/${DEAD}`, { method: 'POST' })

    expect(out.status).toBe(200)
    expect(reopen).toHaveBeenCalledWith(DEAD)
    expect(fetchMock.mock.calls[1][0]).toContain(ALIVE)
    expect(fetchMock.mock.calls[1][0]).not.toContain(DEAD)
  })

  it('conserva el resto de la ruta y el query al reintentar', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', fetchMock)
    setDeadDocReopener(async () => ALIVE)

    await apiFetch(`/pdf/page-image/${DEAD}/4?zoom=1.5`)

    expect(fetchMock.mock.calls[1][0]).toBe(`http://localhost:8745/pdf/page-image/${ALIVE}/4?zoom=1.5`)
  })

  it('no reintenta si no se pudo reabrir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal('fetch', fetchMock)
    setDeadDocReopener(async () => null)

    const out = await apiFetch(`/pdf/rotate/${DEAD}`, { method: 'POST' })

    expect(out.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no toca /pdf/open: es la llamada con la que se reabre (evita el bucle)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal('fetch', fetchMock)
    const reopen = vi.fn(async () => ALIVE)
    setDeadDocReopener(reopen)

    await apiFetch('/pdf/open', { method: 'POST' })

    expect(reopen).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un 404 sin doc_id en la ruta se devuelve tal cual', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal('fetch', fetchMock)
    const reopen = vi.fn(async () => ALIVE)
    setDeadDocReopener(reopen)

    const out = await apiFetch('/pdf/health')

    expect(out.status).toBe(404)
    expect(reopen).not.toHaveBeenCalled()
  })

  it('una respuesta correcta no dispara ninguna reapertura', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200))
    vi.stubGlobal('fetch', fetchMock)
    const reopen = vi.fn(async () => ALIVE)
    setDeadDocReopener(reopen)

    await apiFetch(`/pdf/spans/${DEAD}/0`)

    expect(reopen).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
