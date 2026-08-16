import { describe, expect, it } from 'vitest'
import {
  DRAW_FAMILY_IDS, MEASURE_FAMILY_IDS, MORE_TOOL_IDS, PRIMARY_MARK_IDS,
  isDrawFamily, isMeasureFamily, isMoreTool,
} from './commentRibbon'

const LEGACY_COMMENT = [
  'select', 'textselect', 'highlight', 'underline', 'strikethrough', 'note',
  'draw', 'signature', 'text', 'stamp', 'count',
  'measure_calibrate', 'measure_distance', 'measure_perimeter', 'measure_area',
]
const LEGACY_SHAPES = [
  'rect', 'circle', 'line', 'arrow', 'callout', 'check', 'cross', 'star', 'cloud', 'polygon',
]

describe('commentRibbon', () => {
  it('deja 2 marcas primarias + 2 familias (dibujar / medir)', () => {
    expect([...PRIMARY_MARK_IDS]).toEqual(['highlight', 'note'])
    expect(DRAW_FAMILY_IDS[0]).toBe('draw')
    expect(MEASURE_FAMILY_IDS[0]).toBe('measure_distance')
  })

  it('no pierde ninguna herramienta de la cinta vieja (salvo Seleccionar, que queda como icono)', () => {
    const grouped = new Set<string>([
      ...PRIMARY_MARK_IDS, ...DRAW_FAMILY_IDS, ...MEASURE_FAMILY_IDS, ...MORE_TOOL_IDS,
    ])
    for (const id of [...LEGACY_COMMENT, ...LEGACY_SHAPES]) {
      if (id === 'select') continue
      expect(grouped.has(id), id).toBe(true)
    }
  })

  it('clasifica sin solaparse', () => {
    expect(isDrawFamily('rect')).toBe(true)
    expect(isMeasureFamily('measure_area')).toBe(true)
    expect(isMoreTool('count')).toBe(true)
    expect(isDrawFamily('highlight')).toBe(false)
    expect(isMoreTool('draw')).toBe(false)
  })
})
