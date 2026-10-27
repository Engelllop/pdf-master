import { useEffect, useState } from 'react'

import { apiFetch } from '../lib/api'
import { formFieldUndoable, transformFormFieldUndoable } from '../lib/pageUndo'
import { usePdfStore } from '../store/usePdfStore'

export interface FormField {
  xref: number
  field_name: string
  field_type: string
  rect: { x: number; y: number; width: number; height: number }
  /** En casillas y opciones, el estado de ESTE widget ('Off' o su estado activo). */
  value: string
  options: string[]
  /** Estado activo de la casilla/opción («Yes», «1», «Choice2»…); null en el resto.
   * Opcional: un motor viejo no lo manda. */
  on_state?: string | null
  /** Banderas del campo (/Ff): solo lectura, multilínea, contraseña… */
  field_flags?: number
  /** Largo máximo de un campo de texto (/MaxLen); 0 = sin límite. */
  text_maxlen?: number
  /** Rótulo de un pulsador (/MK /CA). */
  caption?: string | null
}

const esBoton = (f: FormField) => /check|radio/i.test(f.field_type)

/** El valor local tras elegir `value` en el widget `xref` del campo `fieldName`.
 * En casillas y opciones cada widget guarda SU estado: copiar el valor a todos los
 * homónimos dejaba tildadas todas las opciones del grupo hasta la recarga. */
export function aplicarValorLocal(
  fields: FormField[], fieldName: string, value: string, xref?: number,
): FormField[] {
  return fields.map((f) => {
    if (f.field_name !== fieldName) return f
    if (!esBoton(f)) return { ...f, value }
    if (value === 'Off' || value === '') return { ...f, value: 'Off' }
    const elegido = xref != null ? f.xref === xref : (f.on_state ?? 'Yes') === value
    return { ...f, value: elegido ? (f.on_state ?? value) : 'Off' }
  })
}

// Caché compartida de campos por página. En scroll continuo hay un hook por página
// visible: sin caché, recorrer un documento largo disparaba una petición por página
// —y cada una toma el lock global del motor, así que la cola se comía el scroll.
// El `cancelled` anterior solo tiraba la respuesta: el trabajo en el backend se hacía
// igual. La clave lleva `docVersion`, así que cualquier edición la invalida sola.
const fieldsCache = new Map<string, Promise<FormField[]>>()

function fetchFields(docId: string, pageNum: number, version: number): Promise<FormField[]> {
  const key = `${docId}:${version}:${pageNum}`
  let p = fieldsCache.get(key)
  if (!p) {
    const olvidar = (): FormField[] => { if (fieldsCache.get(key) === p) fieldsCache.delete(key); return [] }
    p = apiFetch(`/pdf/widgets/${docId}/${pageNum}`)
      .then((res) => (res.ok ? res.json() : null))
      // Un 404 (doc_id muerto tras reiniciarse el motor) devuelve `{detail: …}`, no
      // una lista: sin comprobarlo, el `.map` de la capa de campos reventaba la vista.
      .then((data) => (Array.isArray(data) ? (data as FormField[]) : olvidar()))
      .catch(olvidar)
    fieldsCache.set(key, p)
    if (fieldsCache.size > 120) {
      const first = fieldsCache.keys().next().value
      if (first !== undefined) fieldsCache.delete(first)
    }
  }
  return p
}

// Toda escritura de campos sube `docVersion` (ver lib/pageUndo), así que la clave
// cambia sola y no hace falta invalidar a mano.

export function useFormFields(docId: string | null, pageNum: number) {
  const [fields, setFields] = useState<FormField[]>([])
  const docVersion = usePdfStore((s) => s.docs.find((d) => d.doc_id === docId)?.docVersion ?? 0)

  useEffect(() => {
    if (!docId) {
      setFields([])
      return
    }
    let cancelled = false
    fetchFields(docId, pageNum, docVersion).then((data) => {
      if (!cancelled) setFields(data)
    })
    return () => { cancelled = true }
  }, [docId, pageNum, docVersion])

  // `xref` = el widget que tocó el usuario (casillas y opciones): viaja al motor para
  // que escriba sobre ESE widget, y acá sirve para que el valor local encienda solo
  // esa opción.
  const updateField = async (fieldName: string, value: string, xref?: number) => {
    if (!docId) return false
    try {
      await formFieldUndoable(docId, pageNum, fieldName, value, xref)
      setFields((prev) => aplicarValorLocal(prev, fieldName, value, xref))
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
