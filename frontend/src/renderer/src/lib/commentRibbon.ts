/** IA de la cinta Comentar: 4 marcas diarias visibles, el resto en menús. */

export const PRIMARY_MARK_IDS = ['highlight', 'note'] as const

export const DRAW_FAMILY_IDS = [
  'draw', 'signature',
  'line', 'arrow', 'rect', 'circle', 'polygon',
  'callout', 'check', 'cross', 'star', 'cloud',
] as const

export const MEASURE_FAMILY_IDS = [
  'measure_distance', 'measure_perimeter', 'measure_area', 'measure_calibrate',
] as const

export const MORE_TOOL_IDS = [
  'textselect', 'underline', 'strikethrough', 'text', 'stamp', 'count',
] as const

const DRAW_SET = new Set<string>(DRAW_FAMILY_IDS)
const MEASURE_SET = new Set<string>(MEASURE_FAMILY_IDS)
const MORE_SET = new Set<string>(MORE_TOOL_IDS)

export function isDrawFamily(id: string | null | undefined): boolean {
  return !!id && DRAW_SET.has(id)
}

export function isMeasureFamily(id: string | null | undefined): boolean {
  return !!id && MEASURE_SET.has(id)
}

export function isMoreTool(id: string | null | undefined): boolean {
  return !!id && MORE_SET.has(id)
}
