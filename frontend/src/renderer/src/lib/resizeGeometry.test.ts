import { describe, it, expect } from 'vitest'
import { geometriaRedimensionada } from './resizeGeometry'
import { type Annotation } from '../store/usePdfStore'

const inicio = { x: 100, y: 100, w: 200, h: 100 }
const rect = (extra: Partial<Annotation> = {}): Annotation =>
  ({ id: 'r1', type: 'rect', page: 0, x: 100, y: 100, width: 200, height: 100, ...extra })

describe('geometría al redimensionar', () => {
  it('la esquina inferior derecha solo cambia el tamaño', () => {
    const g = geometriaRedimensionada(rect(), 'se', 50, 20, inicio)
    expect(g).toEqual({ x: 100, y: 100, width: 250, height: 120 })
  })

  it('la esquina superior izquierda mueve el origen', () => {
    const g = geometriaRedimensionada(rect(), 'nw', 50, 20, inicio)
    expect(g).toEqual({ x: 150, y: 120, width: 150, height: 80 })
  })

  it('los lados solo cambian su eje', () => {
    expect(geometriaRedimensionada(rect(), 'e', 30, 999, inicio)).toMatchObject({ width: 230, height: 100 })
    expect(geometriaRedimensionada(rect(), 'n', 999, 40, inicio)).toMatchObject({ width: 200, height: 60, y: 140 })
  })

  it('no baja del mínimo', () => {
    expect(geometriaRedimensionada(rect(), 'se', -999, -999, inicio)).toMatchObject({ width: 10, height: 10 })
  })

  it('un cuadro de texto tiene mínimo según el cuerpo de la letra', () => {
    const g = geometriaRedimensionada(rect({ type: 'text', fontSize: 20 }), 'se', -999, -999, inicio)
    expect(g).toMatchObject({ width: 50, height: 50 })
  })

  // Reglas que la copia de la página derecha no tenía.
  it('el círculo se mantiene circular en las esquinas', () => {
    const g = geometriaRedimensionada(rect({ type: 'circle' }), 'se', 0, 0, inicio)
    expect(g).toMatchObject({ width: 100, height: 100 })
  })

  it('la imagen mantiene su proporción en las esquinas y la pierde en los lados', () => {
    const img = rect({ type: 'image' })
    const esquina = geometriaRedimensionada(img, 'se', 100, 0, inicio)
    // Proporción de partida 200x100: al llevar el ancho a 300 el alto la sigue.
    expect(esquina).toMatchObject({ width: 200, height: 100 })
    const lado = geometriaRedimensionada(img, 'e', 100, 0, inicio)
    expect(lado).toMatchObject({ width: 300, height: 100 })
  })

  // Lo que ninguna de las dos copias hacía: escalar los puntos.
  describe('marcas dibujadas por puntos', () => {
    const poly = (): Annotation => ({
      id: 'p1', type: 'measure_area', page: 0, x: 100, y: 100,
      points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }],
    })

    it('duplicar el ancho duplica la separación horizontal de los puntos', () => {
      const g = geometriaRedimensionada(poly(), 'se', 200, 0, inicio)
      expect(g.points).toEqual([
        { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 200 },
      ])
      expect(g.width).toBeUndefined()
    })

    it('desde la esquina superior izquierda el ancla es la opuesta', () => {
      const g = geometriaRedimensionada(poly(), 'nw', 100, 50, inicio)
      // Caja nueva: x 200..300, y 150..200. El último punto (la esquina se) no se mueve.
      expect(g.points!.at(-1)).toEqual({ x: 300, y: 200 })
      expect(g.points![0]).toEqual({ x: 200, y: 150 })
    })

    it('`x/y` sigue al primer punto', () => {
      const g = geometriaRedimensionada(poly(), 'nw', 100, 50, inicio)
      expect([g.x, g.y]).toEqual([g.points![0].x, g.points![0].y])
    })

    it('una caja de partida degenerada (cota horizontal) no divide por cero', () => {
      const linea: Annotation = {
        id: 'l1', type: 'measure_perimeter', page: 0, x: 0, y: 50,
        points: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      }
      const g = geometriaRedimensionada(linea, 'e', 50, 0, { x: 0, y: 50, w: 100, h: 0 })
      expect(g.points!.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      expect(g.points!.at(-1)!.x).toBeCloseTo(150)
    })
  })
})
