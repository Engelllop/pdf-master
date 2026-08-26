export interface PageRange { from: number; to: number }

/** Valida y normaliza un rango escrito a mano ("1-5, 8"). Devuelve `null` si la
 * sintaxis no cierra o si se sale del documento: antes cualquier disparate se mandaba
 * a Electron, que imprimía nada sin decir por qué. Índices base 0, ambos inclusive. */
export function parsePageRanges(input: string, pageCount: number): PageRange[] | null {
  const partes = input.split(',').map((p) => p.trim()).filter(Boolean)
  if (!partes.length) return null
  const out: PageRange[] = []
  for (const parte of partes) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(parte)
    if (!m) return null
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) return null
    out.push({ from: Math.min(a, b) - 1, to: Math.max(a, b) - 1 })
  }
  return out
}
