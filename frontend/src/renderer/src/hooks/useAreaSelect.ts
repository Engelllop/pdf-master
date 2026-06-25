import { useRef, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'

import { API_BASE } from '../lib/api'

export type AreaRect = { x0: number; y0: number; x1: number; y1: number }
type PageData = { width: number; height: number; originalWidth: number; originalHeight: number } | null
type ActiveDoc = { doc_id: string; currentPage: number } | null | undefined

/** Selección visual de área para recortar/redactar (herramientas 'croparea' /
 * 'redactarea'): mantiene el rectángulo en arrastre y lo envía a /crop o /redact. */
export function useAreaSelect(activeDoc: ActiveDoc, pageData: PageData) {
  const store = useStoreSlice(
    'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails',
    'incrementDocVersion', 'showToast',
  )
  const [areaSel, setAreaSel] = useState<AreaRect | null>(null)
  const areaSelRef = useRef<AreaRect | null>(null)
  const areaDraggingRef = useRef(false)
  const areaToolRef = useRef<'croparea' | 'redactarea' | null>(null)
  const setArea = (r: AreaRect | null) => { areaSelRef.current = r; setAreaSel(r) }

  const applyArea = async (tool: 'croparea' | 'redactarea', s: AreaRect) => {
    if (!activeDoc || !pageData) return
    const sx = pageData.originalWidth / pageData.width
    const sy = pageData.originalHeight / pageData.height
    const rx0 = Math.min(s.x0, s.x1) * sx, rx1 = Math.max(s.x0, s.x1) * sx
    const ry0 = Math.min(s.y0, s.y1) * sy, ry1 = Math.max(s.y0, s.y1) * sy
    if (rx1 - rx0 < 3 || ry1 - ry0 < 3) { store.showToast('Selección demasiado pequeña', 'info'); return }
    try {
      const res = tool === 'croparea'
        ? await fetch(`${API_BASE}/pdf/crop/${activeDoc.doc_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_num: activeDoc.currentPage, top: ry0, right: Math.max(0, pageData.originalWidth - rx1), bottom: Math.max(0, pageData.originalHeight - ry1), left: rx0 }) })
        : await fetch(`${API_BASE}/pdf/redact/${activeDoc.doc_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_num: activeDoc.currentPage, x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0 }) })
      if (res.ok) {
        store.setDocDirty(activeDoc.doc_id, true)
        store.invalidatePageCache(activeDoc.doc_id)
        store.invalidateThumbnails(activeDoc.doc_id)
        store.incrementDocVersion(activeDoc.doc_id)
        store.showToast(tool === 'croparea' ? 'Página recortada' : 'Área redactada', 'success')
      } else store.showToast('Error al aplicar', 'error')
    } catch { store.showToast('Error al aplicar', 'error') }
  }

  return { areaSel, areaSelRef, areaDraggingRef, areaToolRef, setArea, applyArea }
}
