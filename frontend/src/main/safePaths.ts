import { extname, isAbsolute } from 'path'
import { statSync } from 'fs'

const MAX_IMAGE_BYTES = 50 * 1024 * 1024

function rutaLocalAbsoluta(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ruta = value.trim()
  if (!ruta || ruta.includes('\0') || !isAbsolute(ruta)) return null
  return ruta
}

export function rutaParaMostrarEnCarpeta(value: unknown): string | null {
  const ruta = rutaLocalAbsoluta(value)
  if (!ruta) return null
  try {
    statSync(ruta)
    return ruta
  } catch {
    return null
  }
}

export function rutaCarpetaAbrible(value: unknown): string | null {
  const ruta = rutaLocalAbsoluta(value)
  if (!ruta) return null
  try {
    return statSync(ruta).isDirectory() ? ruta : null
  } catch {
    return null
  }
}

export function rutaImagenLegible(value: unknown, allowedExts: Set<string>): string | null {
  const ruta = rutaLocalAbsoluta(value)
  if (!ruta || !allowedExts.has(extname(ruta).toLowerCase())) return null
  try {
    const st = statSync(ruta)
    if (!st.isFile() || st.size > MAX_IMAGE_BYTES) return null
    return ruta
  } catch {
    return null
  }
}
