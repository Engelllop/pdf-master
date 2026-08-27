import { describe, it, expect, beforeEach } from 'vitest'
import { setWindowDirty, isWindowDirty, forgetWindow, dirtyWindowCount } from './dirtyWindows'

beforeEach(() => {
  forgetWindow(1)
  forgetWindow(2)
})

// La bandera de «cambios sin guardar» era una sola para toda la app, y la app abre
// varias ventanas. Escenario que costaba trabajo: se marca un plano en la ventana 1,
// se abre una ventana nueva (limpia) y al cerrar la 1 ya no se preguntaba nada.
describe('cambios sin guardar por ventana', () => {
  it('una ventana limpia no apaga el aviso de otra sucia', () => {
    setWindowDirty(1, true)
    setWindowDirty(2, false)
    expect(isWindowDirty(1)).toBe(true)
    expect(isWindowDirty(2)).toBe(false)
  })

  it('«cerrar sin guardar» en una ventana no toca a las demás', () => {
    setWindowDirty(1, true)
    setWindowDirty(2, true)
    setWindowDirty(2, false)
    expect(isWindowDirty(1)).toBe(true)
  })

  it('una ventana desconocida no está sucia', () => {
    expect(isWindowDirty(99)).toBe(false)
  })

  it('al cerrarse la ventana se olvida su estado', () => {
    setWindowDirty(1, true)
    forgetWindow(1)
    expect(isWindowDirty(1)).toBe(false)
  })

  it('cuenta cuántas ventanas tienen trabajo sin guardar', () => {
    expect(dirtyWindowCount()).toBe(0)
    setWindowDirty(1, true)
    setWindowDirty(2, true)
    expect(dirtyWindowCount()).toBe(2)
    setWindowDirty(2, false)
    expect(dirtyWindowCount()).toBe(1)
  })
})
