import { describe, it, expect } from 'vitest'
import { createAiStreamParser } from './aiStream'

const sse = (obj: object) => `event: x\ndata: ${JSON.stringify(obj)}\n\n`
const texto = (t: string) => sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })

describe('stream SSE de la API', () => {
  it('devuelve el texto de los deltas en orden', () => {
    const parse = createAiStreamParser()
    const evs = parse(texto('Hola') + texto(' mundo'))
    expect(evs).toEqual([{ kind: 'text', text: 'Hola' }, { kind: 'text', text: ' mundo' }])
  })

  // Los chunks TCP no respetan los límites de línea: un evento puede llegar partido
  // por la mitad y el resto en el chunk siguiente.
  it('reensambla un evento partido entre dos chunks', () => {
    const parse = createAiStreamParser()
    const entero = texto('completo')
    const corte = Math.floor(entero.length / 2)
    expect(parse(entero.slice(0, corte))).toEqual([])
    expect(parse(entero.slice(corte))).toEqual([{ kind: 'text', text: 'completo' }])
  })

  it('reconoce el corte por longitud', () => {
    const parse = createAiStreamParser()
    const evs = parse(sse({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }))
    expect(evs).toEqual([{ kind: 'stop', reason: 'max_tokens' }])
  })

  it('un error de la API llega como evento de error', () => {
    const parse = createAiStreamParser()
    expect(parse(sse({ type: 'error', error: { message: 'overloaded' } })))
      .toEqual([{ kind: 'error', message: 'overloaded' }])
  })

  // Antes, una línea que no parseaba abortaba la respuesta entera con un error
  // técnico; el usuario perdía todo lo que ya había llegado.
  it('salta una línea corrupta sin tirar el resto', () => {
    const parse = createAiStreamParser()
    const evs = parse('data: {no es json\n' + texto('sigue'))
    expect(evs).toEqual([{ kind: 'text', text: 'sigue' }])
  })

  it('ignora los pings y los eventos que no interesan', () => {
    const parse = createAiStreamParser()
    expect(parse(sse({ type: 'ping' }) + sse({ type: 'content_block_start' }) + 'data: [DONE]\n\n')).toEqual([])
  })
})
