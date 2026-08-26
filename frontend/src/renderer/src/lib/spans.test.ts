import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { getSpans } from './spans'

beforeEach(() => { apiFetch.mockReset() })

describe('caché de spans', () => {
  it('no deja pegado un fallo: el siguiente intento vuelve a pedir', async () => {
    apiFetch.mockRejectedValueOnce(new Error('motor caído'))
    expect(await getSpans('doc-fallo', 0)).toEqual([])

    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ spans: [{ text: 'ok' }] }) })
    const segundo = await getSpans('doc-fallo', 0)
    expect(segundo).toEqual([{ text: 'ok' }])
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('un resultado bueno sí se reutiliza', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ spans: [{ text: 'a' }] }) })
    await getSpans('doc-ok', 3)
    await getSpans('doc-ok', 3)
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
