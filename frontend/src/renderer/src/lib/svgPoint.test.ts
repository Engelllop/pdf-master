import { describe, expect, it } from 'vitest'
import { localPointFromClient } from './svgPoint'

// La conversión que comparten los CUATRO hooks de gesto (arrastrar, redimensionar,
// girar, la página derecha) y la capa de texto: si esto se desvía, todos los gestos
// se desvían con ella. No tenía test.

const elemento = (rect: Partial<DOMRect>) => ({
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect,
})

describe('posición del ratón en unidades locales de la página', () => {
  it('sin escalado devuelve la posición relativa al elemento', () => {
    const el = elemento({ left: 100, top: 50, width: 1000 })
    expect(localPointFromClient(el, 300, 250, 1000)).toEqual({ x: 200, y: 200 })
  })

  it('la página mostrada a la mitad: 100 px de pantalla son 200 del bitmap', () => {
    // El caso normal: el bitmap se rasteriza a pasos de 0.5 y el zoom de la vista
    // casi nunca cae justo ahí, así que se muestra escalado.
    const el = elemento({ left: 0, top: 0, width: 500 })
    expect(localPointFromClient(el, 100, 50, 1000)).toEqual({ x: 200, y: 100 })
  })

  it('la página mostrada al doble: 200 px de pantalla son 100 del bitmap', () => {
    const el = elemento({ left: 0, top: 0, width: 2000 })
    expect(localPointFromClient(el, 200, 100, 1000)).toEqual({ x: 100, y: 50 })
  })

  it('descuenta el desplazamiento ANTES de des-escalar, no después', () => {
    // Al revés (dividir y luego restar) el error crece con el scroll de la página, y
    // era justo el salto que se veía al empezar a mover una marca.
    const el = elemento({ left: 250, top: 125, width: 500 })
    expect(localPointFromClient(el, 350, 175, 1000)).toEqual({ x: 200, y: 100 })
  })

  it('un elemento sin ancho medido no divide por cero', () => {
    // Pasa entre el montaje y el primer layout: sin la guarda salía NaN y la marca
    // se iba a una posición imposible.
    const el = elemento({ left: 10, top: 10, width: 0 })
    expect(localPointFromClient(el, 60, 40, 1000)).toEqual({ x: 50, y: 30 })
  })

  it('un ancho local de cero tampoco', () => {
    const el = elemento({ left: 0, top: 0, width: 800 })
    expect(localPointFromClient(el, 100, 100, 0)).toEqual({ x: 100, y: 100 })
  })

  it('coordenadas negativas (ratón arriba o a la izquierda del elemento)', () => {
    // Arrastrar fuera de la página es normal: los listeners viven en `window`.
    const el = elemento({ left: 200, top: 100, width: 500 })
    expect(localPointFromClient(el, 100, 50, 1000)).toEqual({ x: -200, y: -100 })
  })

  it('es lineal: dos puntos separados 50 en pantalla quedan separados 100 al 0.5×', () => {
    const el = elemento({ left: 37, top: 91, width: 500 })
    const a = localPointFromClient(el, 200, 200, 1000)
    const b = localPointFromClient(el, 250, 200, 1000)
    expect(b.x - a.x).toBeCloseTo(100, 10)
  })
})
