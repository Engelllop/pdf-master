import { useRef, useCallback, useState, useEffect } from 'react'
import { usePdfStore, type Annotation } from '../store/usePdfStore'
import { usePageLoader } from '../hooks/usePageLoader'
import { usePanZoom } from '../hooks/usePanZoom'
import { useAnnotationDraw } from '../hooks/useAnnotationDraw'
import { useAnnotationDrag } from '../hooks/useAnnotationDrag'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useAutoSave } from '../hooks/useAutoSave'
import { useFileDrop } from '../hooks/useFileDrop'
import { useContextMenu } from '../hooks/useContextMenu'
import { useFormFields } from '../hooks/useFormFields'
import { useThemeClasses } from '../hooks/useThemeClasses'
import DetailTile from './DetailTile'
import { openDocument } from '../lib/openDocument'
import { Loader2, MessageSquare } from 'lucide-react'

const API_BASE = 'http://localhost:8745'

// If the page bitmap <img> fails to load directly from the backend URL, fetch it
// (the same mechanism the thumbnails use, which works) and swap in a blob: URL.
// This self-heals the "blank page / broken image" issue and logs the real cause so
// it shows up in backend.log via the main process console forwarder.
async function recoverImage(img: HTMLImageElement, url: string): Promise<void> {
  if (img.dataset.recoveringUrl === url) return // one retry per distinct page URL
  img.dataset.recoveringUrl = url
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`PAGEIMG HTTP ${res.status} ${url}`)
      return
    }
    const blob = await res.blob()
    const prev = img.dataset.blobUrl
    const objectUrl = URL.createObjectURL(blob)
    img.dataset.blobUrl = objectUrl
    img.src = objectUrl
    if (prev) URL.revokeObjectURL(prev)
  } catch (err) {
    console.error(`PAGEIMG FETCH-FAIL ${url} ${(err as Error)?.message || err}`)
  }
}

interface SpanItem { text: string; x0: number; y0: number; x1: number; y1: number; size: number }

// Invisible, selectable text layer overlaid on the page bitmap (PDF.js-style).
// The container is pointer-events:none so empty areas fall through to the annotation
// SVG below; individual spans capture pointer events only when no tool is active.
function TextLayer({ docId, page, pageData, active }: {
  docId: string
  page: number
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number }
  active: boolean
}) {
  const [spans, setSpans] = useState<SpanItem[]>([])
  useEffect(() => {
    const c = new AbortController()
    fetch(`${API_BASE}/pdf/spans/${docId}/${page}`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.spans) setSpans(d.spans) })
      .catch(() => {})
    return () => { c.abort(); setSpans([]) }
  }, [docId, page])
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  return (
    <div className="absolute top-0 left-0" style={{ width: pageData.width, height: pageData.height, pointerEvents: 'none', zIndex: 22, userSelect: 'text' }}>
      {spans.map((s, i) => {
        const h = (s.y1 - s.y0) * sy
        return (
          <span key={i} style={{
            position: 'absolute',
            left: s.x0 * sx,
            top: s.y0 * sy,
            width: (s.x1 - s.x0) * sx,
            height: h,
            fontSize: h * 0.82,
            lineHeight: `${h}px`,
            color: 'transparent',
            whiteSpace: 'pre',
            overflow: 'hidden',
            cursor: 'text',
            pointerEvents: active ? 'auto' : 'none',
          }}>{s.text}</span>
        )
      })}
    </div>
  )
}

function getAnnotationBounds(
  ann: Annotation,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number },
  toScreen: (x: number, y: number) => { x: number; y: number },
): { x: number; y: number; w: number; h: number } | null {
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  switch (ann.type) {
    case 'highlight':
    case 'rect':
    case 'circle': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 0) * sx, h: (ann.height || 0) * sy }
    }
    case 'underline':
    case 'strikethrough': {
      const s = toScreen(ann.x, ann.y)
      const h = (ann.height || 16) * sy
      return { x: s.x, y: s.y, w: (ann.width || 0) * sx, h }
    }
    case 'text': {
      const s = toScreen(ann.x, ann.y)
      const fs = (ann.fontSize || 14)
      const tw = ann.width ? ann.width * sx : Math.max(80, (ann.text?.length || 4) * fs * 0.55) * sx
      const th = ann.height ? ann.height * sy : Math.max(24, fs * 1.4) * sy
      return { x: s.x, y: s.y, w: tw, h: th }
    }
    case 'note': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 28) * sx, h: (ann.height || 28) * sy }
    }
    case 'image': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 200) * sx, h: (ann.height || 150) * sy }
    }
    case 'arrow': {
      const s1 = toScreen(ann.x, ann.y)
      const s2 = toScreen(ann.x + (ann.width || 0), ann.y + (ann.height || 0))
      return { x: Math.min(s1.x, s2.x), y: Math.min(s1.y, s2.y), w: Math.abs(s2.x - s1.x), h: Math.abs(s2.y - s1.y) }
    }
    case 'draw': {
      if (!ann.points || ann.points.length === 0) return null
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    }
    default:
      return null
  }
}

