import { type Annotation } from '../store/usePdfStore'

export interface Scale { pixelsPerUnit: number; unit: string }
export type Point = { x: number; y: number }

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

/** Área del polígono cerrado (fórmula del zapatero). */
export function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

export function formatDistance(value: number, unit: string): string {
  if (value >= 1000 && unit === 'm') return `${(value / 1000).toFixed(2)} km`
  if (value >= 100 && unit === 'cm') return `${(value / 100).toFixed(2)} m`
  if (value < 1 && unit === 'm') return `${(value * 100).toFixed(1)} cm`
  return `${value.toFixed(2)} ${unit}`
}

/** Longitud o área de la marca EN PÍXELES del PDF, a partir de su geometría. Es el
 * dato crudo: lo que no depende de la calibración. */
export function pixelsOf(ann: Annotation): number | null {
  if (ann.type === 'measure_distance') {
    return distance({ x: ann.x, y: ann.y }, { x: ann.x + (ann.width || 0), y: ann.y + (ann.height || 0) })
  }
  if (ann.type === 'measure_perimeter') return ann.points ? polylineLength(ann.points) : null
  if (ann.type === 'measure_area') return ann.points ? polygonArea(ann.points) : null
  return null
}

/** Recalcula la medición de una marca con la escala dada. Devuelve `null` si la marca
 * no es una medición o le falta la geometría. */
export function measurementFor(ann: Annotation, scale: Scale | null): Annotation['measurement'] | null {
  const px = pixelsOf(ann)
  if (px === null) return null
  const esArea = ann.type === 'measure_area'
  if (!scale || scale.pixelsPerUnit <= 0) {
    return esArea
      ? { value: px, unit: 'px²', label: 'Área no calibrada' }
      : { value: px, unit: 'px', label: `${px.toFixed(1)} px` }
  }
  if (esArea) {
    const value = px / (scale.pixelsPerUnit * scale.pixelsPerUnit)
    return { value, unit: `${scale.unit}²`, label: `${value.toFixed(2)} ${scale.unit}²` }
  }
  const value = px / scale.pixelsPerUnit
  return { value, unit: scale.unit, label: formatDistance(value, scale.unit) }
}
