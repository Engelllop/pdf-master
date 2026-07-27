import { useRef, useCallback, useState, useEffect } from 'react'
import { type Annotation } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePageLoader } from '../hooks/usePageLoader'
import { usePanZoom } from '../hooks/usePanZoom'
import { useAnnotationDraw } from '../hooks/useAnnotationDraw'
import { useAnnotationDrag } from '../hooks/useAnnotationDrag'
import { useRotateAnnotation } from '../hooks/useRotateAnnotation'
import { useRightPageResize } from '../hooks/useRightPageResize'
import { useImageEdit } from '../hooks/useImageEdit'
import { useAreaSelect } from '../hooks/useAreaSelect'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useFileDrop } from '../hooks/useFileDrop'
import { useContextMenu } from '../hooks/useContextMenu'
import { useFormFields } from '../hooks/useFormFields'
import DetailTile from './DetailTile'
import TextLayer from './viewer/TextLayer'
import SelectionOverlay from './viewer/SelectionOverlay'
import FloatingSelectionBar from './viewer/FloatingSelectionBar'
import MultiSelectionBar from './viewer/MultiSelectionBar'
import TextBoxEditor from './viewer/TextBoxEditor'
import FormFieldsLayer from './viewer/FormFieldsLayer'
import { renderAnnotation, strokePropsFor, getAnnotationBounds } from './viewer/annotationRender'
import ViewerEmptyState from './viewer/ViewerEmptyState'
import ViewerContextMenu from './viewer/ViewerContextMenu'
import { recoverImage } from '../lib/recoverImage'
import { loadSignatures, signatureAtPoint } from '../lib/signatures'
import { Loader2 } from 'lucide-react'

import { apiFetch } from '../lib/api'

