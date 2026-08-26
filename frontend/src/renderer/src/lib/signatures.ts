/** Firmas dibujadas que el usuario guardó. Ya se escribían en localStorage al
 * dibujar una firma, pero no había forma de volver a usarlas ni de borrarlas. */
export interface SavedSignature {
  id: string
  name: string
  points: Array<{ x: number; y: number }>
}

const KEY = 'pdfmaster_signatures'

export function loadSignatures(): SavedSignature[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter((s) => s && Array.isArray(s.points)) : []
  } catch {
    return []
  }
}

function save(list: SavedSignature[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-10))) } catch {}
}

/** Guarda una firma nueva. Vive aquí y no en el hook de dibujo para que la clave de
 * localStorage y el tope estén en un solo sitio (estaban duplicados). */
export function addSignature(name: string, points: SavedSignature['points']): SavedSignature {
  const created = { id: crypto.randomUUID(), name, points }
  save([...loadSignatures(), created])
  return created
}

export function renameSignature(id: string, name: string): void {
  save(loadSignatures().map((s) => (s.id === id ? { ...s, name } : s)))
}

export function removeSignature(id: string): void {
  save(loadSignatures().filter((s) => s.id !== id))
}

/** Normaliza los puntos a un bbox de ancho `width` (pt) para colocar la firma
 * guardada en el punto donde el usuario hace clic. */
export function signatureAtPoint(
  sig: SavedSignature,
  at: { x: number; y: number },
  width = 140,
): Array<{ x: number; y: number }> {
  const xs = sig.points.map((p) => p.x)
  const ys = sig.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(1, Math.max(...xs) - minX)
  const scale = width / w
  return sig.points.map((p) => ({
    x: at.x + (p.x - minX) * scale,
    y: at.y + (p.y - minY) * scale,
  }))
}
