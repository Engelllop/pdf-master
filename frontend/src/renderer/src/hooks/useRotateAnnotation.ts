import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { localPointFromClient } from '../lib/svgPoint'

export type RotatingAnn = { id: string; startAngle: number; startRotation: number; centerX: number; centerY: number }

/** Rotación por arrastre de una anotación: escucha mousemove/up en window mientras
 * rotatingAnn está activo y actualiza la rotación. Compartido por ambas páginas. */
export function useRotateAnnotation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageData: { width: number } | null,
) {
  const [rotatingAnn, setRotatingAnn] = useState<RotatingAnn | null>(null)

  // El ángulo se calcula desde `startRotation` + el delta al mousedown, así que no
  // acumula; lo que sí puede quedarse viejo en el closure es `pageData`, que
  // `useZoomUpgrade` reemplaza 250 ms después de un cambio de zoom: con el ancho
  // anterior, des-escalar el ratón daba un ángulo torcido a media faena.
  const vivo = useRef({ activeDocId, pageData })
  vivo.current = { activeDocId, pageData }

  useEffect(() => {
    if (!rotatingAnn) return
    // Girar tampoco apilaba nada: un giro accidental no se podía deshacer.
    const docIdAlEmpezar = vivo.current.activeDocId
    const antes = usePdfStore.getState().docs.find((d) => d.doc_id === docIdAlEmpezar)?.annotations ?? null
    const handleMove = (e: MouseEvent) => {
      const { activeDocId: docId, pageData: pd } = vivo.current
      if (!svgRef.current || !pd) return
      // El centro de giro viene en px del bitmap: sin des-escalar el ratón, el ángulo
      // salía torcido en cuanto la página no se mostraba 1:1.
      const { x: mouseX, y: mouseY } = localPointFromClient(
        svgRef.current, e.clientX, e.clientY, pd.width)
      const angle = Math.atan2(mouseY - rotatingAnn.centerY, mouseX - rotatingAnn.centerX)
      const deltaDeg = (angle - rotatingAnn.startAngle) * 180 / Math.PI
      const newRotation = rotatingAnn.startRotation + deltaDeg
      const estado = usePdfStore.getState()
      const doc = estado.docs.find((d) => d.doc_id === docId)
      if (!doc) return
      estado.updateAnnotation(doc.doc_id, rotatingAnn.id, { rotation: newRotation })
    }
    const handleUp = () => {
      if (antes && docIdAlEmpezar) usePdfStore.getState().commitAnnotationGesture(docIdAlEmpezar, antes)
      setRotatingAnn(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [rotatingAnn, svgRef])

  return { rotatingAnn, setRotatingAnn }
}
