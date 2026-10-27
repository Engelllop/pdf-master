import { describe, it, expect } from 'vitest'
import { describirPapel } from './paperSize'

describe('describirPapel', () => {
  it('reconoce los formatos de plano y respeta la orientación', () => {
    expect(describirPapel(2592, 1728)).toBe('ARCH D · 36 × 24 in')
    expect(describirPapel(1728, 2592)).toBe('ARCH D · 24 × 36 in')
  })
  it('reconoce carta e ISO', () => {
    expect(describirPapel(612, 792)).toBe('Carta · 8.5 × 11 in')
    expect(describirPapel(595.3, 841.9)).toBe('A4 · 210 × 297 mm')
  })
  it('un tamaño libre sale en pulgadas', () => {
    expect(describirPapel(700, 500)).toBe('9.7 × 6.9 in')
  })
  it('sin tamaño no dice nada', () => {
    expect(describirPapel(0, 0)).toBe('')
  })
})
