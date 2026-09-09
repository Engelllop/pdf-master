import { extname, isAbsolute } from 'path'
import { statSync } from 'fs'
import { fileURLToPath } from 'url'

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

/**
 * Ruta del PDF que el usuario soltó sobre la ventana, o null si eso no es un PDF
 * local. El `will-navigate` la traducía a mano (`replace('file:///','')` +
 * `decodeURI`), y eso deja fuera las rutas UNC (`file://servidor/planos/x.pdf`, que
 * quedaba como `servidor\planos\x.pdf`) y revienta con un `#` en el nombre, que
 * `decodeURI` no decodifica: «Lámina #3.pdf» no abría nunca.
 */
export function rutaDePdfArrastrado(url: unknown): string | null {
  if (typeof url !== 'string' || !url.toLowerCase().startsWith('file://')) return null
  let ruta: string
  try {
    ruta = fileURLToPath(url)
  } catch {
    return null // no es una file:// que apunte a una ruta de este sistema
  }
  if (extname(ruta).toLowerCase() !== '.pdf') return null
  return rutaLocalAbsoluta(ruta)
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
