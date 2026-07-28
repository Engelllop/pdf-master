import { usePdfStore } from '../store/usePdfStore'
import { updateRecentMeta } from './recents'
import { askUnsaved } from './unsavedPrompt'
import { saveDocument } from './saveDocument'

// Cierre con confirmación: si el documento tiene cambios sin guardar, pregunta
// antes de descartar — con el diálogo de la app, no el `window.confirm()` nativo
// de Windows, y ofreciendo guardar además de descartar. Devuelve false si el
// usuario canceló o si el guardado falló.
export async function requestCloseDoc(docId: string): Promise<boolean> {
  const { docs, closeDoc, showToast } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc) return true
  if (doc.dirty) {
    const choice = await askUnsaved([docId])
    if (choice === 'cancel') return false
    if (choice === 'save' && usePdfStore.getState().docs.some((d) => d.doc_id === docId && d.dirty)) {
      if (!(await saveDocument(docId))) {
        showToast(`No se pudo guardar ${doc.file_name}. No se cerró.`, 'error')
        return false
      }
    }
  }
  updateRecentMeta(doc.file_path, { lastPage: doc.currentPage, pageCount: doc.page_count })
  closeDoc(docId)
  return true
}

/** Cierra varios en fila (menú de pestañas: "cerrar las demás", "cerrar todas").
 * Secuencial a propósito: en paralelo saldrían N diálogos a la vez. Se detiene en
 * cuanto el usuario cancela uno. */
export async function requestCloseDocs(docIds: string[]): Promise<void> {
  for (const id of docIds) {
    if (!(await requestCloseDoc(id))) return
  }
}
