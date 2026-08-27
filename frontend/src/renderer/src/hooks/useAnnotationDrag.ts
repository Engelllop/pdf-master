import { useEffect, useRef, useState } from 'react'
import { type Annotation } from '../store/usePdfStore'
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
    'selectedAnnotationId', 'selectedAnnotationIds', 'selectAnnotation', 'updateAnnotation',
    'commitAnnotationGesture',
    'moveAnnotations', 'activeTool', 'docs', 'getAnnotationsForPage',
  )
  const { selectAnnotation, updateAnnotation, moveAnnotations, commitAnnotationGesture } = store

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

  // Window-level annotation drag listeners
  useEffect(() => {
    if (!draggingAnn) return
    // Foto de las marcas al empezar el gesto: las deps del efecto son [draggingAnn],
    // así que `store.docs` es el del render en que arrancó el arrastre.
    const antes = store.docs.find((d) => d.doc_id === activeDocId)?.annotations ?? null
    const handleMove = (e: MouseEvent) => {
      if (!svgRef.current || !pageData) return
      const { x: svgX, y: svgY } = localPointFromClient(svgRef.current, e.clientX, e.clientY, pageData.width)
      const newX = svgX - draggingAnn.offsetX
      const newY = svgY - draggingAnn.offsetY

      const pdfX = newX * (pageData.originalWidth / pageData.width)
      const pdfY = newY * (pageData.originalHeight / pageData.height)

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === draggingAnn.id)
      if (!ann) return

      const group = groupDragRef.current
      if (group) {
        moveAnnotations(doc.doc_id, group.ids, pdfX - group.lastX, pdfY - group.lastY)
        group.lastX = pdfX
        group.lastY = pdfY
        return
      }
      moveAnnotations(doc.doc_id, [draggingAnn.id], pdfX - ann.x, pdfY - ann.y)
    }
    const handleUp = () => {
      if (antes && activeDocId) commitAnnotationGesture(activeDocId, antes)
      setDraggingAnn(null)
      groupDragRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [draggingAnn])

  // Window-level annotation resize listeners (8-directional)
  useEffect(() => {
    if (!resizingAnn) return
    const antes = store.docs.find((d) => d.doc_id === activeDocId)?.annotations ?? null
    const handleMove = (e: MouseEvent) => {
      if (!svgRef.current || !pageData) return
      const { x: svgX, y: svgY } = localPointFromClient(svgRef.current, e.clientX, e.clientY, pageData.width)
      const deltaX = svgX - resizingAnn.startX
      const deltaY = svgY - resizingAnn.startY

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === resizingAnn.id)
      if (!ann) return
      const scaleX = pageData.originalWidth / pageData.width
      const scaleY = pageData.originalHeight / pageData.height
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
      updateAnnotation(
        doc.doc_id, resizingAnn.id,
        geometriaRedimensionada(ann, resizingAnn.corner, deltaX * scaleX, deltaY * scaleY, inicio),
      )
    }
    const handleUp = () => {
      if (antes && activeDocId) commitAnnotationGesture(activeDocId, antes)
      setResizingAnn(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnn])

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
