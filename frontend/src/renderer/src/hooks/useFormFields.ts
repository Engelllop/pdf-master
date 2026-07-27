import { useEffect, useState } from 'react'

import { apiFetch } from '../lib/api'
import { usePdfStore } from '../store/usePdfStore'

export interface FormField {
  field_name: string
  field_type: string
  rect: { x: number; y: number; width: number; height: number }
  value: string
  options: string[]
}

export function useFormFields(docId: string | null, pageNum: number) {
  const [fields, setFields] = useState<FormField[]>([])

  useEffect(() => {
    if (!docId) {
      setFields([])
      return
    }
    let cancelled = false
    apiFetch(`/pdf/widgets/${docId}/${pageNum}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .catch(() => {
        if (!cancelled) setFields([])
      })
    return () => { cancelled = true }
  }, [docId, pageNum])

  const updateField = async (fieldName: string, value: string) => {
    if (!docId) return false
    try {
      const res = await apiFetch(`/pdf/widgets/${docId}/${pageNum}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: fieldName, value }),
      })
      if (res.ok) {
        setFields((prev) => prev.map((f) => (f.field_name === fieldName ? { ...f, value } : f)))
        // Rellenar un campo modifica el PDF: sin marcarlo sucio la app dejaba salir
        // sin avisar y el dato se perdía. Se re-renderiza para verlo ya escrito.
        const store = usePdfStore.getState()
        store.setDocDirty(docId, true)
        store.invalidatePageCache(docId)
        store.invalidateThumbnails(docId)
        store.incrementDocVersion(docId)
        return true
      }
    } catch { /* ignore */ }
    return false
  }

  return { fields, updateField }
}
