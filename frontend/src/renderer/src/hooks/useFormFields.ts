import { useEffect, useState } from 'react'

import { apiFetch } from '../lib/api'
import { formFieldUndoable, transformFormFieldUndoable } from '../lib/pageUndo'
import { usePdfStore } from '../store/usePdfStore'

export interface FormField {
  xref: number
  field_name: string
  field_type: string
  rect: { x: number; y: number; width: number; height: number }
  value: string
  options: string[]
}

export function useFormFields(docId: string | null, pageNum: number) {
  const [fields, setFields] = useState<FormField[]>([])
  const docVersion = usePdfStore((s) => s.docs.find((d) => d.doc_id === docId)?.docVersion ?? 0)

  useEffect(() => {
    if (!docId) {
      setFields([])
      return
    }
    let cancelled = false
    apiFetch(`/pdf/widgets/${docId}/${pageNum}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Un 404 (doc_id muerto tras reiniciarse el motor) devuelve `{detail: …}`, no
        // una lista: sin comprobarlo, el `.map` de la capa de campos reventaba la vista.
        if (!cancelled) setFields(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setFields([])
      })
    return () => { cancelled = true }
  }, [docId, pageNum, docVersion])

  const updateField = async (fieldName: string, value: string) => {
    if (!docId) return false
    try {
      await formFieldUndoable(docId, pageNum, fieldName, value)
      setFields((prev) => prev.map((f) => (f.field_name === fieldName ? { ...f, value } : f)))
      return true
    } catch {
      // Sin aviso, el campo volvía solo a su valor anterior y parecía que la app se
      // había comido lo escrito.
      usePdfStore.getState().showToast('No se pudo guardar el campo del formulario', 'error')
    }
    return false
  }

  const transformField = async (
    xref: number,
    next: { x?: number; y?: number; width?: number; height?: number; delete?: boolean },
  ) => {
    if (!docId) return false
    try {
      await transformFormFieldUndoable(docId, pageNum, { xref, ...next })
      if (next.delete) usePdfStore.getState().showToast('Campo eliminado. Ctrl+Z deshace.', 'success')
      return true
    } catch {
      usePdfStore.getState().showToast(
        next.delete ? 'No se pudo eliminar el campo' : 'No se pudo mover el campo', 'error')
      return false
    }
  }

  return { fields, updateField, transformField }
}
