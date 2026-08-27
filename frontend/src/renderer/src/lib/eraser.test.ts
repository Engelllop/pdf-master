import { describe, it, expect } from 'vitest'
import { aplicarBorrador, marcasBajoBorrador, recortarPolilinea, type Punto } from './eraser'
import { type Annotation } from '../store/usePdfStore'

// Página 1:1 con la pantalla: así el test habla en las mismas unidades que el pincel.
const toScreen = (x: number, y: number) => ({ x, y })
const bounds = (a: Annotation) => {
  if (a.points?.length) {
    const xs = a.points.map((p) => p.x)
    const ys = a.points.map((p) => p.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  return { x: a.x, y: a.y, w: a.width || 0, h: a.height || 0 }
}
const correr = (anns: Annotation[], x: number, y: number, r: number) =>
  marcasBajoBorrador(anns, { x, y }, r, bounds, toScreen)

const rect = (id: string, x: number, y: number): Annotation =>
  ({ id, type: 'rect', page: 0, x, y, width: 20, height: 10 }) as Annotation

describe('marcasBajoBorrador', () => {
  it('quita la marca que toca el pincel y deja las de al lado', () => {
    const anns = [rect('a', 10, 10), rect('b', 70, 70)]
    expect(correr(anns, 15, 15, 8)).toEqual(['a'])
  })

  it('no toca nada si el círculo pasa cerca pero no llega', () => {
    expect(correr([rect('a', 10, 10)], 50, 50, 8)).toEqual([])
  })

  it('un pincel grande se lleva varias marcas de una pasada', () => {
    const anns = [rect('a', 10, 10), rect('b', 40, 10)]
    expect(correr(anns, 35, 15, 30).sort()).toEqual(['a', 'b'])
  })

  it('en un dibujo sigue el trazo, no su caja', () => {
    // Diagonal de (0,0) a (100,100): el hueco de arriba a la derecha está DENTRO de
    // la caja pero lejísimos de la línea. Con la caja sola, borrar ahí lo mataría.
    const trazo = {
      id: 'trazo', type: 'draw', page: 0, x: 0, y: 0,
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    } as Annotation
    expect(correr([trazo], 90, 10, 10)).toEqual([])
    expect(correr([trazo], 52, 48, 10)).toEqual(['trazo'])
  })

  it('una línea horizontal se borra pese a tener alto 0', () => {
    const linea = { id: 'l', type: 'line', page: 0, x: 10, y: 50, width: 60, height: 0 } as Annotation
    expect(correr([linea], 40, 52, 6)).toEqual(['l'])
    expect(correr([linea], 40, 80, 6)).toEqual([])
  })

  it('un polígono se borra también por el lado que cierra la figura', () => {
    const poly = {
      id: 'p', type: 'polygon', page: 0, x: 0, y: 0,
      points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }],
    } as Annotation
    // Punto medio del lado de cierre (90,90)→(10,10): solo existe si se cierra el bucle.
    expect(correr([poly], 50, 50, 6)).toEqual(['p'])
  })
})

describe('recortarPolilinea', () => {
  const largo = (t: Punto[]) => t.reduce((s, p, i) => i === 0 ? 0 : s + Math.hypot(p.x - t[i - 1].x, p.y - t[i - 1].y), 0)

  it('un corte en medio deja DOS trozos, no uno', () => {
    const linea = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const trozos = recortarPolilinea(linea, { x: 50, y: 0 }, 10)
    expect(trozos).toHaveLength(2)
    // El corte cae en el filo del círculo, no en el vértice más cercano.
    expect(trozos[0][1].x).toBeCloseTo(40)
    expect(trozos[1][0].x).toBeCloseTo(60)
  })

  it('borrar una punta acorta el trazo en vez de partirlo', () => {
    const linea = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const trozos = recortarPolilinea(linea, { x: 100, y: 0 }, 20)
    expect(trozos).toHaveLength(1)
    expect(largo(trozos[0])).toBeCloseTo(80)
  })

  it('un pincel que cubre todo el trazo no deja nada', () => {
    const linea = [{ x: 45, y: 45 }, { x: 55, y: 55 }]
    expect(recortarPolilinea(linea, { x: 50, y: 50 }, 40)).toEqual([])
  })

  it('pasar por el aire no toca el trazo', () => {
    const linea = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const trozos = recortarPolilinea(linea, { x: 50, y: 90 }, 10)
    expect(trozos).toHaveLength(1)
    expect(largo(trozos[0])).toBeCloseTo(100)
  })

  it('en un trazo denso el corte respeta los vértices de fuera', () => {
    const pts = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 0 }))
    const trozos = recortarPolilinea(pts, { x: 50, y: 0 }, 12)
    expect(trozos).toHaveLength(2)
    expect(trozos[0].every((p) => p.x <= 38.1)).toBe(true)
    expect(trozos[1].every((p) => p.x >= 61.9)).toBe(true)
  })
})

describe('aplicarBorrador', () => {
  const pageData = { width: 100, height: 100, originalWidth: 100, originalHeight: 100 }
  const trazo = (id: string): Annotation =>
    ({ id, type: 'draw', page: 0, x: 0, y: 0, color: '#f00', lineWidth: 3, points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] }) as Annotation
  const base = (extra: Partial<Parameters<typeof aplicarBorrador>[0]> = {}) => aplicarBorrador({
    todas: [trazo('t')], visibles: [trazo('t')],
    punto: { x: 50, y: 50 }, radio: 10, modo: 'partial',
    pageData, boundsOf: bounds, toScreen, nuevoId: () => 'nuevo',
    ...extra,
  })

  it('en modo trazo corta el dibujo y conserva su estilo', () => {
    const res = base()!
    expect(res).toHaveLength(2)
    expect(res.map((a) => a.id)).toEqual(['t', 'nuevo'])
    expect(res.every((a) => a.color === '#f00' && a.lineWidth === 3)).toBe(true)
    // `x`/`y` acompañan al trozo: mover la marca desplaza x/y y los puntos a la vez.
    expect(res[1].x).toBeCloseTo(res[1].points![0].x)
  })

  it('en modo marca entera se lleva el dibujo completo', () => {
    expect(base({ modo: 'whole' })).toEqual([])
  })

  it('una cota NO se corta: recortarla cambiaría la medida en silencio', () => {
    const cota = { id: 'c', type: 'measure_perimeter', page: 0, x: 0, y: 0, points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] } as Annotation
    expect(base({ todas: [cota], visibles: [cota] })).toEqual([])
  })

  it('si el pincel no toca nada devuelve null (no re-renderiza)', () => {
    expect(base({ punto: { x: 50, y: 5 } })).toBeNull()
  })
})
