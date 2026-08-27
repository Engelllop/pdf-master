import { describe, it, expect } from 'vitest'
import { ajustarEscalaHorizontal, type SpanAjustable } from './textLayerFit'

// Registra el orden real de operaciones: lo que importa no es solo el resultado, es
// que no se vuelva a intercalar escritura → medición → escritura (cada medición
// después de una escritura fuerza un reflow sincrónico de la capa entera).
function espia(anchos: number[], objetivos: (number | undefined)[]) {
  const orden: string[] = []
  const spans: SpanAjustable[] = anchos.map((ancho, i) => ({
    dataset: { w: objetivos[i] === undefined ? undefined : String(objetivos[i]) },
    _transform: '',
    get style() {
      const self = this as unknown as { _transform: string }
      return {
        get transform() { return self._transform },
        set transform(v: string) {
          orden.push(v === '' ? `limpia:${i}` : `escala:${i}`)
          self._transform = v
        },
      }
    },
    getBoundingClientRect: () => { orden.push(`mide:${i}`); return { width: ancho } },
  }) as unknown as SpanAjustable)
  return { spans, orden }
}

describe('ajuste horizontal de la capa de texto', () => {
  it('agrupa las escrituras y luego las mediciones: un reflow, no uno por span', () => {
    const { spans, orden } = espia([50, 80, 40], [100, 40, 40])
    ajustarEscalaHorizontal(spans, 1)
    const primeraMedicion = orden.findIndex((o) => o.startsWith('mide'))
    const ultimaMedicion = orden.map((o) => o.startsWith('mide')).lastIndexOf(true)
    const primeraEscala = orden.findIndex((o) => o.startsWith('escala'))
    // Ninguna escritura de escala antes de terminar de medir…
    expect(primeraEscala).toBeGreaterThan(ultimaMedicion)
    // …y ninguna limpieza después de empezar a medir.
    expect(orden.slice(primeraMedicion).some((o) => o.startsWith('limpia'))).toBe(false)
  })

  it('corrige cada span al ancho que le toca', () => {
    const { spans } = espia([50, 80], [100, 40])
    ajustarEscalaHorizontal(spans, 1)
    expect(spans[0].style.transform).toBe('scaleX(2)')
    expect(spans[1].style.transform).toBe('scaleX(0.5)')
  })

  it('compensa el transform del ancestro para medir en px de layout', () => {
    const { spans } = espia([100], [100])
    ajustarEscalaHorizontal(spans, 2) // el ancestro está al 200 %
    expect(spans[0].style.transform).toBe('scaleX(2)')
  })

  it('un span sin ancho objetivo o medido en cero queda sin transform', () => {
    const { spans } = espia([50, 0], [undefined, 30])
    ajustarEscalaHorizontal(spans, 1)
    expect(spans[0].style.transform).toBe('')
    expect(spans[1].style.transform).toBe('')
  })

  it('sin spans no toca nada', () => {
    const { orden } = espia([], [])
    ajustarEscalaHorizontal([], 1)
    expect(orden).toEqual([])
  })
})
