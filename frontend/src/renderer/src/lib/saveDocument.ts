import { usePdfStore } from '../store/usePdfStore'
import { apiFetch } from './api'

/** Guarda un documento: incrusta las marcas y escribe el PDF. Lo comparten el menú
 * Archivo, "Guardar como" y el aviso de cambios sin guardar, para que no se separen
 * — "Guardar como" escribía el PDF SIN incrustar y el archivo exportado salía sin
 * ninguna anotación.
 *
 * No se escribe sidecar: las marcas viajan dentro del PDF, así que un
 * `.pdfmaster.json` al lado de cada archivo solo era ruido (y una segunda copia que
 * se desincronizaba).
 *
 * Con `outputPath` guarda una copia: el documento sigue sucio porque el original
 * no se ha tocado. */
/** Sube las marcas vigentes al motor como "pendientes", sin escribir nada a disco.
 * Lo comparten el guardado y la impresión: el motor las dibuja sobre una copia cuando
 * le piden el PDF, así que imprimir ya no manda el documento limpio. */
export async function pushAnnotations(docId: string): Promise<boolean> {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return false
  if (!doc.annotations.length) return true
  const res = await apiFetch(`/pdf/embed/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: doc.annotations }),
  })
  return res.ok
}

export async function saveDocument(docId: string, outputPath?: string): Promise<boolean> {
  const { docs, backupOnSave, setDocDirty } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc) return false
  const embedRes = await apiFetch(`/pdf/embed/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: doc.annotations }),
  })
  if (!embedRes.ok) return false

  const params = new URLSearchParams()
  if (outputPath) params.set('output_path', outputPath)
  else if (backupOnSave) params.set('backup', 'true')
  const query = params.toString()
  const res = await apiFetch(`/pdf/save/${docId}${query ? `?${query}` : ''}`, { method: 'POST' })
  if (!res.ok) return false

  if (!outputPath) setDocDirty(docId, false)
  return true
}
