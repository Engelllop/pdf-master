import { apiFetch } from './api'
import { FUENTES_BASE } from './textoEditable'

let cache: Promise<string[]> | null = null

/** Las familias instaladas con las que el motor puede escribir (`/pdf/fonts`). Se pide
 * una vez; si falla devuelve [] y el editor ofrece las tres de siempre. */
export function cargarFuentesInstaladas(): Promise<string[]> {
  if (!cache) {
    cache = apiFetch('/pdf/fonts')
      .then((r) => (r.ok ? r.json() : { families: [] }))
      .then((d) => (Array.isArray(d?.families) ? (d.families as string[]) : []))
      .catch(() => {
        cache = null // que el próximo intento vuelva a preguntar
        return [] as string[]
      })
  }
  return cache
}

/** Lo que muestra el selector: las instaladas (o las tres base si no hay lista) y,
 * siempre, la del texto que se edita, para que el selector no quede en blanco con
 * una fuente que el sistema no lista. */
export function opcionesDeFuente(instaladas: readonly string[], actual: string): string[] {
  const base = instaladas.length ? [...instaladas] : [...FUENTES_BASE]
  return actual && !base.includes(actual) ? [actual, ...base] : base
}
