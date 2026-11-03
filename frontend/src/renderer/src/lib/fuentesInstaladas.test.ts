import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { opcionesDeFuente } from './fuentesInstaladas'

describe('opcionesDeFuente', () => {
  it('ofrece las instaladas', () => {
    expect(opcionesDeFuente(['Arial', 'Calibri'], 'Calibri')).toEqual(['Arial', 'Calibri'])
  })
  it('agrega la del texto editado si el sistema no la lista, para no dejar el selector en blanco', () => {
    expect(opcionesDeFuente(['Arial', 'Calibri'], 'Gotham')).toEqual(['Gotham', 'Arial', 'Calibri'])
  })
  it('sin lista del motor ofrece las tres de siempre', () => {
    expect(opcionesDeFuente([], 'Arial')).toEqual(['Arial', 'Times New Roman', 'Courier New'])
    expect(opcionesDeFuente([], 'Cambria')).toEqual(['Cambria', 'Arial', 'Times New Roman', 'Courier New'])
  })
})

describe('cargarFuentesInstaladas', () => {
  beforeEach(() => { apiFetch.mockReset(); vi.resetModules() })

  it('pide /pdf/fonts una sola vez aunque se llame varias', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ families: ['Arial', 'Calibri'] }) })
    const { cargarFuentesInstaladas } = await import('./fuentesInstaladas')
    expect(await cargarFuentesInstaladas()).toEqual(['Arial', 'Calibri'])
    expect(await cargarFuentesInstaladas()).toEqual(['Arial', 'Calibri'])
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/pdf/fonts')
  })

  it('si el motor falla devuelve [] y la próxima vez vuelve a preguntar', async () => {
    apiFetch.mockRejectedValueOnce(new Error('sin motor'))
    const { cargarFuentesInstaladas } = await import('./fuentesInstaladas')
    expect(await cargarFuentesInstaladas()).toEqual([])
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ families: ['Arial'] }) })
    expect(await cargarFuentesInstaladas()).toEqual(['Arial'])
  })

  it('una respuesta que no es lista se toma por vacía', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ families: 'x' }) })
    const { cargarFuentesInstaladas } = await import('./fuentesInstaladas')
    expect(await cargarFuentesInstaladas()).toEqual([])
  })
})
