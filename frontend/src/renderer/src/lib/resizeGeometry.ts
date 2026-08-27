import { type Annotation } from '../store/usePdfStore'

export type ResizeCorner = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Caja de la que se parte, en PUNTOS PDF (quien llama convierte desde px de bitmap). */
export interface CajaInicial {
  x: number
  y: number
  w: number
  h: number
}

const ESQUINAS: ReadonlyArray<ResizeCorner> = ['nw', 'ne', 'sw', 'se']

/**
 * Geometría resultante de arrastrar un tirador, en puntos PDF.
 *
 * Estaba escrita dos veces —`useAnnotationDrag` y `useRightPageResize`— y ya habían
 * derivado: la copia de la página derecha no tenía la regla del círculo perfecto, ni la
 * de proporción de las imágenes, ni el mínimo según el cuerpo de la letra. Y ninguna de
 * las dos tocaba los `points`, así que en un trazo, un polígono o una medición de área
 * el tirador movía la caja de selección y dejaba la forma quieta.
 */
export function geometriaRedimensionada(
  ann: Annotation,
  corner: ResizeCorner,
  dx: number,
  dy: number,
  inicio: CajaInicial,
): Partial<Annotation> {
  // Un cuadro de texto encogido a 10 pt deja de mostrar nada y parece que
  // «desapareció»: el mínimo depende del cuerpo de la letra.
  const fs = ann.fontSize || 14
  const MIN = (ann.type === 'text' || ann.type === 'callout') ? fs * 2.5 : 10

  let x = ann.x
  let y = ann.y
  let w = ann.width || 0
  let h = ann.height || 0

  switch (corner) {
    case 'se':
      w = Math.max(MIN, inicio.w + dx)
      h = Math.max(MIN, inicio.h + dy)
      break
    case 'nw':
      w = Math.max(MIN, inicio.w - dx)
      h = Math.max(MIN, inicio.h - dy)
      x = inicio.x + (inicio.w - w)
      y = inicio.y + (inicio.h - h)
      break
    case 'ne':
      w = Math.max(MIN, inicio.w + dx)
      h = Math.max(MIN, inicio.h - dy)
      y = inicio.y + (inicio.h - h)
      break
    case 'sw':
      w = Math.max(MIN, inicio.w - dx)
      h = Math.max(MIN, inicio.h + dy)
      x = inicio.x + (inicio.w - w)
      break
    case 'n':
      h = Math.max(MIN, inicio.h - dy)
      y = inicio.y + (inicio.h - h)
      break
    case 's':
      h = Math.max(MIN, inicio.h + dy)
      break
    case 'e':
      w = Math.max(MIN, inicio.w + dx)
      break
    case 'w':
      w = Math.max(MIN, inicio.w - dx)
      x = inicio.x + (inicio.w - w)
      break
  }

  const esEsquina = ESQUINAS.includes(corner)

  // El círculo se mantiene circular al arrastrar una esquina.
  if (ann.type === 'circle' && esEsquina) {
    const lado = Math.min(w, h)
    w = lado
    h = lado
  }

  // Las esquinas de una imagen mantienen su proporción (los lados siguen libres):
  // arrastrar la esquina la deformaba y no había vuelta atrás.
  if (ann.type === 'image' && esEsquina && inicio.w > 0 && inicio.h > 0) {
    const ratio = inicio.h / inicio.w
    if (w * ratio > h) w = h / ratio
    else h = w * ratio
    if (corner === 'nw' || corner === 'sw') x = inicio.x + (inicio.w - w)
    if (corner === 'nw' || corner === 'ne') y = inicio.y + (inicio.h - h)
  }

  // Las marcas que se dibujan desde sus puntos (trazo, polígono, área, perímetro,
  // firma) no tienen ancho/alto: se escalan los puntos dentro de la caja nueva. `x/y`
  // sigue siendo el primer punto, como al crearlas.
  if (ann.points?.length) {
    const fx = inicio.w > 0 ? w / inicio.w : 1
    const fy = inicio.h > 0 ? h / inicio.h : 1
    const points = ann.points.map((p) => ({
      x: x + (p.x - inicio.x) * fx,
      y: y + (p.y - inicio.y) * fy,
    }))
    return { x: points[0].x, y: points[0].y, points }
  }

  return { x, y, width: w, height: h }
}
