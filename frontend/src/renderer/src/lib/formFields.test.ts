import { describe, it, expect } from 'vitest'
import { isFormTool } from './formFields'

describe('isFormTool', () => {
  it('reconoce las herramientas de campo', () => {
    expect(isFormTool('formtext')).toBe(true)
    expect(isFormTool('formcheck')).toBe(true)
    expect(isFormTool('formradio')).toBe(true)
    expect(isFormTool('formcombo')).toBe(true)
  })

  it('rechaza el resto', () => {
    expect(isFormTool('text')).toBe(false)
    expect(isFormTool('croparea')).toBe(false)
    expect(isFormTool(null)).toBe(false)
  })
})
