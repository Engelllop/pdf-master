/** Fecha relativa corta ("hoy", "ayer", "hace 3 días"). */
export function formatWhen(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(ts).toLocaleDateString()
}

/** Fecha y hora completas para tooltips. */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

/**
 * Mensaje legible de algo que se atrapó en un `catch`.
 *
 * `catch (err: any)` + `err.message` daba «Error: undefined» cuando lo lanzado no era
 * un `Error` —un string, un objeto de una librería, un rechazo sin motivo—, y eso es
 * exactamente el aviso que menos sirve. Además el `any` apagaba el tipado en el resto
 * del bloque.
 */
export function mensajeDeError(err: unknown, respaldo = 'error desconocido'): string {
  if (err instanceof Error) return err.message || respaldo
  if (typeof err === 'string' && err.trim()) return err
  return respaldo
}
