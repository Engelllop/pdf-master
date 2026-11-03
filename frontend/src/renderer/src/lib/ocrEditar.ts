/** Editar texto en una página escaneada: la página es una imagen, no hay texto que tomar.
 * Se ofrece reconocerlo (OCR) en el momento y, si el usuario acepta, el clic sigue su
 * camino como en cualquier página con texto. */
import { apiFetch } from './api'
import { askConfirm } from './uiPrompt'
import { makeSearchableUndoable } from './pageUndo'
import { usePdfStore } from '../store/usePdfStore'

export type ResultadoOcrParaEditar =
  | 'no-escaneada' // la página tiene texto: el clic simplemente no cayó sobre él
  | 'rechazado' // el usuario no quiso
  | 'sin-motor' // esta instalación no trae el reconocedor
  | 'sin-texto' // se reconoció pero no salió nada (hoja en blanco, dibujo sin letras)
  | 'listo' // ya hay texto: se puede volver a pedir el párrafo

/** ¿La página `page` no tiene capa de texto? */
async function paginaSinTexto(docId: string, page: number): Promise<boolean> {
  try {
    const r = await apiFetch(`/pdf/ocr-pending/${docId}`)
    if (!r.ok) return false
    const d = await r.json()
    return Array.isArray(d?.pages) && d.pages.includes(page)
  } catch {
    return false
  }
}

export async function ofrecerOcrParaEditar(docId: string, page: number): Promise<ResultadoOcrParaEditar> {
  if (!(await paginaSinTexto(docId, page))) return 'no-escaneada'
  const store = usePdfStore.getState()
  let disponible = false
  try {
    disponible = !!(await (await apiFetch('/pdf/ocr-available')).json())?.available
  } catch { /* sin respuesta: se trata como no disponible */ }
  if (!disponible) {
    store.showToast('Esta página es una imagen y este equipo no tiene el reconocedor de texto (OCR) para editarla.', 'error')
    return 'sin-motor'
  }
  const acepta = await askConfirm(
    'Esta página es una imagen',
    'No hay texto que editar: es un escaneo. ¿Reconocer el texto ahora (OCR)?'
    + '\n\nTarda uno o dos segundos. Después podés hacer clic en cualquier párrafo y editarlo; el texto'
    + ' nuevo se escribe con la fuente y el cuerpo que más se le parecen. Ctrl+Z deshace el reconocimiento.',
    'Reconocer texto',
  )
  if (!acepta) return 'rechazado'
  store.startProgress('Reconociendo el texto de la página…', 0, false)
  let palabras = 0
  try {
    palabras = await makeSearchableUndoable(docId, page)
  } finally {
    usePdfStore.getState().endProgress()
  }
  if (palabras <= 0) {
    store.showToast('No se encontró texto en esta página: ¿es una hoja en blanco o un dibujo sin letras?', 'info')
    return 'sin-texto'
  }
  store.showToast(`Texto reconocido (${palabras} palabras). Hacé clic en el párrafo que querés editar.`, 'success')
  return 'listo'
}
