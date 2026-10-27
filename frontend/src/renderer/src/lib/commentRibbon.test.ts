import { describe, expect, it } from 'vitest'
import { MEASURE_FAMILY_IDS, ribbonForTool } from './commentRibbon'

describe('ribbonForTool', () => {
  it('medir y contar van a la pestaña Medir', () => {
    for (const id of [...MEASURE_FAMILY_IDS, 'count']) expect(ribbonForTool(id), id).toBe('measure')
  })
  it('el resto de las herramientas de marca, a Comentar', () => {
    for (const id of ['highlight', 'note', 'rect', 'cloud', 'stamp', 'select']) expect(ribbonForTool(id), id).toBe('comment')
  })
})
