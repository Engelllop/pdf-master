import { describe, it, expect } from 'vitest'
import { addStamp, loadStamps, removeStamp, renderStampText } from './stamps'

describe('sellos personalizados', () => {
  it('crea, lista y elimina', () => {
    const s = addStamp({ text: 'PARA OBRA', color: '#22c55e' })
    expect(loadStamps().map((x) => x.text)).toEqual(['PARA OBRA'])
    removeStamp(s.id)
    expect(loadStamps()).toEqual([])
  })

  it('compone el texto con autor y fecha en MM/DD/YYYY', () => {
    const base = { id: 's', text: 'REVISADO', color: '#000' }
    expect(renderStampText(base, 'Engell')).toBe('REVISADO')
    expect(renderStampText({ ...base, withAuthor: true }, 'Engell')).toBe('REVISADO · Engell')
    const withDate = renderStampText({ ...base, withDate: true }, '')
    expect(withDate).toMatch(/^REVISADO · \d{2}\/\d{2}\/\d{4}$/)
  })

  it('sin autor configurado no añade el separador vacío', () => {
    expect(renderStampText({ id: 's', text: 'COPIA', color: '#000', withAuthor: true }, '')).toBe('COPIA')
  })

  it('al llegar al tope, el sello nuevo entra y se cae el más viejo', () => {
    for (let i = 0; i < 30; i++) addStamp({ text: `SELLO-${i}`, color: '#000000' })
    const creado = addStamp({ text: 'EL-NUEVO', color: '#000000' })

    const guardados = loadStamps()
    expect(guardados).toHaveLength(30)
    expect(guardados.map((s) => s.text)).toContain('EL-NUEVO')
    expect(guardados.some((s) => s.id === creado.id)).toBe(true)
    expect(guardados.map((s) => s.text)).not.toContain('SELLO-0')
  })
})
