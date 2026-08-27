import { describe, it, expect } from 'vitest'
import { sinTildes, contieneSinTildes } from './texto'

describe('normalización para buscar', () => {
  it('quita tildes y baja a minúscula', () => {
    expect(sinTildes('Medición')).toBe('medicion')
    expect(sinTildes('INGENIERÍA')).toBe('ingenieria')
  })

  it('la eñe NO es una ene con tilde: sobrevive', () => {
    // U+00F1 se descompone en n + tilde combinante; borrar los diacríticos a ciegas
    // convertiría «Diseño» en «diseno» y una carpeta «Año 2026» dejaría de existir.
    expect(sinTildes('Diseño')).toBe('diseño')
  })

  it('encuentra escribiendo sin tildes y al revés', () => {
    expect(contieneSinTildes('C:/planos/Ingeniería/fachada.pdf', 'ingenieria')).toBe(true)
    expect(contieneSinTildes('C:/planos/Ingenieria/fachada.pdf', 'Ingeniería')).toBe(true)
    expect(contieneSinTildes('C:/planos/estructura.pdf', 'ingenieria')).toBe(false)
  })
})
