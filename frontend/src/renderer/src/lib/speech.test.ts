import { describe, it, expect } from 'vitest'
import { trocearParaVoz } from './speech'

describe('troceo para la lectura en voz alta', () => {
  it('parte por frases y ninguna supera el tope', () => {
    const texto = 'Planta baja. Escala 1:100. Revisar niveles antes de imprimir. Nivel de piso terminado.'
    const trozos = trocearParaVoz(texto, 40)
    expect(trozos.length).toBeGreaterThan(1)
    trozos.forEach((t) => expect(t.length).toBeLessThanOrEqual(40))
    expect(trozos.join(' ')).toContain('Planta baja.')
    expect(trozos.join(' ')).toContain('Nivel de piso terminado.')
  })

  it('parte también un bloque sin puntuación (rótulo de plano)', () => {
    const trozos = trocearParaVoz('A'.repeat(50) + ' ' + 'B'.repeat(50) + ' ' + 'C'.repeat(50), 60)
    expect(trozos.length).toBe(3)
    trozos.forEach((t) => expect(t.length).toBeLessThanOrEqual(60))
  })

  it('un texto corto queda en un solo trozo y uno vacío en ninguno', () => {
    expect(trocearParaVoz('Hola.')).toEqual(['Hola.'])
    expect(trocearParaVoz('   ')).toEqual([])
  })
})
