/** A qué pestaña de la cinta pertenece cada herramienta. */

export const MEASURE_FAMILY_IDS = [
  'measure_distance', 'measure_perimeter', 'measure_area', 'measure_calibrate',
] as const

const MEASURE_TAB_SET = new Set<string>([...MEASURE_FAMILY_IDS, 'count'])

/** La pestaña de la cinta donde vive una herramienta: medir y contar tienen la suya. */
export function ribbonForTool(id: string): 'measure' | 'comment' {
  return MEASURE_TAB_SET.has(id) ? 'measure' : 'comment'
}
