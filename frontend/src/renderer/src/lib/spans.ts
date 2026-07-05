import { apiFetch } from './api'

export interface SpanItem {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  size: number
}

// Caché compartida de spans por página (TextLayer + marcado de texto), clave con
// docVersion para invalidarse sola cuando se edita texto.
const cache = new Map<string, Promise<SpanItem[]>>()

export function getSpans(docId: string, page: number, version = 0): Promise<SpanItem[]> {
  const key = `${docId}:${version}:${page}`
  let p = cache.get(key)
  if (!p) {
    p = apiFetch(`/pdf/spans/${docId}/${page}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.spans ?? [])
      .catch(() => [])
    cache.set(key, p)
    if (cache.size > 60) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
  }
  return p
}
