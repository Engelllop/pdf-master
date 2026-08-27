import { useEffect, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'
import { localPointFromClient } from '../lib/svgPoint'
import { geometriaRedimensionada } from '../lib/resizeGeometry'
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
  const store = useStoreSlice('docs', 'updateAnnotation', 'commitAnnotationGesture')
  const [resizingAnnRight, setResizingAnnRight] = useState<ResizingRight>(null)

  useEffect(() => {
    if (!resizingAnnRight) return
    // La página derecha tiene su propio hook: sin esto, redimensionar una marca ahí
    // seguía sin apilar paso de deshacer aunque en la izquierda ya funcionara.
    const antes = store.docs.find((d) => d.doc_id === activeDocId)?.annotations ?? null
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
      // bitmap y aquí se escribe en puntos PDF. La geometría la calcula
      // `geometriaRedimensionada`, compartida con la izquierda — esta copia se había
      // quedado sin la regla del círculo perfecto ni la proporción de las imágenes.
      const inicio = {
        x: resizingAnnRight.startBoundsX * scaleX,
        y: resizingAnnRight.startBoundsY * scaleY,
        w: resizingAnnRight.startW * scaleX,
        h: resizingAnnRight.startH * scaleY,
      }
      store.updateAnnotation(
        doc.doc_id, resizingAnnRight.id,
        geometriaRedimensionada(ann, resizingAnnRight.corner, deltaX * scaleX, deltaY * scaleY, inicio),
      )
    }
    const handleUp = () => {
      if (antes && activeDocId) store.commitAnnotationGesture(activeDocId, antes)
      setResizingAnnRight(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnnRight])

  return { resizingAnnRight, setResizingAnnRight }
}
