// Cliente único del backend local (PyMuPDF en localhost:8745).
// Centraliza la URL base —antes duplicada como `const API_BASE` en 15 archivos— y
// ofrece helpers (`apiUrl`/`apiFetch`) que son el punto natural para inyectar el
// token Electron↔backend cuando se implemente, sin tocar cada llamada.
export const API_BASE = 'http://localhost:8745'

export const apiUrl = (path: string) => `${API_BASE}${path}`

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
  const res = await fetch(apiUrl(path), init)
  if (res.status !== 404 || !reopener || path.startsWith('/pdf/open')) return res

  const docId = path.match(UUID_RE)?.[0]
  if (!docId) return res
  const newId = await reopener(docId)
  if (!newId || newId === docId) return res
  return fetch(apiUrl(path.replace(docId, newId)), init)
}
