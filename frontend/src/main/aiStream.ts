/**
 * Parseo del stream SSE de la API de mensajes de Anthropic.
 *
 * Vive aparte de `index.ts` para poder probarlo: era el trozo más delicado del
 * proceso principal (líneas partidas entre chunks TCP, JSON a medias) y no tenía
 * ninguna cobertura.
 */
export type AiStreamEvent =
  | { kind: 'text'; text: string }
  | { kind: 'stop'; reason: string }
  | { kind: 'error'; message: string }

export function createAiStreamParser(): (chunk: string) => AiStreamEvent[] {
  let pendiente = ''

  return function parse(chunk: string): AiStreamEvent[] {
    pendiente += chunk
    const lineas = pendiente.split('\n')
    // La última puede venir cortada a la mitad: se guarda para el chunk siguiente.
    pendiente = lineas.pop() ?? ''

    const eventos: AiStreamEvent[] = []
    for (const linea of lineas) {
      const t = linea.trim()
      if (!t.startsWith('data:')) continue
      const data = t.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let ev: Record<string, unknown>
      try {
        ev = JSON.parse(data)
      } catch {
        // Una línea que no parsea significa que la partimos mal. Antes esto abortaba
        // la respuesta entera; saltarla deja al usuario con lo que sí llegó.
        continue
      }
      const delta = ev.delta as Record<string, unknown> | undefined
      if (ev.type === 'content_block_delta' && delta?.type === 'text_delta') {
        eventos.push({ kind: 'text', text: String(delta.text ?? '') })
      } else if (ev.type === 'message_delta' && typeof delta?.stop_reason === 'string') {
        eventos.push({ kind: 'stop', reason: delta.stop_reason })
      } else if (ev.type === 'error') {
        const err = ev.error as { message?: string } | undefined
        eventos.push({ kind: 'error', message: err?.message || 'Error de la API' })
      }
    }
    return eventos
  }
}
