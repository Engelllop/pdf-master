import { usePdfStore } from '../store/usePdfStore'
import { apiFetch } from './api'

/** Guarda un documento en su propio archivo: incrusta las marcas, escribe el PDF y
 * persiste el sidecar. Lo comparten el menú Archivo y el aviso de salida para que no
 * se separen (el aviso guardaba solo el documento activo). */
export async function saveDocument(docId: string): Promise<boolean> {
  const { docs, backupOnSave, setDocDirty } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc) return false
  const embedRes = await apiFetch(`/pdf/embed/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: doc.annotations }),
  })
  if (!embedRes.ok) return false
  const res = await apiFetch(`/pdf/save/${docId}${backupOnSave ? '?backup=true' : ''}`, { method: 'POST' })
  if (!res.ok) return false
  await apiFetch(`/pdf/annotations/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: doc.annotations }),
  })
  setDocDirty(docId, false)
  return true
}
