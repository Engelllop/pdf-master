import { describe, it, expect, vi } from 'vitest'
import { correrCola } from './batchQueue'

const ctrl = (cancelarEn = -1) => {
  const pasos: number[] = []
  let vueltas = 0
  return {
    pasos,
    avanzar: (n: number) => { pasos.push(n) },
    cancelado: () => { vueltas++; return cancelarEn >= 0 && vueltas > cancelarEn },
  }
}

describe('cola secuencial por lotes', () => {
  it('procesa todo en orden y cuenta los que salieron bien', async () => {
    const vistos: string[] = []
    const c = ctrl()
    const r = await correrCola(['a', 'b', 'c'], async (item) => {
      vistos.push(item)
      return item !== 'b'
    }, c)
    expect(vistos).toEqual(['a', 'b', 'c'])
    expect(r).toEqual({ ok: 2, hechos: 3, cancelado: false })
  })

  // Cancelar tiene que cortar la cola, no abortar lo ya hecho.
  it('al cancelar corta y devuelve lo procesado hasta ahí', async () => {
    const vistos: string[] = []
    const c = ctrl(2) // deja pasar dos comprobaciones y a la tercera cancela
    const r = await correrCola(['a', 'b', 'c', 'd'], async (item) => {
      vistos.push(item)
      return true
    }, c)
    expect(vistos).toEqual(['a', 'b'])
    expect(r).toEqual({ ok: 2, hechos: 2, cancelado: true })
  })

  it('informa la posición antes y después de cada elemento', async () => {
    const c = ctrl()
    await correrCola(['a', 'b'], async () => true, c)
    expect(c.pasos).toEqual([0, 1, 1, 2])
  })

  it('una lista vacía no revienta', async () => {
    const op = vi.fn()
    const r = await correrCola([], op as never, ctrl())
    expect(op).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: 0, hechos: 0, cancelado: false })
  })
})
