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

// El módulo cachea la configuración buena en un `let`, así que estos tests corren en
// su propio archivo importado en limpio (`vi.resetModules` + import dinámico) para no
// heredar la caché de los de arriba ni dejársela puesta a nadie.
async function apiLimpia() {
  vi.resetModules()
  return await import('./api')
}

const configura = (impl: (() => Promise<{ base: string; token: string }>) | undefined) => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: impl ? { getApiConfig: impl } : {},
  })
}

describe('token y base del motor', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('pone el token en la cabecera y usa la base que da el main', async () => {
    const { apiFetch: fetchApi } = await apiLimpia()
    const fetchMock = vi.fn().mockResolvedValue(res(200))
    vi.stubGlobal('fetch', fetchMock)
    configura(async () => ({ base: 'http://localhost:8748', token: 'abc123' }))

    await fetchApi('/pdf/health')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8748/pdf/health')
    expect(fetchMock.mock.calls[0][1].headers['X-Pdfmaster-Token']).toBe('abc123')
  })

  it('solo pregunta una vez: la configuración buena se cachea', async () => {
    const { apiFetch: fetchApi } = await apiLimpia()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200)))
    const puente = vi.fn(async () => ({ base: 'http://localhost:8745', token: 't' }))
    configura(puente)

    await fetchApi('/pdf/health')
    await fetchApi('/pdf/health')
    await fetchApi('/pdf/health')

    expect(puente).toHaveBeenCalledTimes(1)
  })

  it('un fallo NO se cachea: la llamada siguiente vuelve a preguntar y ya va con token', async () => {
    // Este era el bug: se cacheaba con `apiToken === null`, así que un fallo
    // transitorio dejaba el token en '' para siempre y todo lo demás daba 403 hasta
    // reiniciar la app.
    const { apiFetch: fetchApi } = await apiLimpia()
    const fetchMock = vi.fn().mockResolvedValue(res(200))
    vi.stubGlobal('fetch', fetchMock)
    let intentos = 0
    configura(async () => {
      intentos += 1
      if (intentos === 1) throw new Error('el main todavía no responde')
      return { base: 'http://localhost:8745', token: 'bueno' }
    })

    await fetchApi('/pdf/health')
    expect(fetchMock.mock.calls[0][1].headers['X-Pdfmaster-Token']).toBeUndefined()

    await fetchApi('/pdf/health')
    expect(fetchMock.mock.calls[1][1].headers['X-Pdfmaster-Token']).toBe('bueno')
    expect(intentos).toBe(2)
  })

  it('sin puente (tests, o antes del preload) cae al puerto de siempre sin cabecera', async () => {
    const { apiFetch: fetchApi } = await apiLimpia()
    const fetchMock = vi.fn().mockResolvedValue(res(200))
    vi.stubGlobal('fetch', fetchMock)
    configura(undefined)

    await fetchApi('/pdf/health')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8745/pdf/health')
    expect(fetchMock.mock.calls[0][1].headers['X-Pdfmaster-Token']).toBeUndefined()
  })

  it('el reintento por doc_id muerto reusa la misma base', async () => {
    const { apiFetch: fetchApi, setDeadDocReopener: setReopener } = await apiLimpia()
    const fetchMock = vi.fn().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', fetchMock)
    configura(async () => ({ base: 'http://localhost:8750', token: 't' }))
    setReopener(async () => ALIVE)

    await fetchApi(`/pdf/rotate/${DEAD}`, { method: 'POST' })

    expect(fetchMock.mock.calls[1][0]).toBe(`http://localhost:8750/pdf/rotate/${ALIVE}`)
  })

  it('`baseConocida` está vacía hasta que hay configuración, y luego la dice', async () => {
    const api = await apiLimpia()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200)))
    configura(async () => ({ base: 'http://localhost:8751', token: 't' }))

    expect(api.baseConocida()).toBe('')
    await api.apiFetch('/pdf/health')
    expect(api.baseConocida()).toBe('http://localhost:8751')
  })
})
