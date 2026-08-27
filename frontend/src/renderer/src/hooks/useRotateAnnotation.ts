import { useEffect, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'
import { localPointFromClient } from '../lib/svgPoint'

export type RotatingAnn = { id: string; startAngle: number; startRotation: number; centerX: number; centerY: number }

/** Rotación por arrastre de una anotación: escucha mousemove/up en window mientras
 * rotatingAnn está activo y actualiza la rotación. Compartido por ambas páginas. */
export function useRotateAnnotation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageData: { width: number } | null,
) {
  const store = useStoreSlice('docs', 'updateAnnotation', 'commitAnnotationGesture')
  const [rotatingAnn, setRotatingAnn] = useState<RotatingAnn | null>(null)

  useEffect(() => {
    if (!rotatingAnn) return
    // Girar tampoco apilaba nada: un giro accidental no se podía deshacer.
    const antes = store.docs.find((d) => d.doc_id === activeDocId)?.annotations ?? null
    const handleMove = (e: MouseEvent) => {
      if (!svgRef.current || !pageData) return
      // El centro de giro viene en px del bitmap: sin des-escalar el ratón, el ángulo
      // salía torcido en cuanto la página no se mostraba 1:1.
      const { x: mouseX, y: mouseY } = localPointFromClient(
        svgRef.current, e.clientX, e.clientY, pageData.width)
      const angle = Math.atan2(mouseY - rotatingAnn.centerY, mouseX - rotatingAnn.centerX)
      const deltaDeg = (angle - rotatingAnn.startAngle) * 180 / Math.PI
      const newRotation = rotatingAnn.startRotation + deltaDeg
      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      store.updateAnnotation(doc.doc_id, rotatingAnn.id, { rotation: newRotation })
    }
    const handleUp = () => {
      if (antes && activeDocId) store.commitAnnotationGesture(activeDocId, antes)
      setRotatingAnn(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [rotatingAnn])

  return { rotatingAnn, setRotatingAnn }
}
