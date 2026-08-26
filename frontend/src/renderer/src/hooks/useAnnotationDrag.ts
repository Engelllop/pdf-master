import { useEffect, useRef, useState } from 'react'
import { type Annotation } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'
import { localPointFromClient } from '../lib/svgPoint'

export type ResizeCorner = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export function useAnnotationDrag(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number } | null,
  toScreenCoords: (pdfX: number, pdfY: number) => { x: number; y: number },
  getAnnotationBounds: (ann: Annotation, pageData: { width: number; height: number; originalWidth: number; originalHeight: number }, toScreen: (x: number, y: number) => { x: number; y: number }) => { x: number; y: number; w: number; h: number } | null,
) {
  const store = useStoreSlice(
    'selectedAnnotationId', 'selectedAnnotationIds', 'selectAnnotation', 'updateAnnotation',
    'moveAnnotations', 'activeTool', 'docs', 'getAnnotationsForPage',
  )
  const { selectAnnotation, updateAnnotation, moveAnnotations } = store

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

      let newX = ann.x
      let newY = ann.y
      let newW = ann.width || 0
      let newH = ann.height || 0

      const dx = deltaX * scaleX
      const dy = deltaY * scaleY
      // Los valores de arranque llegan en px del bitmap (los mide SelectionOverlay sobre
      // el SVG) y aquí se escribe en puntos PDF: sumarlos a `dx` sin convertir hacía que
      // la marca saltara al tamaño del bitmap en cuanto el rasterizado no era 1:1 — que
      // es lo normal en pantallas con escalado de Windows.
      const startW = resizingAnn.startW * scaleX
      const startH = resizingAnn.startH * scaleY
      const startBoundsX = resizingAnn.startBoundsX * scaleX
      const startBoundsY = resizingAnn.startBoundsY * scaleY

      // Un cuadro de texto encogido a 10 pt deja de mostrar nada y parece que
      // "desaparecio": el minimo depende del cuerpo de la letra.
      const fs = ann.fontSize || 14
      const MIN = (ann.type === 'text' || ann.type === 'callout') ? fs * 2.5 : 10

      switch (resizingAnn.corner) {
        case 'se':
          newW = Math.max(MIN, startW + dx)
          newH = Math.max(MIN, startH + dy)
          break
        case 'nw':
          newW = Math.max(MIN, startW - dx)
          newH = Math.max(MIN, startH - dy)
          newX = startBoundsX + (startW - newW)
          newY = startBoundsY + (startH - newH)
          break
        case 'ne':
          newW = Math.max(MIN, startW + dx)
          newH = Math.max(MIN, startH - dy)
          newY = startBoundsY + (startH - newH)
          break
        case 'sw':
          newW = Math.max(MIN, startW - dx)
          newH = Math.max(MIN, startH + dy)
          newX = startBoundsX + (startW - newW)
          break
        case 'n':
          newH = Math.max(MIN, startH - dy)
          newY = startBoundsY + (startH - newH)
          break
        case 's':
          newH = Math.max(MIN, startH + dy)
          break
        case 'e':
          newW = Math.max(MIN, startW + dx)
          break
        case 'w':
          newW = Math.max(MIN, startW - dx)
          newX = startBoundsX + (startW - newW)
          break
      }

      const isCorner = resizingAnn.corner === 'nw' || resizingAnn.corner === 'ne' ||
        resizingAnn.corner === 'sw' || resizingAnn.corner === 'se'

      // For circle, enforce perfect circle
      if (ann.type === 'circle' && isCorner) {
        const size = Math.min(newW, newH)
        newW = size
        newH = size
      }

      // Las esquinas de una imagen mantienen su proporción (los lados siguen libres):
      // arrastrar la esquina la deformaba y no había vuelta atrás.
      if (ann.type === 'image' && isCorner && startW > 0 && startH > 0) {
        const ratio = startH / startW
        if (newW * ratio > newH) newW = newH / ratio
        else newH = newW * ratio
        if (resizingAnn.corner === 'nw' || resizingAnn.corner === 'sw') {
          newX = startBoundsX + (startW - newW)
        }
        if (resizingAnn.corner === 'nw' || resizingAnn.corner === 'ne') {
          newY = startBoundsY + (startH - newH)
        }
      }

      updateAnnotation(doc.doc_id, resizingAnn.id, { x: newX, y: newY, width: newW, height: newH })
    }
    const handleUp = () => {
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
