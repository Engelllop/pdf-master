import { describe, it, expect, beforeEach } from 'vitest'
import { loadSignatures, renameSignature, removeSignature, signatureAtPoint } from './signatures'

const sig = {
  id: 's1',
  name: 'Engell',
  points: [{ x: 100, y: 50 }, { x: 200, y: 80 }, { x: 300, y: 50 }],
}

beforeEach(() => {
  localStorage.setItem('pdfmaster_signatures', JSON.stringify([sig]))
})

describe('firmas guardadas', () => {
  it('descarta entradas corruptas al cargar', () => {
    localStorage.setItem('pdfmaster_signatures', JSON.stringify([sig, { id: 'x' }, null]))
    expect(loadSignatures()).toHaveLength(1)
  })

  it('renombra y elimina', () => {
    renameSignature('s1', 'Firma obra')
    expect(loadSignatures()[0].name).toBe('Firma obra')
    removeSignature('s1')
    expect(loadSignatures()).toEqual([])
  })

  it('reescala la firma al punto de colocación conservando la proporción', () => {
    const placed = signatureAtPoint(sig, { x: 400, y: 700 }, 100)
    // El ancho original es 200 pt → escala 0.5
    expect(placed[0]).toEqual({ x: 400, y: 700 })
    expect(placed[2].x).toBe(500)
    expect(placed[1]).toEqual({ x: 450, y: 715 })
  })
})
