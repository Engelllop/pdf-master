import { useEffect } from 'react'
import { type PdfState } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'

const NUDGE_PT = 1
const NUDGE_BIG_PT = 10

export function useKeyboardShortcuts(
  activeDoc: PdfState['docs'][number] | undefined,
  selectedAnnotationId: string | null,
  deleteAnnotation: (docId: string, annId: string) => void,
  cancelDraw: () => void,
) {
  const store = useStoreSlice(
    'setActiveTool', 'undo', 'redo', 'selectedAnnotationIds', 'selectAnnotations',
    'selectAnnotation', 'deleteAnnotations', 'moveAnnotations', 'copyAnnotations',
    'pasteAnnotations', 'annotationClipboard', 'showToast', 'getAnnotationsForPage',
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!activeDoc) return
      const target = e.target as HTMLElement
      const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const ids = store.selectedAnnotationIds
      const isMeta = e.ctrlKey || e.metaKey

      // Borrar la selección (ignora si se está escribiendo en un campo)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isEditing) return
        if (ids.length > 0) store.deleteAnnotations(activeDoc.doc_id, ids)
        else if (selectedAnnotationId) deleteAnnotation(activeDoc.doc_id, selectedAnnotationId)
        return
      }
      // Esc suelta herramienta y selección
      if (e.key === 'Escape') {
        store.setActiveTool(null)
        store.selectAnnotation(activeDoc.doc_id, null)
        cancelDraw()
        return
      }

      // Ajuste fino de la selección con las flechas (Shift = 10 pt). Tiene prioridad
      // sobre el cambio de página, que solo actúa si no hay nada seleccionado.
      if (!isEditing && !isMeta && ids.length > 0 && e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? NUDGE_BIG_PT : NUDGE_PT
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) {
          e.preventDefault()
          store.moveAnnotations(activeDoc.doc_id, ids, dx, dy)
        }
        return
      }

      if (!isMeta || isEditing) return

      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault()
          if (e.shiftKey) store.redo()
          else store.undo()
          return
        case 'y':
          e.preventDefault()
          store.redo()
          return
        case 'a': {
          // Seleccionar todas las marcas de la página actual
          const pageAnns = store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage)
          if (pageAnns.length === 0) return
          e.preventDefault()
          store.selectAnnotations(activeDoc.doc_id, pageAnns.map((a) => a.id))
          return
        }
        case 'c': {
          if (ids.length === 0) return
          e.preventDefault()
          const n = store.copyAnnotations(activeDoc.doc_id, ids)
          if (n > 0) store.showToast(`${n} marca(s) copiada(s)`, 'info')
          return
        }
        case 'x': {
          if (ids.length === 0) return
          e.preventDefault()
          const n = store.copyAnnotations(activeDoc.doc_id, ids)
          if (n > 0) {
            store.deleteAnnotations(activeDoc.doc_id, ids)
            store.showToast(`${n} marca(s) cortada(s)`, 'info')
          }
          return
        }
        case 'v': {
          // Pega en la página actual — también sirve para llevar marcas a otro documento
          if (store.annotationClipboard.length === 0) return
          e.preventDefault()
          const n = store.pasteAnnotations(activeDoc.doc_id, activeDoc.currentPage)
          if (n > 0) store.showToast(`${n} marca(s) pegada(s)`, 'success')
          return
        }
        case 'd': {
          if (ids.length === 0) return
          e.preventDefault()
          store.copyAnnotations(activeDoc.doc_id, ids)
          const n = store.pasteAnnotations(activeDoc.doc_id, activeDoc.currentPage)
          if (n > 0) store.showToast(`${n} marca(s) duplicada(s)`, 'success')
          return
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeDoc, selectedAnnotationId, deleteAnnotation, cancelDraw, store])
}