export default function Viewer() {
  const tc = useThemeClasses()
  const store = usePdfStore()
  const {
    docs, activeDocId,
    setViewerSize, selectAnnotation, deleteAnnotation, addBookmark,
  } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const svgRightRef = useRef<SVGSVGElement>(null)

  // Rotation drag state
  const [rotatingAnn, setRotatingAnn] = useState<{ id: string; startAngle: number; startRotation: number; centerX: number; centerY: number } | null>(null)

  // Page loading
  const {
    loading, pageData, loadingRight, pageDataRight, pageText, pageTextRight,
  } = usePageLoader()

  // Pan & zoom
  const { isPanning, startPan, handleWheel } = usePanZoom(containerRef, activeDoc, pageData)

  const handleScroll = () => {
    const c = containerRef.current
    if (!c) return
    store.setViewerScroll({
      left: c.scrollLeft,
      top: c.scrollTop,
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
      scrollWidth: c.scrollWidth,
      scrollHeight: c.scrollHeight,
    })
  }

  // Annotation drawing
  const {
    drawPreview, drawPoints,
    noteText, setNoteText, notePos, setNotePos,
    textInput, setTextInput, textPos, setTextPos,
    handleMouseDown: handleDrawMouseDown, handleMouseMove: handleDrawMouseMove, handleMouseUp: handleDrawMouseUp,
    saveNote, saveText, cancelDraw,
    drawingArea, closeArea,
  } = useAnnotationDraw(activeDoc, pageData)

  // Coordinate helpers
  const toScreenCoords = useCallback((pdfX: number, pdfY: number) => {
    if (!pageData) return { x: 0, y: 0 }
    return {
      x: pdfX * (pageData.width / pageData.originalWidth),
      y: pdfY * (pageData.height / pageData.originalHeight),
    }
  }, [pageData])

  const toScreenCoordsRight = useCallback((pdfX: number, pdfY: number) => {
    if (!pageDataRight) return { x: 0, y: 0 }
    return {
      x: pdfX * (pageDataRight.width / pageDataRight.originalWidth),
      y: pdfY * (pageDataRight.height / pageDataRight.originalHeight),
    }
  }, [pageDataRight])

  const getSvgPoint = (e: React.MouseEvent) => ({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })

  // Annotation drag & resize (left page)
  const {
    setResizingAnn, handleMouseDown: handleDragMouseDown,
  } = useAnnotationDrag(svgRef, activeDocId, pageData, toScreenCoords, getAnnotationBounds)

  // Resize state for right page
  const [resizingAnnRight, setResizingAnnRight] = useState<{
    id: string; corner: import('../hooks/useAnnotationDrag').ResizeCorner;
    startX: number; startY: number;
    startW: number; startH: number;
    startBoundsX: number; startBoundsY: number;
  } | null>(null)

  // Window-level resize listener for right page
  useEffect(() => {
    if (!resizingAnnRight) return
    const handleMove = (e: MouseEvent) => {
      if (!svgRightRef.current) return
      const rect = svgRightRef.current.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      const svgY = e.clientY - rect.top
      const deltaX = svgX - resizingAnnRight.startX
      const deltaY = svgY - resizingAnnRight.startY

      const doc = store.docs.find((d) => d.doc_id === activeDocId)
      if (!doc) return
      const ann = doc.annotations.find((a) => a.id === resizingAnnRight.id)
      if (!ann) return
      const scaleX = pageDataRight ? pageDataRight.originalWidth / pageDataRight.width : 1
      const scaleY = pageDataRight ? pageDataRight.originalHeight / pageDataRight.height : 1

      let newX = ann.x
      let newY = ann.y
      let newW = ann.width || 0
      let newH = ann.height || 0

      const dx = deltaX * scaleX
      const dy = deltaY * scaleY

      switch (resizingAnnRight.corner) {
        case 'se':
          newW = Math.max(10, resizingAnnRight.startW + dx)
          newH = Math.max(10, resizingAnnRight.startH + dy)
          break
        case 'nw':
          newW = Math.max(10, resizingAnnRight.startW - dx)
          newH = Math.max(10, resizingAnnRight.startH - dy)
          newX = resizingAnnRight.startBoundsX + (resizingAnnRight.startW - newW)
          newY = resizingAnnRight.startBoundsY + (resizingAnnRight.startH - newH)
          break
        case 'ne':
          newW = Math.max(10, resizingAnnRight.startW + dx)
          newH = Math.max(10, resizingAnnRight.startH - dy)
          newY = resizingAnnRight.startBoundsY + (resizingAnnRight.startH - newH)
          break
        case 'sw':
          newW = Math.max(10, resizingAnnRight.startW - dx)
          newH = Math.max(10, resizingAnnRight.startH + dy)
          newX = resizingAnnRight.startBoundsX + (resizingAnnRight.startW - newW)
          break
        case 'n':
          newH = Math.max(10, resizingAnnRight.startH - dy)
          newY = resizingAnnRight.startBoundsY + (resizingAnnRight.startH - newH)
          break
        case 's':
          newH = Math.max(10, resizingAnnRight.startH + dy)
          break
        case 'e':
          newW = Math.max(10, resizingAnnRight.startW + dx)
          break
        case 'w':
          newW = Math.max(10, resizingAnnRight.startW - dx)
          newX = resizingAnnRight.startBoundsX + (resizingAnnRight.startW - newW)
          break
      }

      if (ann.type === 'circle') {
        const size = Math.min(newW, newH)
        if (resizingAnnRight.corner === 'nw' || resizingAnnRight.corner === 'ne' || resizingAnnRight.corner === 'sw' || resizingAnnRight.corner === 'se') {
          newW = size
          newH = size
        }
      }

      store.updateAnnotation(doc.doc_id, resizingAnnRight.id, { x: newX, y: newY, width: newW, height: newH })
    }
    const handleUp = () => setResizingAnnRight(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingAnnRight])

  // Window-level rotation listener
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

  // Keyboard shortcuts
  useKeyboardShortcuts(activeDoc, store.selectedAnnotationId, deleteAnnotation, cancelDraw)

  // Auto-save
  useAutoSave(activeDoc)

  // File drop
  const { isDraggingFile, handleDragOver, handleDragLeave, handleDrop } = useFileDrop()

  // Context menu
  const { contextMenu, openMenu, closeMenu } = useContextMenu()

  // Form fields
  const { fields: formFields, updateField: updateFormField } = useFormFields(activeDoc?.doc_id || null, activeDoc?.currentPage || 0)

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setViewerSize(width, height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setViewerSize])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!activeDoc || !pageData) return
    const pt = getSvgPoint(e)

    // Image annotation tool
    if (store.activeTool === 'image') {
      e.preventDefault()
      if (!store.selectedImageData) {
        store.showToast('Selecciona una imagen primero', 'error')
        store.setActiveTool(null)
        return
      }
      const pdfX = pt.x * (pageData.originalWidth / pageData.width)
      const pdfY = pt.y * (pageData.originalHeight / pageData.height)
      store.addAnnotation(activeDoc.doc_id, {
        id: crypto.randomUUID(),
        type: 'image',
        page: activeDoc.currentPage,
        x: pdfX,
        y: pdfY,
        width: 200,
        height: 150,
        imageData: store.selectedImageData,
      })
      store.setDocDirty(activeDoc.doc_id, true)
      store.showToast('Imagen colocada. Arrastra para mover, esquinas para redimensionar.', 'success')
      store.setActiveTool(null)
      store.setSelectedImagePath(null)
      store.setSelectedImageData(null)
      return
    }

    // Stamp tool
    if (store.activeTool === 'stamp') {
      e.preventDefault()
      const pdfX = pt.x * (pageData.originalWidth / pageData.width)
      const pdfY = pt.y * (pageData.originalHeight / pageData.height)
      fetch(`${API_BASE}/pdf/insert-text/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_num: activeDoc.currentPage,
          x: pdfX,
          y: pdfY,
          text: store.selectedStamp,
          color: store.stampColor,
          fontsize: 24,
        }),
      }).then((res) => {
        if (res.ok) {
          store.setDocDirty(activeDoc.doc_id, true)
          store.invalidatePageCache(activeDoc.doc_id)
          store.invalidateThumbnails(activeDoc.doc_id)
          store.incrementDocVersion(activeDoc.doc_id)
          store.showToast('Sello insertado', 'success')
        } else {
          store.showToast('Error al insertar sello', 'error')
        }
        store.setActiveTool(null)
      })
      return
    }

    // Drawing takes precedence
    if (store.activeTool) {
      e.preventDefault()
      handleDrawMouseDown(pt)
      return
    }

    // Try drag
    const didDrag = handleDragMouseDown(e, pt)
    if (didDrag) return

    // Pan
    startPan(e.clientX, e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) return
    const pt = getSvgPoint(e)
    handleDrawMouseMove(pt)
  }

  const handleMouseUp = () => {
    handleDrawMouseUp()
  }

  // Inline text edit
  const [editingTextAnn, setEditingTextAnn] = useState<string | null>(null)
  const [editTextValue, setEditTextValue] = useState('')

  // Auto-scroll to search result
  useEffect(() => {
    if (!activeDoc || activeDoc.searchIndex < 0 || !containerRef.current || !pageData) return
    const result = activeDoc.searchResults[activeDoc.searchIndex]
    if (!result || result.page !== activeDoc.currentPage) return
    const scale = activeDoc.zoom / (pageData.width / pageData.originalWidth)
    const sx = result.x * (pageData.width / pageData.originalWidth) * scale
    const sy = result.y * (pageData.height / pageData.originalHeight) * scale
    const sw = result.width * (pageData.width / pageData.originalWidth) * scale
    const sh = result.height * (pageData.height / pageData.originalHeight) * scale
    const wrapper = containerRef.current.querySelector('[data-page-wrapper="left"]') as HTMLElement
    if (!wrapper) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    const wrapperLeft = wrapperRect.left - containerRect.left + containerRef.current.scrollLeft
    const wrapperTop = wrapperRect.top - containerRect.top + containerRef.current.scrollTop
    containerRef.current.scrollTo({
      left: wrapperLeft + sx - containerRef.current.clientWidth / 2 + sw / 2,
      top: wrapperTop + sy - containerRef.current.clientHeight / 2 + sh / 2,
      behavior: 'smooth',
    })
  }, [activeDoc?.searchIndex, activeDoc?.currentPage, pageData?.width, pageData?.height])

  // Press Enter to close area measurement polygon
  useEffect(() => {
    if (!drawingArea) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        closeArea()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        store.setActiveTool(null)
        closeArea()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drawingArea, closeArea])

  // Sticky note popup
  const [notePopup, setNotePopup] = useState<{ annId: string; x: number; y: number } | null>(null)
  const [notePopupText, setNotePopupText] = useState('')

  const startEditText = (ann: Annotation) => {
    setEditingTextAnn(ann.id)
    setEditTextValue(ann.text || '')
  }

  const commitEditText = () => {
    if (!editingTextAnn || !activeDoc) return
    store.updateAnnotation(activeDoc.doc_id, editingTextAnn, { text: editTextValue })
    setEditingTextAnn(null)
    setEditTextValue('')
  }

  // Render annotations
  const annotations = activeDoc && pageData ? store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage) : []
  const annotationsRight = activeDoc && pageDataRight ? store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage + 1) : []

  const renderAnnotation = (ann: Annotation, isPreview = false, onSelect?: () => void) => {
    const s = toScreenCoords(ann.x, ann.y)
    const key = isPreview ? 'preview' : ann.id
    const opacity = isPreview ? 0.6 : 0.5
    const clickProps = (!isPreview && onSelect)
      ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect() }, style: { cursor: 'pointer' } }
      : {}

    switch (ann.type) {
      case 'highlight': {
        const w = (ann.width || 0) * (pageData!.width / pageData!.originalWidth)
        const h = (ann.height || 0) * (pageData!.height / pageData!.originalHeight)
        return (
          <rect key={key} x={w < 0 ? s.x + w : s.x} y={h < 0 ? s.y + h : s.y}
            width={Math.abs(w)} height={Math.abs(h)}
            fill={ann.color || '#fbbf24'} fillOpacity={opacity} rx={2} {...clickProps} />
        )
      }
      case 'underline': {
        const ulH = (ann.height || 16) * (pageData!.height / pageData!.originalHeight)
        return (
          <line key={key} x1={s.x} y1={s.y + ulH - 2} x2={s.x + ((ann.width || 0) * (pageData!.width / pageData!.originalWidth))} y2={s.y + ulH - 2}
            stroke={ann.color || '#3b82f6'} strokeWidth={2} {...clickProps} />
        )
      }
      case 'strikethrough': {
        const stH = (ann.height || 16) * (pageData!.height / pageData!.originalHeight)
        return (
          <line key={key} x1={s.x} y1={s.y + stH / 2} x2={s.x + ((ann.width || 0) * (pageData!.width / pageData!.originalWidth))} y2={s.y + stH / 2}
            stroke={ann.color || '#ef4444'} strokeWidth={2} {...clickProps} />
        )
      }
      case 'rect': {
        const w = (ann.width || 0) * (pageData!.width / pageData!.originalWidth)
        const h = (ann.height || 0) * (pageData!.height / pageData!.originalHeight)
        return (
          <rect key={key} x={w < 0 ? s.x + w : s.x} y={h < 0 ? s.y + h : s.y}
            width={Math.abs(w)} height={Math.abs(h)}
            fill="none" stroke={ann.color || '#fff'} strokeWidth={2} rx={2} {...clickProps} />
        )
      }
      case 'circle': {
        const w = (ann.width || 0) * (pageData!.width / pageData!.originalWidth)
        const h = (ann.height || 0) * (pageData!.height / pageData!.originalHeight)
        return (
          <ellipse key={key} cx={s.x + w / 2} cy={s.y + h / 2} rx={Math.abs(w) / 2} ry={Math.abs(h) / 2}
            fill="none" stroke={ann.color || '#fff'} strokeWidth={2} {...clickProps} />
        )
      }
      case 'arrow': {
        const x2 = s.x + ((ann.width || 0) * (pageData!.width / pageData!.originalWidth))
        const y2 = s.y + ((ann.height || 0) * (pageData!.height / pageData!.originalHeight))
        const angle = Math.atan2(y2 - s.y, x2 - s.x)
        const headLen = 10
        const x3 = x2 - headLen * Math.cos(angle - Math.PI / 6)
        const y3 = y2 - headLen * Math.sin(angle - Math.PI / 6)
        const x4 = x2 - headLen * Math.cos(angle + Math.PI / 6)
        const y4 = y2 - headLen * Math.sin(angle + Math.PI / 6)
        return (
          <g key={key} {...clickProps}>
            <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={ann.color || '#fff'} strokeWidth={2} />
            <polygon points={`${x2},${y2} ${x3},${y3} ${x4},${y4}`} fill={ann.color || '#fff'} />
          </g>
        )
      }
      case 'draw':
      case 'signature':
        if (!ann.points || ann.points.length < 2) return null
        const d = ann.points.map((p, i) => {
          const sp = toScreenCoords(p.x, p.y)
          return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
        }).join(' ')
        return <path key={key} d={d} fill="none" stroke={ann.color || '#fff'} strokeWidth={ann.type === 'signature' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" {...clickProps} />
      case 'note': {
        const nw = (ann.width || 24) * (pageData!.width / pageData!.originalWidth)
        const nh = (ann.height || 24) * (pageData!.height / pageData!.originalHeight)
        const iconSize = Math.max(12, Math.min(nw, nh) * 0.6)
        return (
          <g key={key} {...clickProps}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelect) onSelect();
              const screen = toScreenCoords(ann.x, ann.y)
              setNotePopup({ annId: ann.id, x: screen.x, y: screen.y })
              setNotePopupText(ann.text || '')
            }}>
            <rect x={s.x} y={s.y} width={nw} height={nh} fill={ann.color || '#fbbf24'} rx={3} />
            <foreignObject x={s.x} y={s.y} width={nw} height={nh}>
              <div className="flex items-center justify-center w-full h-full pointer-events-none">
                <MessageSquare size={iconSize} color="#000" />
              </div>
            </foreignObject>
          </g>
        )
      }
      case 'text': {
        const fontSize = ann.fontSize || store.textFontSize || 14
        const fontFamily = ann.fontFamily || store.textFontFamily || 'Arial'
        const sx2 = pageData!.width / pageData!.originalWidth
        const sy2 = pageData!.height / pageData!.originalHeight
        // fontSize is stored in PDF points; the SVG lives in bitmap-px space, so the
        // on-screen size scales with zoom exactly like the page (and matches the editor).
        const displayFontSize = fontSize * sx2
        const textWidth = ann.width ? ann.width * sx2 : Math.max(120 * sx2, (ann.text?.length || 4) * displayFontSize * 0.6)
        const textHeight = ann.height ? ann.height * sy2 : Math.max(30 * sy2, displayFontSize * 1.4)
        return (
          <foreignObject key={key} x={s.x} y={s.y} width={textWidth} height={textHeight}
            {...clickProps}
            onDoubleClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(); startEditText(ann); }}>
            <div className="leading-tight select-none" style={{ color: ann.color || '#fff', wordWrap: 'break-word', fontFamily, fontSize: displayFontSize }}>
              {ann.text}
            </div>
          </foreignObject>
        )
      }
      case 'image': {
        const iw = (ann.width || 200) * (pageData!.width / pageData!.originalWidth)
        const ih = (ann.height || 150) * (pageData!.height / pageData!.originalHeight)
        const rot = ann.rotation || 0
        const cx = s.x + iw / 2
        const cy = s.y + ih / 2
        return (
          <g key={key} {...clickProps} transform={`rotate(${rot}, ${cx}, ${cy})`}>
            {ann.imageData ? (
              <image href={ann.imageData} x={s.x} y={s.y} width={iw} height={ih} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <rect x={s.x} y={s.y} width={iw} height={ih} fill="none" stroke={ann.color || '#fff'} strokeWidth={2} strokeDasharray="4 2" />
            )}
          </g>
        )
      }
      case 'measure_distance': {
        const x2 = s.x + ((ann.width || 0) * (pageData!.width / pageData!.originalWidth))
        const y2 = s.y + ((ann.height || 0) * (pageData!.height / pageData!.originalHeight))
        const midX = (s.x + x2) / 2
        const midY = (s.y + y2) / 2
        const angle = Math.atan2(y2 - s.y, x2 - s.x)
        const label = ann.measurement?.label || ''
        return (
          <g key={key} {...clickProps}>
            <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={ann.color || '#22d3ee'} strokeWidth={2} strokeDasharray="6 3" />
            <circle cx={s.x} cy={s.y} r={3} fill={ann.color || '#22d3ee'} />
            <circle cx={x2} cy={y2} r={3} fill={ann.color || '#22d3ee'} />
            <g transform={`translate(${midX}, ${midY}) rotate(${(angle * 180) / Math.PI})`}>
              <rect x={-label.length * 4.5 - 6} y={-12} width={label.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
              <text x={0} y={5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{label}</text>
            </g>
          </g>
        )
      }
      case 'measure_area': {
        if (!ann.points || ann.points.length < 3) return null
        const pts = ann.points.map((p) => toScreenCoords(p.x, p.y))
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        const label = ann.measurement?.label || ''
        // Centroid for label
        let cx = 0, cy = 0
        pts.forEach((p) => { cx += p.x; cy += p.y })
        cx /= pts.length
        cy /= pts.length
        return (
          <g key={key} {...clickProps}>
            <path d={d} fill={ann.color || '#22d3ee'} fillOpacity={0.15} stroke={ann.color || '#22d3ee'} strokeWidth={2} strokeDasharray="4 2" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={ann.color || '#22d3ee'} />
            ))}
            <rect x={cx - label.length * 4.5 - 6} y={cy - 12} width={label.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
            <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{label}</text>
          </g>
        )
      }
      default:
        return null
    }
  }

  // Selection box + 8 resize handles (left page)
  let selectionBox: React.ReactNode = null
  let resizeHandles: React.ReactNode = null
  let rotateHandleLeft: React.ReactNode = null
  let selectionBoxRight: React.ReactNode = null
  let resizeHandlesRight: React.ReactNode = null
  let rotateHandleRight: React.ReactNode = null
  if (store.selectedAnnotationId && pageData && activeDoc) {
    const ann = annotations.find((a) => a.id === store.selectedAnnotationId)
    if (ann) {
      const bounds = getAnnotationBounds(ann, pageData, toScreenCoords)
      if (bounds && bounds.w > 0 && bounds.h > 0) {
        const HANDLE_SIZE = 8
        const hs = HANDLE_SIZE / 2
        const corners = [
          { key: 'nw' as const, x: bounds.x - hs, y: bounds.y - hs, cursor: 'nwse-resize' },
          { key: 'n'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y - hs, cursor: 'ns-resize' },
          { key: 'ne' as const, x: bounds.x + bounds.w - hs, y: bounds.y - hs, cursor: 'nesw-resize' },
          { key: 'e'  as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
          { key: 'se' as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h - hs, cursor: 'nwse-resize' },
          { key: 's'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y + bounds.h - hs, cursor: 'ns-resize' },
          { key: 'sw' as const, x: bounds.x - hs, y: bounds.y + bounds.h - hs, cursor: 'nesw-resize' },
          { key: 'w'  as const, x: bounds.x - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
        ]
        selectionBox = (
          <rect
            x={bounds.x - 4} y={bounds.y - 4}
            width={bounds.w + 8} height={bounds.h + 8}
            fill="none" stroke="#3b82f6" strokeWidth={2}
            strokeDasharray="4 2" rx={4}
            pointerEvents="none"
          />
        )
        resizeHandles = (
          <>
            {corners.map((c) => (
              <rect
                key={c.key}
                x={c.x} y={c.y}
                width={HANDLE_SIZE} height={HANDLE_SIZE}
                fill="#3b82f6" stroke="white" strokeWidth={1}
                style={{ cursor: c.cursor }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setResizingAnn({
                    id: ann.id,
                    corner: c.key,
                    startX: e.nativeEvent.offsetX + c.x,
                    startY: e.nativeEvent.offsetY + c.y,
                    startW: bounds.w,
                    startH: bounds.h,
                    startBoundsX: bounds.x,
                    startBoundsY: bounds.y,
                  })
                }}
              />
            ))}
          </>
        )
        rotateHandleLeft = null
        if (ann.type === 'image') {
          const cx = bounds.x + bounds.w / 2
          const hy = bounds.y - 20
          rotateHandleLeft = (
            <>
              <line x1={cx} y1={bounds.y} x2={cx} y2={hy} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
              <circle
                cx={cx} cy={hy} r={6}
                fill="#10b981" stroke="white" strokeWidth={1}
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  const centerX = bounds.x + bounds.w / 2
                  const centerY = bounds.y + bounds.h / 2
                  const startAngle = Math.atan2(e.nativeEvent.offsetY - centerY, e.nativeEvent.offsetX - centerX)
                  setRotatingAnn({
                    id: ann.id,
                    startAngle,
                    startRotation: ann.rotation || 0,
                    centerX,
                    centerY,
                  })
                }}
              />
            </>
          )
        }
      }
    }
  }

  // Selection box + resize handles for right page
  if (store.selectedAnnotationId && pageDataRight && activeDoc) {
    const ann = annotationsRight.find((a) => a.id === store.selectedAnnotationId)
    if (ann) {
      const bounds = getAnnotationBounds(ann, pageDataRight, toScreenCoordsRight)
      if (bounds && bounds.w > 0 && bounds.h > 0) {
        const HANDLE_SIZE = 8
        const hs = HANDLE_SIZE / 2
        const corners = [
          { key: 'nw' as const, x: bounds.x - hs, y: bounds.y - hs, cursor: 'nwse-resize' },
          { key: 'n'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y - hs, cursor: 'ns-resize' },
          { key: 'ne' as const, x: bounds.x + bounds.w - hs, y: bounds.y - hs, cursor: 'nesw-resize' },
          { key: 'e'  as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
          { key: 'se' as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h - hs, cursor: 'nwse-resize' },
          { key: 's'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y + bounds.h - hs, cursor: 'ns-resize' },
          { key: 'sw' as const, x: bounds.x - hs, y: bounds.y + bounds.h - hs, cursor: 'nesw-resize' },
          { key: 'w'  as const, x: bounds.x - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
        ]
        selectionBoxRight = (
          <rect
            x={bounds.x - 4} y={bounds.y - 4}
            width={bounds.w + 8} height={bounds.h + 8}
            fill="none" stroke="#3b82f6" strokeWidth={2}
            strokeDasharray="4 2" rx={4}
            pointerEvents="none"
          />
        )
        resizeHandlesRight = (
          <>
            {corners.map((c) => (
              <rect
                key={c.key}
                x={c.x} y={c.y}
                width={HANDLE_SIZE} height={HANDLE_SIZE}
                fill="#3b82f6" stroke="white" strokeWidth={1}
                style={{ cursor: c.cursor }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setResizingAnnRight({
                    id: ann.id,
                    corner: c.key,
                    startX: e.nativeEvent.offsetX + c.x,
                    startY: e.nativeEvent.offsetY + c.y,
                    startW: bounds.w,
                    startH: bounds.h,
                    startBoundsX: bounds.x,
                    startBoundsY: bounds.y,
                  })
                }}
              />
            ))}
          </>
        )
        rotateHandleRight = null
        if (ann.type === 'image') {
          const cx = bounds.x + bounds.w / 2
          const hy = bounds.y - 20
          rotateHandleRight = (
            <>
              <line x1={cx} y1={bounds.y} x2={cx} y2={hy} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
              <circle
                cx={cx} cy={hy} r={6}
                fill="#10b981" stroke="white" strokeWidth={1}
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  const centerX = bounds.x + bounds.w / 2
                  const centerY = bounds.y + bounds.h / 2
                  const startAngle = Math.atan2(e.nativeEvent.offsetY - centerY, e.nativeEvent.offsetX - centerX)
                  setRotatingAnn({
                    id: ann.id,
                    startAngle,
                    startRotation: ann.rotation || 0,
                    centerX,
                    centerY,
                  })
                }}
              />
            </>
          )
        }
      }
    }
  }

  const recentFiles = (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[] }
    catch { return [] }
  })()

  if (!activeDoc) {
    return (
      <div ref={containerRef} className={`flex-1 flex flex-col items-center justify-center overflow-auto ${tc('bg-slate-900', 'bg-gray-100')}`}
        onDragOver={handleDragOver} onDrop={handleDrop}>
        <div className="text-center space-y-4">
          <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center border border-dashed ${tc('bg-slate-800 border-slate-700', 'bg-gray-200 border-gray-400')}`}>
            <svg className={`w-10 h-10 ${tc('text-slate-500', 'text-gray-500')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className={`text-xl font-semibold ${tc('text-slate-200', 'text-gray-800')}`}>PDF Master</h2>
            <p className={`mt-1 ${tc('text-slate-400', 'text-gray-500')}`}>Arrastra un PDF aquí o usa el botón Abrir</p>
          </div>
          <p className="text-xs text-slate-600">Ctrl+rueda: zoom | Rueda: cambiar página</p>
          {recentFiles.length > 0 && (
            <div className="text-left max-w-xs mx-auto">
              <p className={`text-xs uppercase tracking-wider mb-2 ${tc('text-slate-500', 'text-gray-500')}`}>Recientes</p>
              <div className="space-y-1">
                {recentFiles.map((path, i) => (
                  <button
                    key={i}
                    onClick={() => { openDocument(path) }}
                    className={`w-full text-left text-xs rounded px-2 py-1 transition-colors truncate ${tc('text-slate-300 hover:text-white hover:bg-slate-800', 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`}
                    title={path}
                  >
                    {path.split(/[\\/]/).pop()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const scale = pageData ? activeDoc.zoom / (pageData.width / pageData.originalWidth) : 1
  const scaleRight = pageDataRight ? activeDoc.zoom / (pageDataRight.width / pageDataRight.originalWidth) : 1
  const displayWidth = pageData ? pageData.width * scale : 0
  const displayHeight = pageData ? pageData.height * scale : 0
  const displayWidthRight = pageDataRight ? pageDataRight.width * scaleRight : 0
  const displayHeightRight = pageDataRight ? pageDataRight.height * scaleRight : 0
  const isDouble = store.viewMode === 'double'

  return (
    <div ref={containerRef} className={`flex-1 overflow-auto relative ${tc('bg-slate-900', 'bg-gray-100')}`}
      onWheel={handleWheel} onScroll={handleScroll} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!activeDoc) return
        openMenu(e.clientX, e.clientY)
      }}
      onClick={closeMenu}>

      {!pageData && loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="animate-spin text-blue-500" size={36} />
        </div>
      )}

      <div className={`relative my-4 flex ${isDouble ? 'gap-4' : ''}`}
        style={{
          width: isDouble ? (displayWidth + displayWidthRight + 16) || 'auto' : displayWidth || 'auto',
          height: Math.max(displayHeight, displayHeightRight) || 'auto',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
        {pageData && (
          <div className="relative" data-page-wrapper="left" style={{ width: displayWidth, height: displayHeight, overflow: 'hidden', flexShrink: 0 }}>
            {loading && (
              <div className={`absolute inset-0 flex items-center justify-center z-20 rounded ${tc('bg-slate-900/80', 'bg-gray-200/80')}`}>
                <Loader2 className="animate-spin text-blue-500" size={32} />
              </div>
            )}
            <div className="relative"
              style={{ width: pageData.width, height: pageData.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <img src={pageData.image} alt={`Página ${activeDoc.currentPage + 1}`}
                className="rounded shadow-lg bg-white block" style={{ width: pageData.width, height: pageData.height }} draggable={false}
                onError={(e) => recoverImage(e.currentTarget, pageData.image)} />

              {/* Crisp deep-zoom overlay for dense plans (single view only) */}
              {!isDouble && (
                <DetailTile docId={activeDoc.doc_id} page={activeDoc.currentPage} pageData={pageData}
                  zoom={activeDoc.zoom} version={activeDoc.docVersion} containerRef={containerRef}
                  scrollKey={`${store.viewerScroll.left}x${store.viewerScroll.top}`} />
              )}

              {/* Form fields overlay */}
              {formFields.length > 0 && (
                <div className="absolute top-0 left-0" style={{ width: pageData.width, height: pageData.height, pointerEvents: 'auto', zIndex: 25 }}>
                  {formFields.map((field) => {
                    const sx = pageData.width / pageData.originalWidth
                    const sy = pageData.height / pageData.originalHeight
                    const style = {
                      position: 'absolute' as const,
                      left: field.rect.x * sx,
                      top: field.rect.y * sy,
                      width: field.rect.width * sx,
                      height: field.rect.height * sy,
                    }
                    const isCheckbox = field.field_type.toLowerCase().includes('check')
                    const isSelect = field.field_type.toLowerCase().includes('combo') || field.field_type.toLowerCase().includes('list')
                    if (isCheckbox) {
                      return (
                        <input key={field.field_name} type="checkbox"
                          checked={field.value === 'Yes' || field.value === 'On'}
                          onChange={(e) => updateFormField(field.field_name, e.target.checked ? 'Yes' : 'Off')}
                          className="accent-blue-600"
                          style={style}
                          title={field.field_name}
                        />
                      )
                    }
                    if (isSelect) {
                      return (
                        <select key={field.field_name}
                          value={field.value}
                          onChange={(e) => updateFormField(field.field_name, e.target.value)}
                          className="bg-white text-black text-xs border border-blue-400 rounded"
                          style={style}
                          title={field.field_name}
                        >
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )
                    }
                    return (
                      <input key={field.field_name} type="text"
                        value={field.value}
                        onChange={(e) => updateFormField(field.field_name, e.target.value)}
                        className="bg-white/90 text-black text-xs border border-blue-400 rounded px-1"
                        style={style}
                        title={field.field_name}
                      />
                    )
                  })}
                </div>
              )}

              {/* Selectable text layer */}
              <TextLayer docId={activeDoc.doc_id} page={activeDoc.currentPage} pageData={pageData} active={!store.activeTool} />

              {/* Annotation SVG Layer */}

              <svg ref={svgRef} width={pageData.width} height={pageData.height}
                className="absolute top-0 left-0"
                style={{ pointerEvents: store.activeTool === 'textselect' ? 'none' : 'auto', cursor: isPanning ? 'grabbing' : store.activeTool ? 'crosshair' : 'grab', zIndex: 20 }}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onDoubleClick={() => { if (drawingArea) closeArea() }}>
                {/* Existing annotations */}
                {annotations.map((ann) => renderAnnotation(ann, false, () => selectAnnotation(activeDoc.doc_id, ann.id)))}

                {/* Preview while drawing */}
                {drawPreview && (drawPreview as any).type !== 'textselect' && renderAnnotation(drawPreview as Annotation, true)}
                {(drawPreview as any)?.type === 'textselect' && drawPreview?.width && (
                  <rect x={toScreenCoords(Math.min(drawPreview.x || 0, (drawPreview.x || 0) + (drawPreview.width || 0)), Math.min(drawPreview.y || 0, (drawPreview.y || 0) + (drawPreview.height || 0))).x}
                    y={toScreenCoords(Math.min(drawPreview.x || 0, (drawPreview.x || 0) + (drawPreview.width || 0)), Math.min(drawPreview.y || 0, (drawPreview.y || 0) + (drawPreview.height || 0))).y}
                    width={Math.abs((drawPreview.width || 0) * (pageData.width / pageData.originalWidth))}
                    height={Math.abs((drawPreview.height || 0) * (pageData.height / pageData.originalHeight))}
                    fill="#10b981" fillOpacity={0.3} stroke="#10b981" strokeWidth={1} rx={2} />
                )}
                {drawPreview?.type === 'draw' && drawPoints.length > 1 && (
                  <path d={drawPoints.map((p, i) => {
                    const sp = toScreenCoords(p.x, p.y)
                    return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
                  }).join(' ')} fill="none" stroke={store.annotationColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                )}
                {drawPreview?.type === 'signature' && drawPoints.length > 1 && (
                  <path d={drawPoints.map((p, i) => {
                    const sp = toScreenCoords(p.x, p.y)
                    return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
                  }).join(' ')} fill="none" stroke="#000000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                )}
                {drawPreview?.type === 'measure_area' && drawPreview.points && drawPreview.points.length > 1 && (
                  <>
                    <path d={drawPreview.points.map((p, i) => {
                      const sp = toScreenCoords(p.x, p.y)
                      return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
                    }).join(' ')} fill={store.annotationColor} fillOpacity={0.1} stroke={store.annotationColor} strokeWidth={2} strokeDasharray="4 2" />
                    {drawPreview.points.map((p, i) => {
                      const sp = toScreenCoords(p.x, p.y)
                      return <circle key={i} cx={sp.x} cy={sp.y} r={3} fill={store.annotationColor} />
                    })}
                  </>
                )}

                {/* Search highlights — all results on current page */}
                {activeDoc && pageData && activeDoc.searchResults.map((r, idx) => {
                  if (r.page !== activeDoc.currentPage) return null
                  const isCurrent = idx === activeDoc.searchIndex
                  const sx = r.x * (pageData.width / pageData.originalWidth)
                  const sy = r.y * (pageData.height / pageData.originalHeight)
                  const sw = r.width * (pageData.width / pageData.originalWidth)
                  const sh = r.height * (pageData.height / pageData.originalHeight)
                  return (
                    <rect key={`search-${idx}`} x={sx} y={sy} width={sw} height={sh}
                      fill={isCurrent ? '#f97316' : '#fbbf24'}
                      fillOpacity={isCurrent ? 0.5 : 0.25}
                      stroke={isCurrent ? '#f97316' : '#fbbf24'}
                      strokeWidth={isCurrent ? 2 : 1}
                      rx={2}
                      pointerEvents="none"
                    >
                      {isCurrent && <animate attributeName="fill-opacity" values="0.5;0.8;0.5" dur="1.2s" repeatCount="indefinite" />}
                    </rect>
                  )
                })}

                {/* Selection box */}
                {selectionBox}
                {resizeHandles}
                {rotateHandleLeft}
              </svg>

              {/* Note input popup */}
              {notePos && (
                <div className={`absolute z-30 border rounded shadow-xl p-2 ${tc('bg-slate-800 border-slate-600', 'bg-white border-gray-300')}`}
                  style={{ left: toScreenCoords(notePos.x, notePos.y).x, top: toScreenCoords(notePos.x, notePos.y).y }}>
                  <input autoFocus className={`border rounded px-2 py-1 text-sm w-40 ${tc('bg-slate-900 border-slate-600 text-white', 'bg-gray-50 border-gray-300 text-gray-900')}`}
                    placeholder="Escribe nota..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNote()} />
                  <div className="flex gap-1 mt-1">
                    <button onClick={saveNote} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">Guardar</button>
                    <button onClick={() => { setNotePos(null); setNoteText('') }} className={`px-2 py-0.5 text-xs rounded ${tc('bg-slate-600 text-white', 'bg-gray-200 text-gray-800')}`}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* In-place transparent text editor (new text). Matches the rendered
                  size/font exactly: lives in the same scaled layer and uses fontSize
                  in PDF points * bitmapScale. Enter/blur saves, Esc cancels. */}
              {textPos && (() => {
                const s = toScreenCoords(textPos.x, textPos.y)
                const sx2 = pageData.width / pageData.originalWidth
                const fpx = (store.textFontSize || 14) * sx2
                return (
                  <textarea autoFocus
                    className="absolute z-30 bg-transparent outline-none resize-none overflow-hidden leading-tight"
                    style={{
                      left: s.x, top: s.y, fontSize: fpx, fontFamily: store.textFontFamily,
                      color: store.annotationColor,
                      width: Math.max(fpx * 6, (textInput.length + 2) * fpx * 0.58),
                      height: (textInput.split('\n').length) * fpx * 1.3 + fpx * 0.3,
                      border: '1px dashed rgba(59,130,246,0.9)', padding: 0, whiteSpace: 'pre',
                    }}
                    placeholder="Escribe…" value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveText() }
                      else if (e.key === 'Escape') { e.preventDefault(); setTextPos(null); setTextInput('') }
                    }}
                    onBlur={() => { if (textInput.trim()) saveText(); else { setTextPos(null); setTextInput('') } }} />
                )
              })()}

              {/* Area measurement floating controls */}
              {drawingArea && (
                <div className="absolute z-30 bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  <button onClick={closeArea} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded shadow-lg hover:bg-blue-500">
                    Cerrar polígono (Enter)
                  </button>
                  <button onClick={() => { store.setActiveTool(null); cancelDraw(); }} className={`px-3 py-1.5 text-xs rounded shadow-lg ${tc('bg-slate-600 text-white hover:bg-slate-500', 'bg-gray-300 text-gray-800 hover:bg-gray-200')}`}>
                    Cancelar
                  </button>
                </div>
              )}

              {/* Sticky note popup */}
              {notePopup && pageData && activeDoc && (() => {
                const ann = annotations.find((a) => a.id === notePopup.annId)
                if (!ann) return null
                return (
                  <div className="absolute z-30 bg-yellow-100 border border-yellow-300 rounded shadow-xl p-3"
                    style={{ left: notePopup.x, top: notePopup.y, width: 220 }}>
                    <textarea autoFocus className="w-full bg-white border border-yellow-400 rounded px-2 py-1 text-sm text-black h-20 resize-none"
                      value={notePopupText} onChange={(e) => setNotePopupText(e.target.value)} />
                    <div className="flex gap-1 mt-2">
                      <button onClick={() => {
                        store.updateAnnotation(activeDoc.doc_id, notePopup.annId, { text: notePopupText })
                        setNotePopup(null)
                      }} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">Guardar</button>
                      <button onClick={() => { setNotePopup(null) }} className="px-2 py-0.5 bg-slate-600 text-white text-xs rounded">Cerrar</button>
                    </div>
                  </div>
                )
              })()}

              {/* In-place transparent text editor (edit existing) */}
              {editingTextAnn && pageData && activeDoc && (() => {
                const ann = annotations.find((a) => a.id === editingTextAnn)
                if (!ann) return null
                const s = toScreenCoords(ann.x, ann.y)
                const sx2 = pageData.width / pageData.originalWidth
                const efs = (ann.fontSize || store.textFontSize || 14) * sx2
                return (
                  <textarea autoFocus
                    className="absolute z-30 bg-transparent outline-none resize-none overflow-hidden leading-tight"
                    style={{
                      left: s.x, top: s.y, fontSize: efs,
                      fontFamily: ann.fontFamily || store.textFontFamily || 'Arial',
                      color: ann.color || '#fff',
                      width: Math.max(efs * 6, (editTextValue.length + 2) * efs * 0.58),
                      height: (editTextValue.split('\n').length) * efs * 1.3 + efs * 0.3,
                      border: '1px dashed rgba(59,130,246,0.9)', padding: 0, whiteSpace: 'pre',
                    }}
                    value={editTextValue} onChange={(e) => setEditTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditText() }
                      else if (e.key === 'Escape') { e.preventDefault(); setEditingTextAnn(null); setEditTextValue('') }
                    }}
                    onBlur={() => commitEditText()} />
                )
              })()}
            </div>
            {/* Text selection overlay */}
            {pageText.length > 0 && (
              <div className="absolute top-0 left-0" style={{ width: displayWidth, height: displayHeight, zIndex: 15, pointerEvents: store.activeTool === 'textselect' ? 'auto' : 'none', userSelect: 'text' }}>
                {pageText.map((block, idx) => {
                  const sx = pageData.width / pageData.originalWidth
                  const sy = pageData.height / pageData.originalHeight
                  return (
                    <span key={idx} className="absolute text-transparent hover:text-black/20" style={{
                      left: block.x * sx * scale,
                      top: block.y * sy * scale,
                      width: block.width * sx * scale,
                      height: block.height * sy * scale,
                      fontSize: Math.max(8, block.height * sy * scale * 0.85),
                      lineHeight: `${block.height * sy * scale}px`,
                      overflow: 'hidden',
                    }}>
                      {block.text}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Right page in double view */}
        {isDouble && pageDataRight && (
          <div className="relative" data-page-wrapper="right" style={{ width: displayWidthRight, height: displayHeightRight, overflow: 'hidden', flexShrink: 0 }}>
            {loadingRight && (
              <div className={`absolute inset-0 flex items-center justify-center z-20 rounded ${tc('bg-slate-900/60', 'bg-gray-200/60')}`}>
                <Loader2 className="animate-spin text-blue-500" size={24} />
              </div>
            )}
            <div className="relative"
              style={{ width: pageDataRight.width, height: pageDataRight.height, transform: `scale(${scaleRight})`, transformOrigin: 'top left' }}>
              <img src={pageDataRight.image} alt={`Página ${activeDoc.currentPage + 2}`}
                className="rounded shadow-lg bg-white block" style={{ width: pageDataRight.width, height: pageDataRight.height }} draggable={false}
                onError={(e) => recoverImage(e.currentTarget, pageDataRight.image)} />



              {/* Annotation SVG Layer for right page */}
              <svg ref={svgRightRef} width={pageDataRight.width} height={pageDataRight.height}
                className="absolute top-0 left-0"
                style={{ pointerEvents: store.activeTool === 'textselect' ? 'none' : 'auto', cursor: store.activeTool ? 'crosshair' : 'grab', zIndex: 20 }}
                onMouseDown={(e) => {
                  if (!activeDoc || !pageDataRight || store.activeTool) return
                  const pt = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
                  if (store.selectedAnnotationId) {
                    const ann = annotationsRight.find((a) => a.id === store.selectedAnnotationId)
                    if (ann) {
                      const sx = pageDataRight.width / pageDataRight.originalWidth
                      const sy = pageDataRight.height / pageDataRight.originalHeight
                      const s = { x: ann.x * sx, y: ann.y * sy }
                      const w = (ann.width || 0) * sx
                      const h = (ann.height || 0) * sy
                      if (pt.x >= s.x && pt.x <= s.x + w && pt.y >= s.y && pt.y <= s.y + h) {
                        return // would need drag support for right page
                      }
                    }
                    selectAnnotation(activeDoc.doc_id, null)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!activeDoc) return
                  openMenu(e.clientX, e.clientY)
                }}>
                {annotationsRight.map((ann) => {
                  const s = {
                    x: ann.x * (pageDataRight.width / pageDataRight.originalWidth),
                    y: ann.y * (pageDataRight.height / pageDataRight.originalHeight),
                  }
                  const key = ann.id
                  const clickProps = {
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); selectAnnotation(activeDoc.doc_id, ann.id) },
                    style: { cursor: 'pointer' }
                  }
                  switch (ann.type) {
                    case 'highlight':
                      return <rect key={key} x={s.x} y={s.y} width={(ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth)} height={(ann.height || 0) * (pageDataRight.height / pageDataRight.originalHeight)} fill={ann.color || '#fbbf24'} fillOpacity={0.5} rx={2} {...clickProps} />
                    case 'underline':
                      return <line key={key} x1={s.x} y1={s.y + 14} x2={s.x + ((ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth))} y2={s.y + 14} stroke={ann.color || '#3b82f6'} strokeWidth={2} {...clickProps} />
                    case 'strikethrough':
                      return <line key={key} x1={s.x} y1={s.y + 7} x2={s.x + ((ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth))} y2={s.y + 7} stroke={ann.color || '#ef4444'} strokeWidth={2} {...clickProps} />
                    case 'rect':
                      return <rect key={key} x={s.x} y={s.y} width={(ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth)} height={(ann.height || 0) * (pageDataRight.height / pageDataRight.originalHeight)} fill="none" stroke={ann.color || '#fff'} strokeWidth={2} rx={2} {...clickProps} />
                    case 'circle': {
                      const w = (ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth)
                      const h = (ann.height || 0) * (pageDataRight.height / pageDataRight.originalHeight)
                      return <ellipse key={key} cx={s.x + w / 2} cy={s.y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={ann.color || '#fff'} strokeWidth={2} {...clickProps} />
                    }
                    case 'arrow': {
                      const x2 = s.x + ((ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth))
                      const y2 = s.y + ((ann.height || 0) * (pageDataRight.height / pageDataRight.originalHeight))
                      const angle = Math.atan2(y2 - s.y, x2 - s.x)
                      const headLen = 10
                      const x3 = x2 - headLen * Math.cos(angle - Math.PI / 6)
                      const y3 = y2 - headLen * Math.sin(angle - Math.PI / 6)
                      const x4 = x2 - headLen * Math.cos(angle + Math.PI / 6)
                      const y4 = y2 - headLen * Math.sin(angle + Math.PI / 6)
                      return (
                        <g key={key} {...clickProps}>
                          <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={ann.color || '#fff'} strokeWidth={2} />
                          <polygon points={`${x2},${y2} ${x3},${y3} ${x4},${y4}`} fill={ann.color || '#fff'} />
                        </g>
                      )
                    }
                    case 'draw':
                    case 'signature':
                      if (!ann.points || ann.points.length < 2) return null
                      const d = ann.points.map((p, i) => {
                        const spx = p.x * (pageDataRight.width / pageDataRight.originalWidth)
                        const spy = p.y * (pageDataRight.height / pageDataRight.originalHeight)
                        return `${i === 0 ? 'M' : 'L'} ${spx} ${spy}`
                      }).join(' ')
                      return <path key={key} d={d} fill="none" stroke={ann.color || '#fff'} strokeWidth={ann.type === 'signature' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" {...clickProps} />
                    case 'note':
                      return (
                        <g key={key} {...clickProps} onClick={(e) => { e.stopPropagation(); selectAnnotation(activeDoc.doc_id, ann.id); setNotePopup({ annId: ann.id, x: s.x, y: s.y }); setNotePopupText(ann.text || '') }}>
                          <rect x={s.x} y={s.y} width={24} height={24} fill={ann.color || '#fbbf24'} rx={3} />
                        </g>
                      )
                    case 'text': {
                      const fontSizeR = ann.fontSize || store.textFontSize || 14
                      const fontFamilyR = ann.fontFamily || store.textFontFamily || 'Arial'
                      const sx2r = pageDataRight!.width / pageDataRight!.originalWidth
                      const sy2r = pageDataRight!.height / pageDataRight!.originalHeight
                      const displayFontSizeR = fontSizeR * sx2r
                      const textWidthR = ann.width ? ann.width * sx2r : Math.max(120 * sx2r, (ann.text?.length || 4) * displayFontSizeR * 0.6)
                      const textHeightR = ann.height ? ann.height * sy2r : Math.max(30 * sy2r, displayFontSizeR * 1.4)
                      return (
                        <foreignObject key={key} x={s.x} y={s.y} width={textWidthR} height={textHeightR} {...clickProps}>
                          <div className="leading-tight select-none" style={{ color: ann.color || '#fff', wordWrap: 'break-word', fontFamily: fontFamilyR, fontSize: displayFontSizeR }}>
                            {ann.text}
                          </div>
                        </foreignObject>
                      )
                    }
                    case 'measure_distance': {
                      const x2r = s.x + ((ann.width || 0) * (pageDataRight.width / pageDataRight.originalWidth))
                      const y2r = s.y + ((ann.height || 0) * (pageDataRight.height / pageDataRight.originalHeight))
                      const midXr = (s.x + x2r) / 2
                      const midYr = (s.y + y2r) / 2
                      const angler = Math.atan2(y2r - s.y, x2r - s.x)
                      const labelr = ann.measurement?.label || ''
                      return (
                        <g key={key} {...clickProps}>
                          <line x1={s.x} y1={s.y} x2={x2r} y2={y2r} stroke={ann.color || '#22d3ee'} strokeWidth={2} strokeDasharray="6 3" />
                          <circle cx={s.x} cy={s.y} r={3} fill={ann.color || '#22d3ee'} />
                          <circle cx={x2r} cy={y2r} r={3} fill={ann.color || '#22d3ee'} />
                          <g transform={`translate(${midXr}, ${midYr}) rotate(${(angler * 180) / Math.PI})`}>
                            <rect x={-labelr.length * 4.5 - 6} y={-12} width={labelr.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
                            <text x={0} y={5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{labelr}</text>
                          </g>
                        </g>
                      )
                    }
                    case 'measure_area': {
                      if (!ann.points || ann.points.length < 3) return null
                      const ptsr = ann.points.map((p) => ({
                        x: p.x * (pageDataRight.width / pageDataRight.originalWidth),
                        y: p.y * (pageDataRight.height / pageDataRight.originalHeight),
                      }))
                      const dr = ptsr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                      const labelr = ann.measurement?.label || ''
                      let cxr = 0, cyr = 0
                      ptsr.forEach((p) => { cxr += p.x; cyr += p.y })
                      cxr /= ptsr.length
                      cyr /= ptsr.length
                      return (
                        <g key={key} {...clickProps}>
                          <path d={dr} fill={ann.color || '#22d3ee'} fillOpacity={0.15} stroke={ann.color || '#22d3ee'} strokeWidth={2} strokeDasharray="4 2" />
                          {ptsr.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r={3} fill={ann.color || '#22d3ee'} />
                          ))}
                          <rect x={cxr - labelr.length * 4.5 - 6} y={cyr - 12} width={labelr.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
                          <text x={cxr} y={cyr + 5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{labelr}</text>
                        </g>
                      )
                    }
                    default:
                      return null
                  }
                })}
                {selectionBoxRight}
                {resizeHandlesRight}
                {rotateHandleRight}
              </svg>
            </div>
            {/* Text selection overlay for right page */}
            {pageTextRight.length > 0 && (
              <div className="absolute top-0 left-0" style={{ width: displayWidthRight, height: displayHeightRight, zIndex: 15, pointerEvents: store.activeTool === 'textselect' ? 'auto' : 'none', userSelect: 'text' }}>
                {pageTextRight.map((block, idx) => {
                  const sx = pageDataRight.width / pageDataRight.originalWidth
                  const sy = pageDataRight.height / pageDataRight.originalHeight
                  return (
                    <span key={idx} className="absolute text-transparent hover:text-black/20" style={{
                      left: block.x * sx * scaleRight,
                      top: block.y * sy * scaleRight,
                      width: block.width * sx * scaleRight,
                      height: block.height * sy * scaleRight,
                      fontSize: Math.max(8, block.height * sy * scaleRight * 0.85),
                      lineHeight: `${block.height * sy * scaleRight}px`,
                      overflow: 'hidden',
                    }}>
                      {block.text}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag & Drop overlay */}
      {isDraggingFile && (
        <div className={`absolute inset-0 z-40 flex items-center justify-center pointer-events-none ${tc('bg-slate-900/80', 'bg-gray-200/80')}`}>
          <div className="border-2 border-dashed border-blue-400 rounded-2xl p-12 flex flex-col items-center gap-4">
            <svg className="w-16 h-16 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-blue-500 text-lg font-medium">Suelta el PDF aquí</span>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu?.visible && activeDoc && (
        <div className={`fixed z-50 border rounded shadow-xl py-1 min-w-[160px] ${tc('bg-slate-800 border-slate-600', 'bg-white border-gray-300')}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          {store.selectedAnnotationId && (
            <button className={`w-full text-left px-3 py-1.5 text-sm text-red-400 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}
              onClick={() => {
                deleteAnnotation(activeDoc.doc_id, store.selectedAnnotationId!)
                closeMenu()
              }}>
              Eliminar anotación
            </button>
          )}
          <button className={`w-full text-left px-3 py-1.5 text-sm ${tc('text-slate-200 hover:bg-slate-700', 'text-gray-800 hover:bg-gray-100')}`}
            onClick={() => {
              addBookmark({
                id: crypto.randomUUID(),
                docId: activeDoc.doc_id,
                page: activeDoc.currentPage,
                label: `Página ${activeDoc.currentPage + 1}`,
              })
              store.showToast('Marcador agregado', 'success')
              closeMenu()
            }}>
            Agregar marcador
          </button>
          {pageData && (
            <button className={`w-full text-left px-3 py-1.5 text-sm ${tc('text-slate-200 hover:bg-slate-700', 'text-gray-800 hover:bg-gray-100')}`}
              onClick={() => {
                const link = document.createElement('a')
                link.download = `${activeDoc.file_name.replace('.pdf', '')}_p${activeDoc.currentPage + 1}.png`
                link.href = pageData.image
                link.click()
                closeMenu()
              }}>
              Exportar página como imagen
            </button>
          )}
          <button className={`w-full text-left px-3 py-1.5 text-sm ${tc('text-slate-200 hover:bg-slate-700', 'text-gray-800 hover:bg-gray-100')}`}
            onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}/pdf/text/${activeDoc.doc_id}/${activeDoc.currentPage}`)
                if (res.ok) {
                  const data = await res.json()
                  await navigator.clipboard.writeText(data.text || '')
                  store.showToast('Texto copiado al portapapeles', 'success')
                }
              } catch {
                store.showToast('Error al copiar texto', 'error')
              }
              closeMenu()
            }}>
            Copiar texto de página
          </button>
        </div>
      )}
    </div>
  )
}
