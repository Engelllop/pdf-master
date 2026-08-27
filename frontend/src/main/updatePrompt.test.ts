import { describe, it, expect } from 'vitest'
import { avisoActualizacionLista, respuestaEsReiniciar } from './updatePrompt'

describe('aviso de actualización lista', () => {
  it('sin cambios sin guardar, reiniciar es el botón por omisión', () => {
    const a = avisoActualizacionLista('1.16.0', 0)
    expect(a.buttons[a.defaultId]).toBe('Reiniciar ahora')
    expect(respuestaEsReiniciar(0, 0)).toBe(true)
    expect(respuestaEsReiniciar(1, 0)).toBe(false)
  })

  // El aviso salta encima de lo que el usuario esté haciendo. Con un plano marcado a
  // medias, el botón por omisión (Enter) y el de Esc no pueden ser el que pierde todo.
  it('con cambios sin guardar, el botón seguro es el por omisión y el de Esc', () => {
    const a = avisoActualizacionLista('1.16.0', 1)
    expect(a.type).toBe('warning')
    expect(a.buttons[a.defaultId]).toBe('Más tarde')
    expect(a.buttons[a.cancelId]).toBe('Más tarde')
    expect(a.detail).toContain('se pierden')
  })

  it('reiniciar exige el botón explícito, cuyo índice cambia con el juego de botones', () => {
    expect(respuestaEsReiniciar(0, 1)).toBe(false)
    expect(respuestaEsReiniciar(1, 1)).toBe(true)
  })

  it('con varias ventanas sucias lo dice en plural', () => {
    expect(avisoActualizacionLista('1.16.0', 3).detail).toContain('3 ventanas')
  })
})
