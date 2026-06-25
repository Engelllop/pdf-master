import { useEffect, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'

export type RotatingAnn = { id: string; startAngle: number; startRotation: number; centerX: number; centerY: number }

/** Rotación por arrastre de una anotación: escucha mousemove/up en window mientras
 * rotatingAnn está activo y actualiza la rotación. Compartido por ambas páginas. */
export function useRotateAnnotation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
) {
  const store = useStoreSlice('docs', 'updateAnnotation')
  const [rotatingAnn, setRotatingAnn] = useState<RotatingAnn | null>(null)

  useEffect(() => {
    if (!rotatingAnn) return
    const handleMove = (e: MouseEvent) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const angle = Math.atan2(mouseY - rotatingAnn.centerY, mouseX - rotatingAnn.centerX)
      const deltaDeg = (angle - rotatingAnn.startAngle) * 180 / Math.PI
      const newRotation = rotatingAnn.startRotation + deltaDeg
      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      store.updateAnnotation(doc.doc_id, rotatingAnn.id, { rotation: newRotation })
    }
    const handleUp = () => setRotatingAnn(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [rotatingAnn])

  return { rotatingAnn, setRotatingAnn }
}
