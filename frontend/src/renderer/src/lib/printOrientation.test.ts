import { describe, it, expect } from 'vitest'
import { esApaisado, type TamanoPagina } from './printOrientation'

const pagina = (page_num: number, width: number, height: number): TamanoPagina =>
  ({ page_num, width, height })

// Electron imprime en vertical si no se le dice otra cosa: un juego de láminas
// apaisadas salía girado y encogido a una esquina del papel.
describe('orientación de lo que se imprime', () => {
  it('láminas apaisadas → apaisado', () => {
    expect(esApaisado([pagina(0, 2592, 1728), pagina(1, 2592, 1728)])).toBe(true)
  })

  it('un informe vertical → vertical', () => {
    expect(esApaisado([pagina(0, 595, 842), pagina(1, 595, 842)])).toBe(false)
  })

  it('un juego mezclado va por mayoría', () => {
    const mezcla = [pagina(0, 595, 842), pagina(1, 2592, 1728), pagina(2, 2592, 1728)]
    expect(esApaisado(mezcla)).toBe(true)
    expect(esApaisado([pagina(0, 595, 842), pagina(1, 595, 842), pagina(2, 2592, 1728)])).toBe(false)
  })

  // Extraer las dos láminas apaisadas de un informe vertical tiene que salir apaisado.
  it('decide con las páginas que se imprimen, no con el documento', () => {
    const doc = [
      pagina(0, 595, 842), pagina(1, 595, 842), pagina(2, 595, 842),
      pagina(3, 2592, 1728), pagina(4, 2592, 1728),
    ]
    expect(esApaisado(doc)).toBe(false)
    expect(esApaisado(doc, [3, 4])).toBe(true)
    expect(esApaisado(doc, [0])).toBe(false)
  })

  it('empate → vertical, que es lo que hacía antes', () => {
    expect(esApaisado([pagina(0, 595, 842), pagina(1, 842, 595)])).toBe(false)
  })

  it('sin nada que medir → vertical', () => {
    expect(esApaisado([])).toBe(false)
    expect(esApaisado([pagina(0, 0, 0)])).toBe(false)
    expect(esApaisado([pagina(0, 2592, 1728)], [])).toBe(true) // lista vacía = todo el doc
  })

  it('una página cuadrada no cuenta como apaisada', () => {
    expect(esApaisado([pagina(0, 600, 600)])).toBe(false)
  })
})
