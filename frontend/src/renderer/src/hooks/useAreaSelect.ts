import { useRef, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'

import { cropPageUndoable, redactAreaUndoable } from '../lib/pageUndo'
import { isFormTool, placeFormField, type FormTool } from '../lib/formFields'

export type AreaRect = { x0: number; y0: number; x1: number; y1: number }
export type AreaTool = 'croparea' | 'redactarea' | FormTool
type PageData = { width: number; height: number; originalWidth: number; originalHeight: number } | null
type ActiveDoc = { doc_id: string; currentPage: number } | null | undefined

/** Selección visual de área para recortar/redactar o crear un campo de formulario. */
export function useAreaSelect(activeDoc: ActiveDoc, pageData: PageData) {
  const store = useStoreSlice('showToast')
  const [areaSel, setAreaSel] = useState<AreaRect | null>(null)
  const areaSelRef = useRef<AreaRect | null>(null)
  const areaDraggingRef = useRef(false)
  const areaToolRef = useRef<AreaTool | null>(null)
  const setArea = (r: AreaRect | null) => { areaSelRef.current = r; setAreaSel(r) }

  const applyArea = async (tool: AreaTool, s: AreaRect) => {
    if (!activeDoc || !pageData) return
    const sx = pageData.originalWidth / pageData.width
    const sy = pageData.originalHeight / pageData.height
    const rx0 = Math.min(s.x0, s.x1) * sx, rx1 = Math.max(s.x0, s.x1) * sx
    const ry0 = Math.min(s.y0, s.y1) * sy, ry1 = Math.max(s.y0, s.y1) * sy
    if (isFormTool(tool)) {
      try {
        await placeFormField(activeDoc.doc_id, activeDoc.currentPage, tool, {
          x: rx0, y: ry0, width: Math.max(0, rx1 - rx0), height: Math.max(0, ry1 - ry0),
        })
      } catch { store.showToast('No se pudo crear el campo', 'error') }
      return
    }
    if (rx1 - rx0 < 3 || ry1 - ry0 < 3) { store.showToast('Selección demasiado pequeña', 'info'); return }
    try {
      if (tool === 'croparea') {
        await cropPageUndoable(activeDoc.doc_id, activeDoc.currentPage, {
          top: ry0,
          right: Math.max(0, pageData.originalWidth - rx1),
          bottom: Math.max(0, pageData.originalHeight - ry1),
          left: rx0,
        })
        store.showToast('Página recortada. Ctrl+Z deshace.', 'success')
      } else {
        await redactAreaUndoable(activeDoc.doc_id, activeDoc.currentPage, {
          x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0,
        })
        store.showToast('Área redactada. Ctrl+Z deshace.', 'success')
      }
    } catch { store.showToast('Error al aplicar', 'error') }
  }

  return { areaSel, areaSelRef, areaDraggingRef, areaToolRef, setArea, applyArea }
}
