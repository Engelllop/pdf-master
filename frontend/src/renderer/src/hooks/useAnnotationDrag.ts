import { useEffect, useRef, useState } from 'react'
import { usePdfStore, type Annotation } from '../store/usePdfStore'
import { geometriaRedimensionada, type ResizeCorner } from '../lib/resizeGeometry'
import { useStoreSlice } from './useStoreSlice'
import { localPointFromClient } from '../lib/svgPoint'

export type { ResizeCorner } from '../lib/resizeGeometry'

export function useAnnotationDrag(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number } | null,
  toScreenCoords: (pdfX: number, pdfY: number) => { x: number; y: number },
  /** Se le inyecta `getInteractiveBounds`: los bounds crudos de una cota horizontal
   * tienen alto 0 y no dejaban dónde pinchar para arrastrarla. */
  getAnnotationBounds: (ann: Annotation, pageData: { width: number; height: number; originalWidth: number; originalHeight: number }, toScreen: (x: number, y: number) => { x: number; y: number }) => { x: number; y: number; w: number; h: number } | null,
) {
  const store = useStoreSlice(
    'selectedAnnotationId', 'selectedAnnotationIds', 'selectAnnotation',
    'activeTool', 'docs', 'getAnnotationsForPage',
  )
  // Las que MUTAN durante el gesto se piden por `getState()` dentro del handler, no
  // acá: si vienen del slice, viajan en el closure y arrastran con ellas el `docs`
  // viejo del render en que arrancó el arrastre.
  const { selectAnnotation } = store

  const [draggingAnn, setDraggingAnn] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // Arrastre en grupo: se aplican deltas incrementales a todas las marcas
  // seleccionadas (mover solo x/y de una no serviría para dibujos ni polígonos).
  const groupDragRef = useRef<{ ids: string[]; lastX: number; lastY: number } | null>(null)
  const [resizingAnn, setResizingAnn] = useState<{
    id: string; corner: ResizeCorner;
    startX: number; startY: number;
    startW: number; startH: number;
    startBoundsX: number; startBoundsY: number;
  } | null>(null)

  const activeDoc = store.docs.find((d) => d.doc_id === activeDocId)
  const annotations = activeDoc && pageData
    ? store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage)
    : []

  // Los listeners de gesto viven en `window` y el efecto solo se re-suscribe al
  // empezar y al terminar el arrastre, así que TODO lo que lean tiene que venir de
  // una fuente viva: el store por `getState()` y los props por este ref.
  //
  // Leyéndolos del closure —como estaba— `ann.x` se quedaba clavada en la posición
  // del mousedown durante todo el gesto, y `moveAnnotations` aplica DELTAS: el delta
  // se acumulaba y la marca se escapaba del cursor cuadráticamente (cinco pasos de
  // 50 px la dejaban 500 px más allá). Los dos tests que había hacían UN solo
  // mousemove, que es el único caso en que el bug no se ve.
  const vivo = useRef({ activeDocId, pageData })
  vivo.current = { activeDocId, pageData }

  // Window-level annotation drag listeners
  useEffect(() => {
    if (!draggingAnn) return
    // Foto de las marcas al empezar el gesto, para el undo de un gesto entero.
    const docIdAlEmpezar = vivo.current.activeDocId
    const antes = usePdfStore.getState().docs.find((d) => d.doc_id === docIdAlEmpezar)?.annotations ?? null
    const handleMove = (e: MouseEvent) => {
      const { activeDocId: docId, pageData: pd } = vivo.current
      if (!svgRef.current || !pd) return
      const { x: svgX, y: svgY } = localPointFromClient(svgRef.current, e.clientX, e.clientY, pd.width)
      const newX = svgX - draggingAnn.offsetX
      const newY = svgY - draggingAnn.offsetY

      const pdfX = newX * (pd.originalWidth / pd.width)
      const pdfY = newY * (pd.originalHeight / pd.height)

      const estado = usePdfStore.getState()
      const doc = estado.docs.find((d) => d.doc_id === docId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === draggingAnn.id)
      if (!ann) return

      const group = groupDragRef.current
      if (group) {
        estado.moveAnnotations(doc.doc_id, group.ids, pdfX - group.lastX, pdfY - group.lastY)
        group.lastX = pdfX
        group.lastY = pdfY
        return
      }
      estado.moveAnnotations(doc.doc_id, [draggingAnn.id], pdfX - ann.x, pdfY - ann.y)
    }
    const handleUp = () => {
      if (antes && docIdAlEmpezar) usePdfStore.getState().commitAnnotationGesture(docIdAlEmpezar, antes)
      setDraggingAnn(null)
      groupDragRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [draggingAnn, svgRef])

  // Window-level annotation resize listeners (8-directional)
  //
  // A diferencia del arrastre, el redimensionado NO puede leer la marca viva: parte de
  // una caja de origen (`start*`) y un delta absoluto desde el mousedown, y
  // `geometriaRedimensionada` escala los `points` con un factor ACUMULADO respecto de
  // esa caja. Con los puntos ya escalados del paso anterior, el factor se aplica otra
  // vez encima y el trazo se dispara (un +100 px en cuatro pasos llevaba un punto de
  // 300 a 756). Así que aquí la foto del arranque es deliberada, y se toma explícita
  // en vez de depender de que el closure quede viejo.
  useEffect(() => {
    if (!resizingAnn) return
    const docIdAlEmpezar = vivo.current.activeDocId
    const annsAlEmpezar = usePdfStore.getState().docs.find((d) => d.doc_id === docIdAlEmpezar)?.annotations ?? null
    const annAlEmpezar = annsAlEmpezar?.find((a) => a.id === resizingAnn.id) ?? null
    const handleMove = (e: MouseEvent) => {
      const { activeDocId: docId, pageData: pd } = vivo.current
      if (!svgRef.current || !pd || !annAlEmpezar) return
      const { x: svgX, y: svgY } = localPointFromClient(svgRef.current, e.clientX, e.clientY, pd.width)
      const deltaX = svgX - resizingAnn.startX
      const deltaY = svgY - resizingAnn.startY

      const estado = usePdfStore.getState()
      const doc = estado.docs.find((d) => d.doc_id === docId)
      // La marca puede haber desaparecido a mitad del gesto (Ctrl+Z en la otra mano):
      // se comprueba contra el estado vivo, pero la geometría sale de la foto.
      if (!doc || !doc.annotations.some((a) => a.id === resizingAnn.id)) return
      const scaleX = pd.originalWidth / pd.width
      const scaleY = pd.originalHeight / pd.height
      // Los valores de arranque llegan en px del bitmap (los mide SelectionOverlay sobre
      // el SVG) y aquí se escribe en puntos PDF: sumarlos a `dx` sin convertir hacía que
      // la marca saltara al tamaño del bitmap en cuanto el rasterizado no era 1:1 — que
      // es lo normal en pantallas con escalado de Windows.
      const inicio = {
        x: resizingAnn.startBoundsX * scaleX,
        y: resizingAnn.startBoundsY * scaleY,
        w: resizingAnn.startW * scaleX,
        h: resizingAnn.startH * scaleY,
      }
      estado.updateAnnotation(
        doc.doc_id, resizingAnn.id,
        geometriaRedimensionada(annAlEmpezar, resizingAnn.corner, deltaX * scaleX, deltaY * scaleY, inicio),
      )
    }
    const handleUp = () => {
      if (annsAlEmpezar && docIdAlEmpezar) usePdfStore.getState().commitAnnotationGesture(docIdAlEmpezar, annsAlEmpezar)
      setResizingAnn(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnn, svgRef])

  const handleMouseDown = (_e: React.MouseEvent, svgPoint: { x: number; y: number }) => {
    if (!activeDoc || !pageData) return false
    // La herramienta Seleccionar también arrastra; el resto dibujan.
    if (store.activeTool && store.activeTool !== 'select') return false

    const selectedIds = store.selectedAnnotationIds
    if (selectedIds.length > 0) {
      // Basta con pinchar dentro de CUALQUIERA de las seleccionadas para mover el grupo.
      const hit = annotations.find((a) => {
        if (!selectedIds.includes(a.id)) return false
        const b = getAnnotationBounds(a, pageData, toScreenCoords)
        return !!b && svgPoint.x >= b.x && svgPoint.x <= b.x + b.w && svgPoint.y >= b.y && svgPoint.y <= b.y + b.h
      })
      if (hit) {
        const bounds = getAnnotationBounds(hit, pageData, toScreenCoords)!
        if (selectedIds.length > 1) {
          groupDragRef.current = {
            ids: selectedIds,
            lastX: svgPoint.x * (pageData.originalWidth / pageData.width),
            lastY: svgPoint.y * (pageData.originalHeight / pageData.height),
          }
        }
        setDraggingAnn({ id: hit.id, offsetX: svgPoint.x - bounds.x, offsetY: svgPoint.y - bounds.y })
        return true
      }
      // Clic fuera de la selección -> deseleccionar (la marquesina lo gestiona aparte)
      if (store.activeTool !== 'select') selectAnnotation(activeDoc.doc_id, null)
    }
    return false
  }

  return {
    draggingAnn,
    resizingAnn,
    setResizingAnn,
    handleMouseDown,
  }
}
