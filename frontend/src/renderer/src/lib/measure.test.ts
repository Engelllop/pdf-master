import { describe, it, expect } from 'vitest'
import { measurementFor, polygonArea, polylineLength } from './measure'
import { type Annotation } from '../store/usePdfStore'

const escala = { pixelsPerUnit: 10, unit: 'm' }   // 10 px = 1 m

const dist = (): Annotation => ({
  id: 'd', type: 'measure_distance', page: 0, x: 0, y: 0, width: 30, height: 40, color: '#000',
})
const area = (): Annotation => ({
  id: 'a', type: 'measure_area', page: 0, x: 0, y: 0, color: '#000',
  points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
})

describe('geometría', () => {
  it('longitud de polilínea y área por zapatero', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 9 }])).toBe(10)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12)
  })
})

describe('recálculo de una medición', () => {
  it('distancia: 50 px con 10 px/m son 5 m', () => {
    expect(measurementFor(dist(), escala)).toEqual({ value: 5, unit: 'm', label: '5.00 m' })
  })

  it('área: el factor va al cuadrado', () => {
    // 200 px² / 10² = 2 m²
    expect(measurementFor(area(), escala)).toEqual({ value: 2, unit: 'm²', label: '2.00 m²' })
  })

  it('sin calibración se informa en píxeles', () => {
    expect(measurementFor(dist(), null)).toEqual({ value: 50, unit: 'px', label: '50.0 px' })
    expect(measurementFor(area(), null)?.label).toBe('Área no calibrada')
  })

  it('una marca que no es medición no se toca', () => {
    const rect: Annotation = { id: 'r', type: 'rect', page: 0, x: 0, y: 0, width: 10, height: 10, color: '#000' }
    expect(measurementFor(rect, escala)).toBeNull()
  })
})
