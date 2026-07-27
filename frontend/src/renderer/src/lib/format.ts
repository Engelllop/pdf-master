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
