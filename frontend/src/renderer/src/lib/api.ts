// Cliente único del backend local (PyMuPDF en localhost:8745).
// Centraliza la URL base —antes duplicada como `const API_BASE` en 15 archivos— y
// ofrece helpers (`apiUrl`/`apiFetch`) que son el punto natural para inyectar el
// token Electron↔backend cuando se implemente, sin tocar cada llamada.
export const API_BASE = 'http://localhost:8745'

export const apiUrl = (path: string) => `${API_BASE}${path}`

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init)
}
