import { useEffect, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'
import { localPointFromClient } from '../lib/svgPoint'
import { type ResizeCorner } from './useAnnotationDrag'

type PageData = { width: number; height: number; originalWidth: number; originalHeight: number } | null
type ResizingRight = {
  id: string; corner: ResizeCorner;
  startX: number; startY: number;
  startW: number; startH: number;
  startBoundsX: number; startBoundsY: number;
} | null

/** Redimensionado de anotaciones en la página derecha (vista doble). Escucha
 * mousemove/up en window y reescala manteniendo la esquina de anclaje. */
export function useRightPageResize(
  svgRightRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageDataRight: PageData,
) {
  const store = useStoreSlice('docs', 'updateAnnotation')
  const [resizingAnnRight, setResizingAnnRight] = useState<ResizingRight>(null)

  useEffect(() => {
    if (!resizingAnnRight) return
    const handleMove = (e: MouseEvent) => {
      if (!svgRightRef.current || !pageDataRight) return
      const { x: svgX, y: svgY } = localPointFromClient(
        svgRightRef.current, e.clientX, e.clientY, pageDataRight.width)
      const deltaX = svgX - resizingAnnRight.startX
      const deltaY = svgY - resizingAnnRight.startY

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === resizingAnnRight.id)
      if (!ann) return
      const scaleX = pageDataRight.originalWidth / pageDataRight.width
      const scaleY = pageDataRight.originalHeight / pageDataRight.height
      // Igual que en la página izquierda: los valores de arranque vienen en px del
      // bitmap y aquí se escribe en puntos PDF.
      const startW = resizingAnnRight.startW * scaleX
      const startH = resizingAnnRight.startH * scaleY
      const startBoundsX = resizingAnnRight.startBoundsX * scaleX
      const startBoundsY = resizingAnnRight.startBoundsY * scaleY

      let newX = ann.x
      let newY = ann.y
      let newW = ann.width || 0
      let newH = ann.height || 0

      const dx = deltaX * scaleX
      const dy = deltaY * scaleY

      switch (resizingAnnRight.corner) {
        case 'se':
          newW = Math.max(10, startW + dx)
          newH = Math.max(10, startH + dy)
          break
        case 'nw':
          newW = Math.max(10, startW - dx)
          newH = Math.max(10, startH - dy)
          newX = startBoundsX + (startW - newW)
          newY = startBoundsY + (startH - newH)
          break
        case 'ne':
          newW = Math.max(10, startW + dx)
          newH = Math.max(10, startH - dy)
          newY = startBoundsY + (startH - newH)
          break
        case 'sw':
          newW = Math.max(10, startW - dx)
          newH = Math.max(10, startH + dy)
          newX = startBoundsX + (startW - newW)
          break
        case 'n':
          newH = Math.max(10, startH - dy)
          newY = startBoundsY + (startH - newH)
          break
        case 's':
          newH = Math.max(10, startH + dy)
          break
        case 'e':
          newW = Math.max(10, startW + dx)
          break
        case 'w':
          newW = Math.max(10, startW - dx)
          newX = startBoundsX + (startW - newW)
          break
      }

      if (ann.type === 'circle') {
        const size = Math.min(newW, newH)
        if (resizingAnnRight.corner === 'nw' || resizingAnnRight.corner === 'ne' || resizingAnnRight.corner === 'sw' || resizingAnnRight.corner === 'se') {
          newW = size
          newH = size
        }
      }

      store.updateAnnotation(doc.doc_id, resizingAnnRight.id, { x: newX, y: newY, width: newW, height: newH })
    }
    const handleUp = () => setResizingAnnRight(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnnRight])

  return { resizingAnnRight, setResizingAnnRight }
}
