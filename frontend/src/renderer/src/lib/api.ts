// Cliente único del backend local (PyMuPDF en loopback).
// Centraliza la URL base —antes duplicada como `const API_BASE` en 15 archivos— y
// el token Electron↔backend, así que ninguna llamada tiene que saber el puerto.

/** Puerto de siempre. Solo se usa mientras no hay puente con el main (tests) o si la
 * consulta falla: el real lo decide el arranque y puede ser otro del rango. */
const BASE_POR_DEFECTO = 'http://localhost:8745'

type ApiConfig = { base: string; token: string }

/** Se cachea SOLO el resultado bueno. Antes se cacheaba con `apiToken === null`, así
 * que un fallo transitorio de la consulta dejaba el token en '' PARA SIEMPRE y todas
 * las llamadas siguientes se iban sin él: 403 en todo, sin forma de recuperarse
 * salvo reiniciar la app. */
let config: ApiConfig | null = null

async function leerConfig(): Promise<ApiConfig> {
  if (config) return config
  const puente = typeof window !== 'undefined' ? window.api?.getApiConfig : undefined
  // Sin preload (tests, o el renderer antes de que exista el puente) no hay nada que
  // pedir. No se cachea: si el puente aparece después, la próxima llamada lo ve.
  if (!puente) return { base: BASE_POR_DEFECTO, token: '' }
  try {
    const leida = await puente()
    config = { base: leida?.base || BASE_POR_DEFECTO, token: leida?.token || '' }
    return config
  } catch {
    return { base: BASE_POR_DEFECTO, token: '' }
  }
}

/** La base que se está usando, para los mensajes de error. '' si aún no se consultó. */
export const baseConocida = (): string => config?.base ?? ''

/** Reabre un doc_id muerto y devuelve el nuevo. Lo inyecta `openDocument.ts` para
 * no crear un ciclo de imports (openDocument ya usa apiFetch). */
type Reopener = (docId: string) => Promise<string | null>
let reopener: Reopener | null = null
export function setDeadDocReopener(fn: Reopener): void { reopener = fn }

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Cuando el motor se reinicia (crash silencioso de PyMuPDF), los doc_id abiertos
 * mueren y TODA operación posterior responde 404: al usuario le fallaba la marca de
 * agua, rotar, etc. sin explicación. Aquí se detecta el 404, se reabre el documento
 * conservando su estado y se reintenta la llamada una sola vez con el id nuevo.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { base, token } = await leerConfig()
  const headers = {
    ...(init?.headers as Record<string, string> | undefined),
    ...(token ? { 'X-Pdfmaster-Token': token } : {}),
  }
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (res.status !== 404 || !reopener || path.startsWith('/pdf/open')) return res

  const docId = path.match(UUID_RE)?.[0]
  if (!docId) return res
  const newId = await reopener(docId)
  if (!newId || newId === docId) return res
  return fetch(`${base}${path.replace(docId, newId)}`, { ...init, headers })
}
