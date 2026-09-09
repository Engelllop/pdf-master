import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCommands, registerCommands, subscribeCommands, type Command } from './commands'

// El registro que alimenta la paleta (Ctrl+K). Es un módulo con estado global: si un
// `registerCommands` no avisa a los suscriptores, la paleta se queda con la lista de
// antes y ofrece acciones de un documento que ya se cerró.

const cmd = (id: string, over: Partial<Command> = {}): Command => ({
  id,
  label: id,
  group: 'Archivo',
  run: vi.fn(),
  ...over,
})

beforeEach(() => {
  registerCommands([])
})

describe('registro de comandos', () => {
  it('publica la lista y la devuelve tal cual', () => {
    const lista = [cmd('guardar'), cmd('imprimir')]
    registerCommands(lista)
    expect(getCommands()).toEqual(lista)
  })

  it('reemplaza la lista entera, no la acumula', () => {
    registerCommands([cmd('a'), cmd('b')])
    registerCommands([cmd('c')])
    expect(getCommands().map((c) => c.id)).toEqual(['c'])
  })
})

describe('suscripción', () => {
  it('avisa a cada suscriptor en cada publicación', () => {
    const uno = vi.fn()
    const dos = vi.fn()
    subscribeCommands(uno)
    subscribeCommands(dos)

    registerCommands([cmd('a')])
    expect(uno).toHaveBeenCalledTimes(1)
    expect(dos).toHaveBeenCalledTimes(1)

    registerCommands([cmd('b')])
    expect(uno).toHaveBeenCalledTimes(2)
  })

  it('el suscriptor ya ve la lista nueva cuando lo llaman', () => {
    let vistos: string[] = []
    subscribeCommands(() => { vistos = getCommands().map((c) => c.id) })
    registerCommands([cmd('nuevo')])
    expect(vistos).toEqual(['nuevo'])
  })

  it('la función que devuelve corta la suscripción', () => {
    const oyente = vi.fn()
    const cortar = subscribeCommands(oyente)
    cortar()
    registerCommands([cmd('a')])
    expect(oyente).not.toHaveBeenCalled()
  })

  it('darse de baja dos veces no revienta ni afecta a los demás', () => {
    const otro = vi.fn()
    const cortar = subscribeCommands(vi.fn())
    subscribeCommands(otro)
    cortar()
    cortar()
    registerCommands([cmd('a')])
    expect(otro).toHaveBeenCalledTimes(1)
  })

  it('el mismo oyente suscrito dos veces se llama una sola vez (es un Set)', () => {
    const oyente = vi.fn()
    subscribeCommands(oyente)
    subscribeCommands(oyente)
    registerCommands([cmd('a')])
    expect(oyente).toHaveBeenCalledTimes(1)
  })
})

describe('lo que la paleta necesita de cada comando', () => {
  it('conserva atajo y estado deshabilitado', () => {
    registerCommands([cmd('guardar', { shortcut: 'Ctrl+S', disabled: true, group: 'Archivo' })])
    const [c] = getCommands()
    expect(c.shortcut).toBe('Ctrl+S')
    expect(c.disabled).toBe(true)
    expect(c.group).toBe('Archivo')
  })

  it('`run` es la función que se publicó, sin envolverla', () => {
    const run = vi.fn()
    registerCommands([cmd('x', { run })])
    getCommands()[0].run()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
