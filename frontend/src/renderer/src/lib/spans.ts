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
    // Un fallo NO se cachea: si el motor se reinició (o hubo un corte puntual), la
    // promesa vacía se quedaba pegada a esa clave y la página perdía la capa de texto
    // para siempre, sin forma de recuperarla salvo cambiar de docVersion.
    const olvidar = (): SpanItem[] => { if (cache.get(key) === p) cache.delete(key); return [] }
    p = apiFetch(`/pdf/spans/${docId}/${page}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.spans as SpanItem[] | undefined) ?? olvidar())
      .catch(olvidar)
    cache.set(key, p)
    if (cache.size > 60) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
  }
  return p
}