export default function Viewer() {
  const store = useStoreSlice(
    'docs', 'activeDocId', 'activeTool', 'annotationColor', 'annotationLineWidth',
    'selectedAnnotationId', 'selectedAnnotationIds', 'selectAnnotations', 'toggleAnnotationSelection',
    'selectedImageData', 'selectedStamp', 'stampColor',
    'textFontFamily', 'textFontSize', 'viewerScroll', 'viewMode', 'activeRibbon',
    'setViewerSize', 'selectAnnotation', 'deleteAnnotation', 'addBookmark',
    'addAnnotation', 'getAnnotationsForPage', 'incrementDocVersion',
    'invalidatePageCache', 'invalidateThumbnails', 'setActiveTool', 'releaseTool', 'setDocDirty',
    'setSelectedImageData', 'setSelectedImagePath', 'setViewerScroll', 'showToast',
    'updateAnnotation', 'setTextFontFamily', 'setTextFontSize', 'setAnnotationColor',
    'textStyle', 'setTextStyle',
  )
  const {
    docs, activeDocId,
    setViewerSize, selectAnnotation, deleteAnnotation, addBookmark,
  } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const svgRightRef = useRef<SVGSVGElement>(null)

  // Rotación de anotaciones (compartida por ambas páginas)
  const { setRotatingAnn } = useRotateAnnotation(svgRef, activeDocId)

  // Page loading
  const {
    loading, pageData, loadingRight, pageDataRight, pageText, pageTextRight,
  } = usePageLoader()

  // Pan & zoom
  const { isPanning, startPan, handleWheel } = usePanZoom(containerRef, activeDoc, pageData)

  // Posición de vista por doc+página: al volver a una pestaña (o a una página ya
  // vista) se restaura el encuadre en vez de saltar a la esquina superior izquierda.
  const scrollMemRef = useRef(new Map<string, { left: number; top: number }>())
  const lastViewKeyRef = useRef<string | null>(null)

  const handleScroll = () => {
    const c = containerRef.current
    if (!c) return
    if (activeDoc && lastViewKeyRef.current === `${activeDoc.doc_id}:${activeDoc.currentPage}`) {
      scrollMemRef.current.set(lastViewKeyRef.current, { left: c.scrollLeft, top: c.scrollTop })
    }
    store.setViewerScroll({
      left: c.scrollLeft,
      top: c.scrollTop,
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
      scrollWidth: c.scrollWidth,
      scrollHeight: c.scrollHeight,
    })
  }

  useEffect(() => {
    if (!activeDoc || !pageData) return
    const key = `${activeDoc.doc_id}:${activeDoc.currentPage}`
    if (lastViewKeyRef.current === key) return
    lastViewKeyRef.current = key
    const saved = scrollMemRef.current.get(key)
    if (!saved) return
    requestAnimationFrame(() => {
      const c = containerRef.current
      if (!c || lastViewKeyRef.current !== key) return
      c.scrollLeft = saved.left
      c.scrollTop = saved.top
    })
  }, [activeDoc?.doc_id, activeDoc?.currentPage, pageData])

  // Annotation drawing
  const {
    drawPreview, drawPoints,
    noteText, setNoteText, notePos, setNotePos,
    textInput, setTextInput, textPos, setTextPos,
    handleMouseDown: handleDrawMouseDown, handleMouseMove: handleDrawMouseMove, handleMouseUp: handleDrawMouseUp,
    saveNote, saveText, cancelDraw,
    drawingArea, closeArea, snapPoint, markupRects,
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

  // Redimensionado de anotaciones en la página derecha (vista doble)
  const { setResizingAnnRight } = useRightPageResize(svgRightRef, activeDocId, pageDataRight)

  // Keyboard shortcuts
  useKeyboardShortcuts(activeDoc, store.selectedAnnotationId, deleteAnnotation, cancelDraw)

  // File drop
  const { isDraggingFile, handleDragOver, handleDragLeave, handleDrop } = useFileDrop()

  // Context menu
  const { contextMenu, openMenu, closeMenu } = useContextMenu()

  // Form fields
  const { fields: formFields, updateField: updateFormField } = useFormFields(activeDoc?.doc_id || null, activeDoc?.currentPage || 0)

  // ResizeObserver: containerRef cambia de elemento al alternar estado vacío ↔
  // documento, así que hay que re-observar en ese cambio (si no, el observer queda
  // sobre el div desmontado y viewerWidth/Height se quedan congelados → el fit
  // inicial se calculaba con las medidas por defecto y el zoom salía mal).
  const hasDoc = !!activeDoc
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) setViewerSize(width, height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setViewerSize, hasDoc])

  // Edición in-situ de texto existente (herramienta 'edittext')
  const [editSpan, setEditSpan] = useState<{ x0: number; y0: number; x1: number; y1: number; size: number; color: string; font: string; value: string } | null>(null)

  // Colocación de una firma guardada: el gestor la elige y el siguiente clic en la
  // página la sitúa (escalada al ancho estándar).
  const [pendingSignature, setPendingSignature] = useState<string | null>(null)
  useEffect(() => {
    const onPlace = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined
      if (!id) return
      setPendingSignature(id)
      store.setActiveTool('placesig')
    }
    window.addEventListener('app:place-signature', onPlace as EventListener)
    return () => window.removeEventListener('app:place-signature', onPlace as EventListener)
  }, [])

  // Marquesina de selección múltiple (herramienta Seleccionar)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null)

  /** Clic sobre una marca: Ctrl/⌘ suma o resta de la selección, clic normal la aísla. */
  const handleSelectAnnotation = (e: React.MouseEvent, annId: string) => {
    if (!activeDoc) return
    if (e.ctrlKey || e.metaKey) store.toggleAnnotationSelection(activeDoc.doc_id, annId)
    else selectAnnotation(activeDoc.doc_id, annId)
  }

  // Selección visual de área para recortar/redactar (herramientas 'croparea'/'redactarea')
  const { areaSel, areaSelRef, areaDraggingRef, areaToolRef, setArea, applyArea } = useAreaSelect(activeDoc, pageData)

  // Edición de imágenes existentes (herramienta 'editimage')
  const {
    pageImages, selImg, setSelImg, imgPreview, setImgPreview,
    imgModeRef, imgStartRef, imgSx, imgSy, imgLocalOf, applyImageTransform,
  } = useImageEdit(activeDoc, pageData)

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!activeDoc || !pageData) return
    const pt = getSvgPoint(e)

    // Editar texto existente: busca el span bajo el cursor y abre el editor in-place
    if (store.activeTool === 'edittext') {
      e.preventDefault()
      const pdfX = pt.x * (pageData.originalWidth / pageData.width)
      const pdfY = pt.y * (pageData.originalHeight / pageData.height)
      apiFetch(`/pdf/spans/${activeDoc.doc_id}/${activeDoc.currentPage}`)
        .then((r) => r.json())
        .then(({ spans }: { spans: Array<{ x0: number; y0: number; x1: number; y1: number; text: string; size: number; color: string; font: string }> }) => {
          const hit = spans.find((s) => pdfX >= s.x0 - 1 && pdfX <= s.x1 + 1 && pdfY >= s.y0 - 1 && pdfY <= s.y1 + 1)
          if (!hit) { store.showToast('Haz clic justo sobre el texto que quieres editar', 'info'); return }
          setEditSpan({ x0: hit.x0, y0: hit.y0, x1: hit.x1, y1: hit.y1, size: hit.size, color: hit.color || '#000000', font: hit.font || 'Arial', value: hit.text })
        })
        .catch(() => store.showToast('Error al leer el texto de la página', 'error'))
      return
    }

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
      apiFetch(`/pdf/insert-text/${activeDoc.doc_id}`, {
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
        store.releaseTool()
      })
      return
    }

    // Edición de imágenes existentes: seleccionar, mover, redimensionar
    if (store.activeTool === 'editimage') {
      e.preventDefault()
      if (selImg != null && pageImages[selImg]) {
        const r = imgPreview || imgLocalOf(pageImages[selImg])
        if (Math.abs(pt.x - (r.l + r.w)) < 12 && Math.abs(pt.y - (r.t + r.h)) < 12) {
          imgModeRef.current = 'resize'; imgStartRef.current = { ox: pt.x, oy: pt.y, rect: r }; setImgPreview(r); return
        }
      }
      const idx = pageImages.findIndex((im) => { const r = imgLocalOf(im); return pt.x >= r.l && pt.x <= r.l + r.w && pt.y >= r.t && pt.y <= r.t + r.h })
      if (idx >= 0) { setSelImg(idx); imgModeRef.current = 'move'; const r = imgLocalOf(pageImages[idx]); imgStartRef.current = { ox: pt.x, oy: pt.y, rect: r }; setImgPreview(r) }
      else { setSelImg(null); setImgPreview(null) }
      return
    }

    // Selección de área (recortar/redactar): arrastrar rectángulo
    if (store.activeTool === 'croparea' || store.activeTool === 'redactarea') {
      e.preventDefault()
      areaDraggingRef.current = true
      areaToolRef.current = store.activeTool
      setArea({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
      return
    }

    // Colocar una firma guardada
    if (store.activeTool === 'placesig') {
      e.preventDefault()
      const sig = loadSignatures().find((s) => s.id === pendingSignature)
      if (!sig) { store.setActiveTool(null); setPendingSignature(null); return }
      const pdfX = pt.x * (pageData.originalWidth / pageData.width)
      const pdfY = pt.y * (pageData.originalHeight / pageData.height)
      store.addAnnotation(activeDoc.doc_id, {
        id: crypto.randomUUID(),
        type: 'signature',
        page: activeDoc.currentPage,
        x: pdfX,
        y: pdfY,
        color: store.annotationColor,
        lineWidth: 2,
        points: signatureAtPoint(sig, { x: pdfX, y: pdfY }),
      })
      store.setDocDirty(activeDoc.doc_id, true)
      store.setActiveTool(null)
      setPendingSignature(null)
      return
    }

    // Con la herramienta Seleccionar: arrastrar una marca la mueve y arrastrar en
    // vacío dibuja una marquesina (con las demás herramientas, arrastrar dibuja).
    if (store.activeTool === 'select') {
      const didDrag = handleDragMouseDown(e, pt)
      if (didDrag) return
      e.preventDefault()
      marqueeStartRef.current = { x: pt.x, y: pt.y, additive: e.ctrlKey || e.metaKey }
      setMarquee({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
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
    if (marqueeStartRef.current) {
      const s = marqueeStartRef.current
      setMarquee({ x0: s.x, y0: s.y, x1: pt.x, y1: pt.y })
      return
    }
    if (areaDraggingRef.current) {
      const s = areaSelRef.current
      if (s) setArea({ x0: s.x0, y0: s.y0, x1: pt.x, y1: pt.y })
      return
    }
    if (imgModeRef.current && imgStartRef.current) {
      const st = imgStartRef.current, dx = pt.x - st.ox, dy = pt.y - st.oy
      if (imgModeRef.current === 'move') setImgPreview({ l: st.rect.l + dx, t: st.rect.t + dy, w: st.rect.w, h: st.rect.h })
      else setImgPreview({ l: st.rect.l, t: st.rect.t, w: Math.max(8, st.rect.w + dx), h: Math.max(8, st.rect.h + dy) })
      return
    }
    handleDrawMouseMove(pt, e.shiftKey)
  }

  const handleMouseUp = () => {
    if (marqueeStartRef.current) {
      const start = marqueeStartRef.current
      const box = marquee
      marqueeStartRef.current = null
      setMarquee(null)
      if (activeDoc && pageData) {
        // Un clic sin arrastre en vacío = limpiar selección.
        if (!box || (Math.abs(box.x1 - box.x0) < 3 && Math.abs(box.y1 - box.y0) < 3)) {
          if (!start.additive) selectAnnotation(activeDoc.doc_id, null)
          return
        }
        const x0 = Math.min(box.x0, box.x1)
        const x1 = Math.max(box.x0, box.x1)
        const y0 = Math.min(box.y0, box.y1)
        const y1 = Math.max(box.y0, box.y1)
        const hits = annotations.filter((a) => {
          const b = getAnnotationBounds(a, pageData, toScreenCoords)
          if (!b) return false
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
        }).map((a) => a.id)
        const next = start.additive
          ? [...new Set([...store.selectedAnnotationIds, ...hits])]
          : hits
        store.selectAnnotations(activeDoc.doc_id, next)
      }
      return
    }
    if (areaDraggingRef.current) {
      areaDraggingRef.current = false
      const tool = areaToolRef.current
      const s = areaSelRef.current
      setArea(null)
      store.setActiveTool(null)
      if (tool && s) applyArea(tool, s)
      return
    }
    if (imgModeRef.current) {
      const mode = imgModeRef.current; imgModeRef.current = null
      const pr = imgPreview, idx = selImg
      if (pr && idx != null && pageImages[idx] && pageData) {
        const orig = imgLocalOf(pageImages[idx])
        const moved = Math.abs(pr.l - orig.l) > 1 || Math.abs(pr.t - orig.t) > 1 || Math.abs(pr.w - orig.w) > 1 || Math.abs(pr.h - orig.h) > 1
        if (moved) applyImageTransform(pageImages[idx], { new: [pr.l / imgSx, pr.t / imgSy, (pr.l + pr.w) / imgSx, (pr.t + pr.h) / imgSy] })
      }
      void mode
      return
    }
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

  // Un callout recién creado abre su editor de texto sin pasar por el doble clic.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined
      if (!id) return
      setEditingTextAnn(id)
      setEditTextValue('')
    }
    window.addEventListener('app:edit-annotation-text', onEdit as EventListener)
    return () => window.removeEventListener('app:edit-annotation-text', onEdit as EventListener)
  }, [])

  const commitEditText = () => {
    if (!editingTextAnn || !activeDoc) return
    store.updateAnnotation(activeDoc.doc_id, editingTextAnn, { text: editTextValue })
    setEditingTextAnn(null)
    setEditTextValue('')
  }

  // Render annotations
  const annotations = activeDoc && pageData ? store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage) : []
  const annotationsRight = activeDoc && pageDataRight ? store.getAnnotationsForPage(activeDoc.doc_id, activeDoc.currentPage + 1) : []

  const textDefaults = { fontSize: store.textFontSize || 14, fontFamily: store.textFontFamily || 'Arial' }
  const openNotePopup = (ann: Annotation, screen: { x: number; y: number }) => {
    setNotePopup({ annId: ann.id, x: screen.x, y: screen.y })
    setNotePopupText(ann.text || '')
  }

  const selectedAnnLeft = store.selectedAnnotationId ? annotations.find((a) => a.id === store.selectedAnnotationId) : undefined
  const selectedAnnRight = store.selectedAnnotationId ? annotationsRight.find((a) => a.id === store.selectedAnnotationId) : undefined

  if (!activeDoc) {
    return <ViewerEmptyState containerRef={containerRef} onDragOver={handleDragOver} onDrop={handleDrop} />
  }

  const scale = pageData ? activeDoc.zoom / (pageData.width / pageData.originalWidth) : 1
  const scaleRight = pageDataRight ? activeDoc.zoom / (pageDataRight.width / pageDataRight.originalWidth) : 1
  const displayWidth = pageData ? pageData.width * scale : 0
  const displayHeight = pageData ? pageData.height * scale : 0
  const displayWidthRight = pageDataRight ? pageDataRight.width * scaleRight : 0
  const displayHeightRight = pageDataRight ? pageDataRight.height * scaleRight : 0
  const isDouble = store.viewMode === 'double'

  return (
    <div ref={containerRef} className={`flex-1 overflow-auto relative bg-surface`}
      onWheel={handleWheel} onScroll={handleScroll} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!activeDoc) return
        openMenu(e.clientX, e.clientY)
      }}
      onClick={closeMenu}>

      {!pageData && loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="animate-spin text-accent" size={36} />
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
              <div className={`absolute inset-0 flex items-center justify-center z-20 rounded bg-surface/80`}>
                <Loader2 className="animate-spin text-accent" size={32} />
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
              <FormFieldsLayer fields={formFields} pageData={pageData} onChange={updateFormField} />

              {/* Selectable text layer */}
              <TextLayer docId={activeDoc.doc_id} page={activeDoc.currentPage} version={activeDoc.docVersion} pageData={pageData} active={!store.activeTool} />

              {/* Annotation SVG Layer */}

              <svg ref={svgRef} width={pageData.width} height={pageData.height}
                className="absolute top-0 left-0"
                style={{ pointerEvents: store.activeTool === 'textselect' ? 'none' : 'auto', cursor: isPanning ? 'grabbing' : ['highlight', 'underline', 'strikethrough'].includes(store.activeTool || '') ? 'text' : store.activeTool ? 'crosshair' : 'grab', zIndex: 20 }}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onDoubleClick={() => { if (drawingArea) closeArea() }}>
                {/* Modo edición: contorno punteado sobre cada bloque de texto editable */}
                {store.activeRibbon === 'edit' && pageText.map((b, i) => {
                  if (!b.text) return null
                  const bx = pageData.width / pageData.originalWidth
                  const by = pageData.height / pageData.originalHeight
                  return (
                    <rect key={`edit-outline-${i}`} x={b.x * bx - 2} y={b.y * by - 2}
                      width={b.width * bx + 4} height={b.height * by + 4}
                      fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" rx={2}
                      pointerEvents="none" opacity={0.8} />
                  )
                })}

                {/* Existing annotations (la que se está editando se oculta: la dibuja el editor) */}
                {annotations.filter((a) => a.id !== editingTextAnn).map((ann) => renderAnnotation(ann, pageData, toScreenCoords, {
                  onSelect: (e) => handleSelectAnnotation(e, ann.id),
                  onNoteClick: openNotePopup,
                  onTextDoubleClick: startEditText,
                  textDefaults,
                }))}

                {/* Preview while drawing (el marcado de texto muestra su preview por línea) */}
                {drawPreview && (drawPreview as any).type !== 'textselect' && markupRects.length === 0 &&
                  renderAnnotation(drawPreview as Annotation, pageData, toScreenCoords, { isPreview: true, textDefaults })}
                {drawPreview && markupRects.map((l, i) =>
                  renderAnnotation({
                    ...(drawPreview as Annotation),
                    id: `markup-preview-${i}`,
                    x: l.x0, y: l.y0, width: l.x1 - l.x0, height: l.y1 - l.y0,
                  }, pageData, toScreenCoords, { isPreview: true, textDefaults })
                )}

                {/* Imán de snap para mediciones */}
                {snapPoint && (() => {
                  const sp = toScreenCoords(snapPoint.x, snapPoint.y)
                  return (
                    <g pointerEvents="none">
                      <circle cx={sp.x} cy={sp.y} r={7} fill="none" stroke="#22c55e" strokeWidth={2} />
                      <line x1={sp.x - 11} y1={sp.y} x2={sp.x - 4} y2={sp.y} stroke="#22c55e" strokeWidth={1.5} />
                      <line x1={sp.x + 4} y1={sp.y} x2={sp.x + 11} y2={sp.y} stroke="#22c55e" strokeWidth={1.5} />
                      <line x1={sp.x} y1={sp.y - 11} x2={sp.x} y2={sp.y - 4} stroke="#22c55e" strokeWidth={1.5} />
                      <line x1={sp.x} y1={sp.y + 4} x2={sp.x} y2={sp.y + 11} stroke="#22c55e" strokeWidth={1.5} />
                    </g>
                  )
                })()}
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
                  }).join(' ')} fill="none" stroke={store.annotationColor}
                    strokeWidth={store.annotationLineWidth * (pageData.width / pageData.originalWidth)}
                    strokeDasharray={strokePropsFor(drawPreview as Annotation, pageData.width / pageData.originalWidth).strokeDasharray}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                )}
                {drawPreview?.type === 'signature' && drawPoints.length > 1 && (
                  <path d={drawPoints.map((p, i) => {
                    const sp = toScreenCoords(p.x, p.y)
                    return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
                  }).join(' ')} fill="none" stroke="#000000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                )}
                {(drawPreview?.type === 'measure_area' || drawPreview?.type === 'polygon') && drawPreview.points && drawPreview.points.length > 1 && (
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

                {/* Selección: handles solo con una marca; con varias, contorno simple */}
                {store.selectedAnnotationIds.length > 1
                  ? annotations.filter((a) => store.selectedAnnotationIds.includes(a.id)).map((a) => {
                      const b = getAnnotationBounds(a, pageData, toScreenCoords)
                      if (!b) return null
                      return (
                        <rect key={`multi-${a.id}`} x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6}
                          fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" rx={3}
                          pointerEvents="none" />
                      )
                    })
                  : selectedAnnLeft && (
                    <SelectionOverlay ann={selectedAnnLeft} pageData={pageData} toScreen={toScreenCoords}
                      onResizeStart={setResizingAnn} onRotateStart={setRotatingAnn} />
                  )}

                {/* Marquesina de selección múltiple */}
                {marquee && (
                  <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
                    width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
                    fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 2"
                    pointerEvents="none" />
                )}

                {/* Imágenes existentes (herramienta editar imagen) */}
                {store.activeTool === 'editimage' && pageImages.map((im, i) => {
                  const r = (selImg === i && imgPreview) ? imgPreview : imgLocalOf(im)
                  const sel = selImg === i
                  return (
                    <g key={`${im.xref}-${i}`} style={{ cursor: 'move' }}>
                      <rect x={r.l} y={r.t} width={r.w} height={r.h}
                        fill={sel ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.04)'}
                        stroke="#3b82f6" strokeWidth={sel ? 2 : 1} strokeDasharray={sel ? undefined : '4 3'} />
                      {sel && <rect x={r.l + r.w - 5} y={r.t + r.h - 5} width={10} height={10} fill="#3b82f6" style={{ cursor: 'nwse-resize' }} />}
                    </g>
                  )
                })}

                {/* Rectángulo de selección de área (recortar/redactar) */}
                {areaSel && (store.activeTool === 'croparea' || store.activeTool === 'redactarea') && (
                  <rect x={Math.min(areaSel.x0, areaSel.x1)} y={Math.min(areaSel.y0, areaSel.y1)}
                    width={Math.abs(areaSel.x1 - areaSel.x0)} height={Math.abs(areaSel.y1 - areaSel.y0)}
                    fill={store.activeTool === 'redactarea' ? 'rgba(0,0,0,0.35)' : 'rgba(59,130,246,0.15)'}
                    stroke={store.activeTool === 'redactarea' ? '#000000' : '#3b82f6'}
                    strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
                )}
              </svg>

              {/* Note input popup */}
              {notePos && (
                <div className={`absolute z-30 border rounded shadow-xl p-2 bg-panel border-border`}
                  style={{ left: toScreenCoords(notePos.x, notePos.y).x, top: toScreenCoords(notePos.x, notePos.y).y }}>
                  <input autoFocus className={`border rounded px-2 py-1 text-sm w-40 bg-surface border-border text-fg`}
                    placeholder="Escribe nota..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNote()} />
                  <div className="flex gap-1 mt-1">
                    <button onClick={saveNote} className="px-2 py-0.5 bg-accent text-toolbar text-xs rounded">Guardar</button>
                    <button onClick={() => { setNotePos(null); setNoteText('') }} className={`px-2 py-0.5 text-xs rounded bg-active text-fg`}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Acciones de la imagen seleccionada */}
              {store.activeTool === 'editimage' && selImg != null && pageImages[selImg] && (() => {
                const im = pageImages[selImg]
                const s = toScreenCoords(im.x0, im.y0)
                return (
                  <div className="absolute z-30 flex gap-1 -translate-y-full" style={{ left: s.x, top: s.y - 4 }}>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={() => applyImageTransform(im, { delete: true })}
                      className="px-2 py-1 text-xs rounded bg-red-600 text-white shadow hover:bg-red-500">Eliminar</button>
                    <button onMouseDown={(e) => e.stopPropagation()}
                      onClick={async () => { const p = await window.api.openFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]); if (p) applyImageTransform(im, { replace_path: p, new: [im.x0, im.y0, im.x1, im.y1] }) }}
                      className="px-2 py-1 text-xs rounded bg-fg text-toolbar shadow hover:opacity-90">Reemplazar</button>
                  </div>
                )
              })()}

              {/* Editor in-place de texto existente */}
              {editSpan && activeDoc && (() => {
                const sx2 = pageData.width / pageData.originalWidth
                const s = toScreenCoords(editSpan.x0, editSpan.y0)
                const fpx = (editSpan.size || 12) * sx2
                const w = Math.max((editSpan.x1 - editSpan.x0) * sx2 + fpx * 3, fpx * 4)
                const commit = async () => {
                  const v = editSpan.value
                  const span = editSpan
                  setEditSpan(null)
                  try {
                    const res = await apiFetch(`/pdf/edit-text/${activeDoc.doc_id}`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ page_num: activeDoc.currentPage, x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1, text: v, size: span.size, color: span.color, font: span.font }),
                    })
                    if (res.ok) {
                      store.setDocDirty(activeDoc.doc_id, true)
                      store.invalidatePageCache(activeDoc.doc_id)
                      store.invalidateThumbnails(activeDoc.doc_id)
                      store.incrementDocVersion(activeDoc.doc_id)
                      store.showToast('Texto editado', 'success')
                    } else store.showToast('Error al editar texto', 'error')
                  } catch { store.showToast('Error al editar texto', 'error') }
                }
                return (
                  <textarea autoFocus value={editSpan.value}
                    onChange={(e) => setEditSpan({ ...editSpan, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
                      else if (e.key === 'Escape') { e.preventDefault(); setEditSpan(null) }
                    }}
                    onBlur={commit}
                    className="absolute z-30 outline-none resize-none overflow-hidden leading-tight"
                    style={{
                      left: s.x, top: s.y, fontSize: fpx, fontFamily: editSpan.font || 'Arial',
                      color: editSpan.color || '#000', background: '#fff',
                      width: w, height: fpx * 1.5,
                      border: '1px solid rgba(59,130,246,0.9)', padding: 0, whiteSpace: 'pre',
                    }} />
                )
              })()}

              {/* Area measurement floating controls */}
              {drawingArea && (
                <div className="absolute z-30 bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  <button onClick={closeArea} className="px-3 py-1.5 bg-accent text-toolbar text-xs rounded shadow-lg hover:opacity-90">
                    {store.activeTool === 'measure_perimeter' ? 'Terminar medición (Enter)' : 'Cerrar polígono (Enter)'}
                  </button>
                  <button onClick={() => { store.setActiveTool(null); cancelDraw(); }} className={`px-3 py-1.5 text-xs rounded shadow-lg bg-active text-fg hover:bg-hover`}>
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
                      }} className="px-2 py-0.5 bg-accent text-toolbar text-xs rounded">Guardar</button>
                      <button onClick={() => { setNotePopup(null) }} className="px-2 py-0.5 bg-active text-fg text-xs rounded">Cerrar</button>
                    </div>
                  </div>
                )
              })()}

              {/* In-place transparent text editor (edit existing) */}
            </div>

            {/* Barra contextual de la anotación seleccionada (no escala con el zoom) */}
            {selectedAnnLeft && store.selectedAnnotationIds.length <= 1 && !editingTextAnn && !textPos && (
              <FloatingSelectionBar ann={selectedAnnLeft} docId={activeDoc.doc_id}
                pageData={pageData} toScreen={toScreenCoords} scale={scale} wrapperWidth={displayWidth} />
            )}

            {/* Barra de acciones en lote (selección múltiple) */}
            {store.selectedAnnotationIds.length > 1 && (
              <MultiSelectionBar docId={activeDoc.doc_id} ids={store.selectedAnnotationIds} />
            )}

            {/* Editor de texto nuevo (estilo Acrobat, con mini-toolbar) */}
            {textPos && (() => {
              const s = toScreenCoords(textPos.x, textPos.y)
              return (
                <TextBoxEditor x={s.x * scale} y={s.y * scale} zoom={activeDoc.zoom} wrapperWidth={displayWidth}
                  value={textInput} onChange={setTextInput}
                  onCommit={() => { if (textInput.trim()) saveText(); else { setTextPos(null); setTextInput('') } }}
                  onCancel={() => { setTextPos(null); setTextInput('') }}
                  fontFamily={store.textFontFamily} fontSize={store.textFontSize} color={store.annotationColor}
                  style={store.textStyle}
                  onFontFamily={store.setTextFontFamily} onFontSize={store.setTextFontSize} onColor={store.setAnnotationColor}
                  onStyle={store.setTextStyle} />
              )
            })()}

            {/* Editor de texto existente (doble clic sobre la anotación) */}
            {editingTextAnn && (() => {
              const ann = annotations.find((a) => a.id === editingTextAnn)
              if (!ann) return null
              const s = toScreenCoords(ann.x, ann.y)
              return (
                <TextBoxEditor x={s.x * scale} y={s.y * scale} zoom={activeDoc.zoom} wrapperWidth={displayWidth}
                  value={editTextValue} onChange={setEditTextValue}
                  onCommit={commitEditText}
                  onCancel={() => { setEditingTextAnn(null); setEditTextValue('') }}
                  onDelete={() => { deleteAnnotation(activeDoc.doc_id, ann.id); setEditingTextAnn(null); setEditTextValue('') }}
                  fontFamily={ann.fontFamily || store.textFontFamily} fontSize={ann.fontSize || store.textFontSize} color={ann.color || store.annotationColor}
                  style={{
                    bold: !!ann.bold, italic: !!ann.italic, align: ann.align || 'left',
                    lineHeight: ann.lineHeight || 1.3, listStyle: ann.listStyle || 'none',
                  }}
                  onFontFamily={(f) => store.updateAnnotation(activeDoc.doc_id, ann.id, { fontFamily: f })}
                  onFontSize={(v) => store.updateAnnotation(activeDoc.doc_id, ann.id, { fontSize: v })}
                  onColor={(c) => store.updateAnnotation(activeDoc.doc_id, ann.id, { color: c })}
                  onStyle={(s) => store.updateAnnotation(activeDoc.doc_id, ann.id, s)} />
              )
            })()}
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
              <div className={`absolute inset-0 flex items-center justify-center z-20 rounded bg-surface/60`}>
                <Loader2 className="animate-spin text-accent" size={24} />
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
                {annotationsRight.map((ann) => renderAnnotation(ann, pageDataRight, toScreenCoordsRight, {
                  onSelect: () => selectAnnotation(activeDoc.doc_id, ann.id),
                  onNoteClick: openNotePopup,
                  onTextDoubleClick: startEditText,
                  textDefaults,
                }))}
                {selectedAnnRight && (
                  <SelectionOverlay ann={selectedAnnRight} pageData={pageDataRight} toScreen={toScreenCoordsRight}
                    onResizeStart={setResizingAnnRight} onRotateStart={setRotatingAnn} />
                )}
              </svg>
            </div>
            {selectedAnnRight && (
              <FloatingSelectionBar ann={selectedAnnRight} docId={activeDoc.doc_id}
                pageData={pageDataRight} toScreen={toScreenCoordsRight} scale={scaleRight} wrapperWidth={displayWidthRight} />
            )}
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
        <div className={`absolute inset-0 z-40 flex items-center justify-center pointer-events-none bg-surface/80`}>
          <div className="border-2 border-dashed border-accent rounded-2xl p-12 flex flex-col items-center gap-4">
            <svg className="w-16 h-16 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-accent text-lg font-medium">Suelta el PDF aquí</span>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu?.visible && activeDoc && (
        <ViewerContextMenu x={contextMenu.x} y={contextMenu.y}
          hasSelection={!!store.selectedAnnotationId}
          canExportImage={!!pageData}
          onDeleteAnnotation={() => { deleteAnnotation(activeDoc.doc_id, store.selectedAnnotationId!); closeMenu() }}
          onAddBookmark={() => {
            addBookmark({ id: crypto.randomUUID(), docId: activeDoc.doc_id, page: activeDoc.currentPage, label: `Página ${activeDoc.currentPage + 1}` })
            store.showToast('Marcador agregado', 'success')
            closeMenu()
          }}
          onExportImage={() => {
            if (!pageData) return
            const link = document.createElement('a')
            link.download = `${activeDoc.file_name.replace(/\.pdf$/i, '')}_p${activeDoc.currentPage + 1}.png`
            link.href = pageData.image
            link.click()
            closeMenu()
          }}
          onCopyText={async () => {
            try {
              const res = await apiFetch(`/pdf/text/${activeDoc.doc_id}/${activeDoc.currentPage}`)
              if (res.ok) {
                const data = await res.json()
                await navigator.clipboard.writeText(data.text || '')
                store.showToast('Texto copiado al portapapeles', 'success')
              }
            } catch {
              store.showToast('Error al copiar texto', 'error')
            }
            closeMenu()
          }} />
      )}
    </div>
  )
}
