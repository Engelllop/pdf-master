import { useEffect } from 'react'
import { type PdfState } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'

export function useKeyboardShortcuts(
  activeDoc: PdfState['docs'][number] | undefined,
  selectedAnnotationId: string | null,
  deleteAnnotation: (docId: string, annId: string) => void,
  cancelDraw: () => void,
) {
  const store = useStoreSlice('setActiveTool', 'undo', 'redo')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!activeDoc) return
      // Delete selected annotation (ignore if typing in an input)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement
        const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        if (!isEditing && selectedAnnotationId) {
          deleteAnnotation(activeDoc.doc_id, selectedAnnotationId)
        }
        return
      }
      // Esc cancels current tool
      if (e.key === 'Escape') {
        store.setActiveTool(null)
        cancelDraw()
        return
      }
      // Undo / Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          store.undo()
          return
        }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          store.redo()
          return
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeDoc, selectedAnnotationId, deleteAnnotation, cancelDraw])
}
