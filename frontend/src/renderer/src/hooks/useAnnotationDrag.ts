import { useEffect, useState } from 'react'
import { type Annotation } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'

export type ResizeCorner = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export function useAnnotationDrag(
  svgRef: React.RefObject<SVGSVGElement | null>,
  activeDocId: string | null,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number } | null,
  toScreenCoords: (pdfX: number, pdfY: number) => { x: number; y: number },
  getAnnotationBounds: (ann: Annotation, pageData: { width: number; height: number; originalWidth: number; originalHeight: number }, toScreen: (x: number, y: number) => { x: number; y: number }) => { x: number; y: number; w: number; h: number } | null,
) {
  const store = useStoreSlice(
    'selectedAnnotationId', 'selectAnnotation', 'updateAnnotation',
    'activeTool', 'docs', 'getAnnotationsForPage',
  )
  const { selectedAnnotationId, selectAnnotation, updateAnnotation } = store

  const [draggingAnn, setDraggingAnn] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
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
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      const svgY = e.clientY - rect.top
      const newX = svgX - draggingAnn.offsetX
      const newY = svgY - draggingAnn.offsetY

      if (!pageData) return
      const pdfX = newX * (pageData.originalWidth / pageData.width)
      const pdfY = newY * (pageData.originalHeight / pageData.height)

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === draggingAnn.id)
      if (!ann) return
      updateAnnotation(doc.doc_id, draggingAnn.id, { x: pdfX, y: pdfY })
    }
    const handleUp = () => {
      setDraggingAnn(null)
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
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      const svgY = e.clientY - rect.top
      const deltaX = svgX - resizingAnn.startX
      const deltaY = svgY - resizingAnn.startY

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === resizingAnn.id)
      if (!ann) return
      const scaleX = pageData ? pageData.originalWidth / pageData.width : 1
      const scaleY = pageData ? pageData.originalHeight / pageData.height : 1

      let newX = ann.x
      let newY = ann.y
      let newW = ann.width || 0
      let newH = ann.height || 0

      const dx = deltaX * scaleX
      const dy = deltaY * scaleY

      switch (resizingAnn.corner) {
        case 'se':
          newW = Math.max(10, resizingAnn.startW + dx)
          newH = Math.max(10, resizingAnn.startH + dy)
          break
        case 'nw':
          newW = Math.max(10, resizingAnn.startW - dx)
          newH = Math.max(10, resizingAnn.startH - dy)
          newX = resizingAnn.startBoundsX + (resizingAnn.startW - newW)
          newY = resizingAnn.startBoundsY + (resizingAnn.startH - newH)
          break
        case 'ne':
          newW = Math.max(10, resizingAnn.startW + dx)
          newH = Math.max(10, resizingAnn.startH - dy)
          newY = resizingAnn.startBoundsY + (resizingAnn.startH - newH)
          break
        case 'sw':
          newW = Math.max(10, resizingAnn.startW - dx)
          newH = Math.max(10, resizingAnn.startH + dy)
          newX = resizingAnn.startBoundsX + (resizingAnn.startW - newW)
          break
        case 'n':
          newH = Math.max(10, resizingAnn.startH - dy)
          newY = resizingAnn.startBoundsY + (resizingAnn.startH - newH)
          break
        case 's':
          newH = Math.max(10, resizingAnn.startH + dy)
          break
        case 'e':
          newW = Math.max(10, resizingAnn.startW + dx)
          break
        case 'w':
          newW = Math.max(10, resizingAnn.startW - dx)
          newX = resizingAnn.startBoundsX + (resizingAnn.startW - newW)
          break
      }

      // For circle, enforce perfect circle
      if (ann.type === 'circle') {
        const size = Math.min(newW, newH)
        if (resizingAnn.corner === 'nw' || resizingAnn.corner === 'ne' || resizingAnn.corner === 'sw' || resizingAnn.corner === 'se') {
          newW = size
          newH = size
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
    if (store.activeTool) return false

    if (selectedAnnotationId) {
      const ann = annotations.find((a) => a.id === selectedAnnotationId)
      if (ann) {
        const bounds = getAnnotationBounds(ann, pageData, toScreenCoords)
        if (bounds && svgPoint.x >= bounds.x && svgPoint.x <= bounds.x + bounds.w && svgPoint.y >= bounds.y && svgPoint.y <= bounds.y + bounds.h) {
          setDraggingAnn({ id: ann.id, offsetX: svgPoint.x - bounds.x, offsetY: svgPoint.y - bounds.y })
          return true
        }
      }
      // Click outside selected annotation -> deselect
      selectAnnotation(activeDoc.doc_id, null)
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
