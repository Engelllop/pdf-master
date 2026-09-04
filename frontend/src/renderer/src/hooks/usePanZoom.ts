import { useRef, useCallback, useState, useEffect } from 'react'
import { type PdfState } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'

export function usePanZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  activeDoc: PdfState['docs'][number] | undefined,
  pageData: { width: number; height: number; originalWidth: number } | null,
) {
  const { setZoom, nextPage, prevPage, activeTool, wheelMode } = useStoreSlice('setZoom', 'nextPage', 'prevPage', 'activeTool', 'wheelMode')

  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number } | null>(null)
  const scrollStart = useRef<{ left: number; top: number } | null>(null)
  const lastScrollDir = useRef<'up' | 'down' | null>(null)
  const isChangingPage = useRef(false)

  // Window-level pan listeners so dragging works even when mouse leaves the SVG
  useEffect(() => {
    if (!isPanning) return
    const handleMove = (e: MouseEvent) => {
      if (!panStart.current || !scrollStart.current || !containerRef.current) return
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      containerRef.current.scrollLeft = scrollStart.current.left - dx
      containerRef.current.scrollTop = scrollStart.current.top - dy
    }
    const handleUp = () => {
      setIsPanning(false)
      panStart.current = null
      scrollStart.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isPanning, containerRef])

  const startPan = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return
    setIsPanning(true)
    panStart.current = { x: clientX, y: clientY }
    scrollStart.current = {
      left: containerRef.current.scrollLeft,
      top: containerRef.current.scrollTop,
    }
  }, [containerRef])

  const stopPan = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
    scrollStart.current = null
  }, [])

  // Ctrl + Wheel = Zoom towards pointer
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!activeDoc || !containerRef.current || !pageData) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      const oldZoom = activeDoc.zoom
      const newZoom = Math.max(0.1, Math.min(8, oldZoom + delta))
      if (newZoom === oldZoom) return

      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const renderScale = pageData.originalWidth > 0 ? pageData.width / pageData.originalWidth : 1
      const oldScale = oldZoom / renderScale
      const newScale = newZoom / renderScale
      const oldDisplayWidth = pageData.width * oldScale
      const oldDisplayHeight = pageData.height * oldScale
      const newDisplayWidth = pageData.width * newScale
      const newDisplayHeight = pageData.height * newScale

      const contentX = container.scrollLeft + mouseX
      const contentY = container.scrollTop + mouseY

      const fracX = oldDisplayWidth > 0 ? contentX / oldDisplayWidth : 0
      const fracY = oldDisplayHeight > 0 ? contentY / oldDisplayHeight : 0

      setZoom(activeDoc.doc_id, newZoom)

      requestAnimationFrame(() => {
        if (!containerRef.current) return
        const c = containerRef.current
        c.scrollLeft = fracX * newDisplayWidth - mouseX
        c.scrollTop = fracY * newDisplayHeight - mouseY
      })
      return
    }
    if (wheelMode === 'scroll' || isChangingPage.current || activeTool) return
    const el = containerRef.current
    const isAtBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 5
    const isAtTop = el.scrollTop <= 0

    if (e.deltaY > 0 && isAtBottom) {
      if (activeDoc.currentPage >= activeDoc.page_count - 1) return // ya en la última: no saltar arriba
      e.preventDefault()
      isChangingPage.current = true
      nextPage(activeDoc.doc_id)
      el.scrollTo({ top: 0, behavior: 'auto' })
      setTimeout(() => { isChangingPage.current = false }, 300)
    } else if (e.deltaY < 0 && isAtTop && lastScrollDir.current === 'up') {
      if (activeDoc.currentPage <= 0) return // ya en la primera: no saltar al fondo
      e.preventDefault()
      isChangingPage.current = true
      prevPage(activeDoc.doc_id)
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'auto' })
        }
        isChangingPage.current = false
      }, 50)
    }
    lastScrollDir.current = e.deltaY > 0 ? 'down' : 'up'
  }, [activeDoc, pageData, setZoom, nextPage, prevPage, activeTool, wheelMode, containerRef])

  return {
    isPanning,
    startPan,
    stopPan,
    handleWheel,
  }
}
