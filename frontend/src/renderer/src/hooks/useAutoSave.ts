import { useEffect } from 'react'
import { usePdfStore, type PdfState } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'

export function useAutoSave(
  activeDoc: PdfState['docs'][number] | undefined,
) {
  useEffect(() => {
    if (!activeDoc || !activeDoc.dirty) return
    let timeoutId: ReturnType<typeof setTimeout>
    const doAutoSave = () => {
      const doc = usePdfStore.getState().docs.find((d) => d.doc_id === activeDoc.doc_id)
      if (!doc || !doc.dirty) return
      const anns = doc.annotations
      usePdfStore.getState().setSaveStatus('saving')
      fetch(`${API_BASE}/pdf/embed/${doc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: anns }),
      })
        .then((embedRes) => {
          if (!embedRes.ok) throw new Error('Embed failed')
          return fetch(`${API_BASE}/pdf/save/${doc.doc_id}`, { method: 'POST' })
        })
        .then((saveRes) => {
          if (!saveRes.ok) throw new Error('Save failed')
          return fetch(`${API_BASE}/pdf/annotations/${doc.doc_id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ annotations: anns }),
          })
        })
        .then(() => {
          usePdfStore.getState().setDocDirty(doc.doc_id, false)
          usePdfStore.getState().setSaveStatus('saved')
          timeoutId = setTimeout(doAutoSave, 30000)
        })
        .catch(() => {
          usePdfStore.getState().setSaveStatus('idle')
          timeoutId = setTimeout(doAutoSave, 30000)
        })
    }
    timeoutId = setTimeout(doAutoSave, 30000)
    return () => clearTimeout(timeoutId)
  }, [activeDoc?.doc_id, activeDoc?.dirty])
}
