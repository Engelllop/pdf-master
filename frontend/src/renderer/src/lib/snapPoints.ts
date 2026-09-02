import { apiFetch } from './api'

export interface SnapPoint {
  x: number
  y: number
}

// Caché compartida de puntos de ajuste por página, con la misma forma que `lib/spans`.
// El motor ya los cachea, pero la petición seguía saliendo cada vez que se elegía una
// herramienta de medición: en un plano denso son decenas de miles de puntos que hay
// que serializar y volver a parsear, y la extracción toma el lock global del motor
// —así que alternar rápido entre medir distancia / área / perímetro dejaba la app
// esperando al backend. La clave lleva `docVersion`: editar el dibujo la invalida.
const cache = new Map<string, Promise<SnapPoint[]>>()

export function getSnapPoints(docId: string, page: number, version = 0): Promise<SnapPoint[]> {
  const key = `${docId}:${version}:${page}`
  let p = cache.get(key)
  if (!p) {
    // Un fallo no se cachea (motor reiniciado o corte puntual): si no, la página se
    // quedaba sin ajuste para siempre.
    const olvidar = (): SnapPoint[] => { if (cache.get(key) === p) cache.delete(key); return [] }
    p = apiFetch(`/pdf/snap-points/${docId}/${page}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.points as SnapPoint[] | undefined) ?? olvidar())
      .catch(olvidar)
    cache.set(key, p)
    if (cache.size > 40) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
  }
  return p
}
