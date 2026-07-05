import { usePdfStore } from '../store/usePdfStore'
import { updateRecentMeta } from './recents'

// Cierre con confirmación: si el documento tiene cambios sin guardar, pregunta
// antes de descartar. Devuelve false si el usuario canceló.
export function requestCloseDoc(docId: string): boolean {
  const { docs, closeDoc } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc) return true
  if (doc.dirty) {
    const ok = window.confirm(`"${doc.file_name}" tiene cambios sin guardar.\n\n¿Cerrar sin guardar? Los cambios se perderán.`)
    if (!ok) return false
  }
  updateRecentMeta(doc.file_path, { lastPage: doc.currentPage, pageCount: doc.page_count })
  closeDoc(docId)
  return true
}
