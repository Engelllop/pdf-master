import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
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
  const [resizingAnnRight, setResizingAnnRight] = useState<ResizingRight>(null)

  // El efecto solo se re-suscribe al empezar y terminar el gesto, así que los props
  // que puede cambiar el zoom a media faena (`useZoomUpgrade` reemplaza el bitmap
  // 250 ms después) se leen de acá y no del closure: con el `pageDataRight` viejo, la
  // conversión de píxeles a puntos usaba la escala anterior.
  const vivo = useRef({ activeDocId, pageDataRight })
  vivo.current = { activeDocId, pageDataRight }

  useEffect(() => {
    if (!resizingAnnRight) return
    // La página derecha tiene su propio hook: sin esto, redimensionar una marca ahí
    // seguía sin apilar paso de deshacer aunque en la izquierda ya funcionara.
    //
    // Y como en la izquierda, la geometría sale de la FOTO del arranque: el factor de
    // `geometriaRedimensionada` es acumulado desde la caja de origen, así que
    // reescalar los puntos ya escalados dispara el trazo.
    const docIdAlEmpezar = vivo.current.activeDocId
    const annsAlEmpezar = usePdfStore.getState().docs.find((d) => d.doc_id === docIdAlEmpezar)?.annotations ?? null
    const annAlEmpezar = annsAlEmpezar?.find((a) => a.id === resizingAnnRight.id) ?? null
    const handleMove = (e: MouseEvent) => {
      const { activeDocId: docId, pageDataRight: pd } = vivo.current
      if (!svgRightRef.current || !pd || !annAlEmpezar) return
      const { x: svgX, y: svgY } = localPointFromClient(
        svgRightRef.current, e.clientX, e.clientY, pd.width)
      const deltaX = svgX - resizingAnnRight.startX
      const deltaY = svgY - resizingAnnRight.startY

      const estado = usePdfStore.getState()
      const doc = estado.docs.find((d) => d.doc_id === docId)
      if (!doc || !doc.annotations.some((a) => a.id === resizingAnnRight.id)) return
      const scaleX = pd.originalWidth / pd.width
      const scaleY = pd.originalHeight / pd.height
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
      estado.updateAnnotation(
        doc.doc_id, resizingAnnRight.id,
        geometriaRedimensionada(annAlEmpezar, resizingAnnRight.corner, deltaX * scaleX, deltaY * scaleY, inicio),
      )
    }
    const handleUp = () => {
      if (annsAlEmpezar && docIdAlEmpezar) usePdfStore.getState().commitAnnotationGesture(docIdAlEmpezar, annsAlEmpezar)
      setResizingAnnRight(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnnRight, svgRightRef])

  return { resizingAnnRight, setResizingAnnRight }
}
