import { useEffect, useMemo, useRef, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePdfStore, type Annotation, type PdfDoc } from '../store/usePdfStore'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'
import { countNumbers } from '../lib/counts'
import { getAnnotationBounds, renderAnnotation } from './viewer/annotationRender'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useFormFields } from '../hooks/useFormFields'
import FormFieldsLayer from './viewer/FormFieldsLayer'
import NoteBubble from './viewer/NoteBubble'
import FloatingSelectionBar from './viewer/FloatingSelectionBar'
import MultiSelectionBar from './viewer/MultiSelectionBar'
import TextBoxEditor from './viewer/TextBoxEditor'
import ViewerEmptyState from './viewer/ViewerEmptyState'
import { isFormTool, placeFormField } from '../lib/formFields'
import { SEL } from '../lib/selectionChrome'
import { useFileDrop } from '../hooks/useFileDrop'
import { X } from 'lucide-react'

const GAP = 16
const BUFFER_PX = 1200

const CLICK_TOOLS = new Set(['note', 'count', 'stamp', 'text'])
const DRAG_TOOLS = new Set([
  'rect', 'highlight', 'circle', 'arrow', 'line', 'check', 'cross', 'star',
  'cloud', 'draw', 'measure_distance', 'callout',
])

type Preview = Partial<Annotation> & { type?: Annotation['type'] }

function pagePoint(e: { clientX: number; clientY: number }, el: HTMLElement, pw: number, ph: number) {
  const r = el.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * pw,
    y: ((e.clientY - r.top) / r.height) * ph,
    sx: (e.clientX - r.left),
    sy: (e.clientY - r.top),
  }
}

function ContinuousPageOverlay({
  doc,
  page,
  width,
  height,
  pw,
  ph,
}: {
  doc: PdfDoc
  page: number
  width: number
  height: number
  pw: number
  ph: number
}) {
  const store = useStoreSlice(
    'activeTool', 'annotationColor', 'annotationLineWidth', 'annotationLineStyle',
    'annotationOpacity', 'annotationFillColor', 'annotationFillOpacity',
    'addAnnotation', 'selectAnnotation', 'selectAnnotations', 'selectedAnnotationIds',
    'selectedAnnotationId', 'updateAnnotation', 'deleteAnnotation',
    'releaseTool', 'selectedStamp', 'stampColor', 'stampSize', 'countCategory',
    'countSymbol', 'textFontSize', 'textFontFamily', 'textStyle', 'setTextStyle',
    'setTextFontFamily', 'setTextFontSize', 'setAnnotationColor',
  )
  const pageRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [formRect, setFormRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const drawPts = useRef<Array<{ x: number; y: number }>>([])
  const { fields: formFields, updateField: updateFormField, transformField } = useFormFields(doc.doc_id, page)

  const pd = { width, height, originalWidth: pw, originalHeight: ph }
  const toScreen = (x: number, y: number) => ({ x: (x / pw) * width, y: (y / ph) * height })
  const anns = doc.annotations.filter((a) => a.page === page)
  const countNums = useMemo(() => countNumbers(doc.annotations), [doc.annotations])
  const selected = new Set(store.selectedAnnotationIds)
  const selectedAnn = anns.find((a) => a.id === store.selectedAnnotationId)
  const zoom = width / pw

  useEffect(() => {
    setNoteOpen(selectedAnn?.type === 'note')
    if (selectedAnn?.type !== 'text' && selectedAnn?.type !== 'callout') setEditingId(null)
  }, [selectedAnn?.id, selectedAnn?.type])

  const style = () => ({
    color: store.annotationColor,
    lineWidth: store.annotationLineWidth,
    lineStyle: store.annotationLineStyle,
    opacity: store.annotationOpacity,
    ...(store.annotationFillColor
      ? { fillColor: store.annotationFillColor, fillOpacity: store.annotationFillOpacity }
      : {}),
  })

  const hitTest = (sx: number, sy: number) => {
    for (let i = anns.length - 1; i >= 0; i--) {
      const b = getAnnotationBounds(anns[i], pd, toScreen)
      if (!b) continue
      const pad = 6
      if (sx >= b.x - pad && sx <= b.x + b.w + pad && sy >= b.y - pad && sy <= b.y + b.h + pad) {
        return anns[i]
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = pageRef.current
    if (!el) return
    const pt = pagePoint(e, el, pw, ph)
    const tool = store.activeTool

    if (!tool || tool === 'select') {
      const hit = hitTest(pt.sx, pt.sy)
      if (hit) {
        e.stopPropagation()
        if (e.shiftKey) store.selectAnnotations(doc.doc_id, [...selected, hit.id])
        else store.selectAnnotation(doc.doc_id, hit.id)
      } else {
        store.selectAnnotation(doc.doc_id, null)
      }
      return
    }

    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (isFormTool(tool)) {
      dragRef.current = { x: pt.x, y: pt.y }
      setFormRect({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
      return
    }

    if (CLICK_TOOLS.has(tool)) {
      if (tool === 'note') {
        const id = crypto.randomUUID()
        store.addAnnotation(doc.doc_id, {
          id, type: 'note', page, x: pt.x, y: pt.y, color: store.annotationColor, text: '',
        })
        store.selectAnnotation(doc.doc_id, id)
        setNoteOpen(true)
      } else if (tool === 'count') {
        store.addAnnotation(doc.doc_id, {
          id: crypto.randomUUID(), type: 'count', page, x: pt.x, y: pt.y,
          color: store.annotationColor, text: store.countCategory || 'General', symbol: store.countSymbol,
        })
      } else if (tool === 'stamp') {
        const size = store.stampSize
        store.addAnnotation(doc.doc_id, {
          id: crypto.randomUUID(), type: 'text', page,
          x: pt.x - (store.selectedStamp.length * size * 0.28),
          y: pt.y - size * 0.5,
          color: store.stampColor, text: store.selectedStamp, fontSize: size, italic: true, bold: true,
        })
        store.releaseTool()
      } else if (tool === 'text') {
        setTextDraft({ x: pt.x, y: pt.y })
        setTextValue('')
        store.releaseTool()
      }
      return
    }

    if (DRAG_TOOLS.has(tool)) {
      dragRef.current = { x: pt.x, y: pt.y }
      drawPts.current = [{ x: pt.x, y: pt.y }]
      setPreview({
        id: 'preview',
        type: tool as Annotation['type'],
        page, x: pt.x, y: pt.y, width: 0, height: 0,
        points: tool === 'draw' ? [{ x: pt.x, y: pt.y }] : undefined,
        ...style(),
      })
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = pageRef.current
    if (!el || !dragRef.current) return
    const pt = pagePoint(e, el, pw, ph)
    const origin = dragRef.current
    if (isFormTool(store.activeTool)) {
      setFormRect({ x0: origin.x, y0: origin.y, x1: pt.x, y1: pt.y })
      return
    }
    if (store.activeTool === 'draw') {
      drawPts.current = [...drawPts.current, { x: pt.x, y: pt.y }]
      setPreview((p) => p ? { ...p, points: drawPts.current } : p)
      return
    }
    setPreview((p) => p ? { ...p, width: pt.x - origin.x, height: pt.y - origin.y } : p)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragRef.current
    dragRef.current = null
    const tool = store.activeTool
    const prev = preview
    const drawn = formRect
    setPreview(null)
    setFormRect(null)
    if (isFormTool(tool) && origin && drawn) {
      const x = Math.min(drawn.x0, drawn.x1)
      const y = Math.min(drawn.y0, drawn.y1)
      void placeFormField(doc.doc_id, page, tool, {
        x, y, width: Math.abs(drawn.x1 - drawn.x0), height: Math.abs(drawn.y1 - drawn.y0),
      }).catch(() => usePdfStore.getState().showToast('No se pudo crear el campo', 'error'))
      return
    }
    if (!origin || !prev || !tool || !DRAG_TOOLS.has(tool)) return

    if (tool === 'draw') {
      if (drawPts.current.length > 2) {
        store.addAnnotation(doc.doc_id, {
          id: crypto.randomUUID(), type: 'draw', page,
          x: origin.x, y: origin.y, points: drawPts.current, ...style(),
        })
        store.releaseTool()
      }
      drawPts.current = []
      return
    }

    const w = prev.width || 0
    const h = prev.height || 0
    if (Math.abs(w) < 2 && Math.abs(h) < 2) return

    if (tool === 'arrow' || tool === 'line' || tool === 'measure_distance') {
      store.addAnnotation(doc.doc_id, {
        id: crypto.randomUUID(),
        type: tool === 'measure_distance' ? 'measure_distance' : tool,
        page, x: origin.x, y: origin.y, width: w, height: h, ...style(),
        ...(tool === 'measure_distance'
          ? { measurement: { value: Math.hypot(w, h), unit: 'px', label: `${Math.hypot(w, h).toFixed(1)} px` } }
          : {}),
      })
      store.releaseTool()
      return
    }

    if (tool === 'callout') {
      store.addAnnotation(doc.doc_id, {
        id: crypto.randomUUID(), type: 'callout', page,
        x: origin.x + w, y: origin.y + h, width: 160, height: 48,
        points: [{ x: origin.x, y: origin.y }], text: '', ...style(),
        fontSize: store.textFontSize, fontFamily: store.textFontFamily,
      })
      store.releaseTool()
      return
    }

    const nx = Math.min(origin.x, origin.x + w)
    const ny = Math.min(origin.y, origin.y + h)
    let nw = Math.abs(w)
    let nh = Math.abs(h)
    if (tool === 'circle') {
      const size = Math.min(nw, nh)
      nw = size
      nh = size
    }
    store.addAnnotation(doc.doc_id, {
      id: crypto.randomUUID(),
      type: tool as Annotation['type'],
      page, x: nx, y: ny, width: nw, height: nh, ...style(),
    })
    store.releaseTool()
    e.stopPropagation()
  }

  return (
    <div
      ref={pageRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        const el = pageRef.current
        if (!el) return
        const pt = pagePoint(e, el, pw, ph)
        const hit = hitTest(pt.sx, pt.sy)
        if (hit && (hit.type === 'text' || hit.type === 'callout')) {
          e.stopPropagation()
          setEditingId(hit.id)
          setEditValue(hit.text || '')
        }
      }}
    >
      <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ pointerEvents: 'none' }}>
        {anns.map((ann) => (
          <g key={ann.id} style={{ pointerEvents: 'auto' }}>
            {renderAnnotation(ann, pd, toScreen, {
              onSelect: (ev) => {
                ev.stopPropagation()
                if (ev.shiftKey) store.selectAnnotations(doc.doc_id, [...selected, ann.id])
                else store.selectAnnotation(doc.doc_id, ann.id)
              },
              countNumbers: countNums,
            })}
            {selected.has(ann.id) && (() => {
              const b = getAnnotationBounds(ann, pd, toScreen)
              if (!b) return null
              return (
                <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4}
                  fill="none" stroke={SEL} strokeWidth={1.5} strokeDasharray="4 2" />
              )
            })()}
          </g>
        ))}
        {preview && renderAnnotation(preview as Annotation, pd, toScreen, { isPreview: true })}
        {formRect && (() => {
          const x0 = Math.min(formRect.x0, formRect.x1)
          const y0 = Math.min(formRect.y0, formRect.y1)
          const a = toScreen(x0, y0)
          const b = toScreen(Math.max(formRect.x0, formRect.x1), Math.max(formRect.y0, formRect.y1))
          return (
            <rect x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y}
              fill={SEL} fillOpacity={0.12} stroke={SEL} strokeWidth={1} strokeDasharray="4 3" />
          )
        })()}
      </svg>
      <FormFieldsLayer fields={formFields} pageData={pd} onChange={updateFormField}
        onTransform={(xref, next) => { void transformField(xref, 'delete' in next ? { delete: true } : next) }}
        interactive={!store.activeTool}
        layoutMode={store.activeTool === 'select'} />
      {noteOpen && selectedAnn?.type === 'note' && (
        <NoteBubble ann={selectedAnn} docId={doc.doc_id} pageData={pd} toScreen={toScreen}
          scale={1} wrapperWidth={width} wrapperHeight={height}
          onClose={() => setNoteOpen(false)} />
      )}
      {selectedAnn && store.selectedAnnotationIds.length <= 1 && !editingId && !textDraft && selectedAnn.type !== 'note' && (
        <FloatingSelectionBar ann={selectedAnn} docId={doc.doc_id}
          pageData={pd} toScreen={toScreen} scale={1} wrapperWidth={width} />
      )}
      {textDraft && (
        <TextBoxEditor x={toScreen(textDraft.x, textDraft.y).x} y={toScreen(textDraft.x, textDraft.y).y}
          zoom={zoom} wrapperWidth={width} value={textValue} onChange={setTextValue}
          onCommit={() => {
            if (textValue.trim()) {
              store.addAnnotation(doc.doc_id, {
                id: crypto.randomUUID(), type: 'text', page, x: textDraft.x, y: textDraft.y,
                color: store.annotationColor, text: textValue,
                fontSize: store.textFontSize, fontFamily: store.textFontFamily,
                ...store.textStyle,
              })
            }
            setTextDraft(null)
            setTextValue('')
          }}
          onCancel={() => { setTextDraft(null); setTextValue('') }}
          fontFamily={store.textFontFamily} fontSize={store.textFontSize} color={store.annotationColor}
          style={store.textStyle}
          onFontFamily={store.setTextFontFamily} onFontSize={store.setTextFontSize} onColor={store.setAnnotationColor}
          onStyle={store.setTextStyle} />
      )}
      {editingId && (() => {
        const ann = anns.find((a) => a.id === editingId)
        if (!ann) return null
        const s = toScreen(ann.x, ann.y)
        return (
          <TextBoxEditor x={s.x} y={s.y} zoom={zoom} wrapperWidth={width}
            value={editValue} onChange={setEditValue}
            onCommit={() => {
              store.updateAnnotation(doc.doc_id, ann.id, { text: editValue })
              setEditingId(null)
              setEditValue('')
            }}
            onCancel={() => { setEditingId(null); setEditValue('') }}
            onDelete={() => { store.deleteAnnotation(doc.doc_id, ann.id); setEditingId(null); setEditValue('') }}
            fontFamily={ann.fontFamily || store.textFontFamily} fontSize={ann.fontSize || store.textFontSize}
            color={ann.color || store.annotationColor}
            style={{
              bold: !!ann.bold, italic: !!ann.italic, align: ann.align || 'left',
              lineHeight: ann.lineHeight || 1.3, listStyle: ann.listStyle || 'none',
            }}
            onFontFamily={(f) => store.updateAnnotation(doc.doc_id, ann.id, { fontFamily: f })}
            onFontSize={(v) => store.updateAnnotation(doc.doc_id, ann.id, { fontSize: v })}
            onColor={(c) => store.updateAnnotation(doc.doc_id, ann.id, { color: c })}
            onStyle={(s) => store.updateAnnotation(doc.doc_id, ann.id, s)} />
        )
      })()}
    </div>
  )
}

// Continuous scroll of the whole document with windowed virtualization.
// Las páginas visibles pintan y aceptan marcas (las que no están en viewport no).
export default function ContinuousView() {
  const store = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'setZoom', 'setViewerSize', 'computeFitZoom',
    'viewerWidth', 'viewerHeight', 'deleteAnnotation', 'selectedAnnotationId',
    'selectedAnnotationIds',
  )
  const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
  const containerRef = useRef<HTMLDivElement>(null)
  const { handleDragOver, handleDrop } = useFileDrop()
  const [formHintOff, setFormHintOff] = useState(false)
  const { fields: currentFormFields } = useFormFields(activeDoc?.doc_id ?? null, activeDoc?.currentPage ?? 0)
  const [range, setRange] = useState({ start: 0, end: 4 })
  const [loaded, setLoaded] = useState<Record<number, string>>({})

  useKeyboardShortcuts(activeDoc, store.selectedAnnotationId, store.deleteAnnotation, () => {})

  const zoom = activeDoc?.zoom ?? 1

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => store.setViewerSize(el.clientWidth, el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeDoc?.doc_id])

  useEffect(() => {
    if (!activeDoc || activeDoc.fitMode === 'custom') return
    const z = store.computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, activeDoc.fitMode, store.viewerWidth, store.viewerHeight)
    if (Math.abs(z - activeDoc.zoom) > 0.001) store.setZoom(activeDoc.doc_id, z, false)
  }, [store.viewerWidth, store.viewerHeight, activeDoc?.fitMode, activeDoc?.doc_id, activeDoc?.currentPage])

  const pageCount = activeDoc?.page_count ?? 0

  const { widths, heights, offsets, total, maxWidth } = useMemo(() => {
    const w: number[] = []
    const h: number[] = []
    const o: number[] = []
    let acc = 0
    let mx = 0
    for (let i = 0; i < pageCount; i++) {
      const ps = activeDoc?.page_sizes[i]
      const pw = (ps?.width || 612) * zoom
      const ph = (ps?.height || 792) * zoom
      o.push(acc)
      w.push(pw)
      h.push(ph)
      mx = Math.max(mx, pw)
      acc += ph + GAP
    }
    return { widths: w, heights: h, offsets: o, total: Math.max(0, acc - GAP), maxWidth: mx }
  }, [pageCount, zoom, activeDoc?.doc_id, activeDoc?.docVersion])

  const internalPageRef = useRef<number | null>(null)

  const recomputeRange = () => {
    const el = containerRef.current
    if (!el || pageCount === 0) return
    const top = el.scrollTop - BUFFER_PX
    const bottom = el.scrollTop + el.clientHeight + BUFFER_PX
    let start = 0
    while (start < pageCount - 1 && offsets[start + 1] <= top) start++
    let end = start
    while (end < pageCount && offsets[end] <= bottom) end++
    setRange({ start, end: Math.max(end, start + 1) })

    const center = el.scrollTop + el.clientHeight / 2
    let cur = 0
    while (cur < pageCount - 1 && offsets[cur + 1] <= center) cur++
    const state = usePdfStore.getState()
    const doc = state.docs.find((d) => d.doc_id === state.activeDocId)
    if (doc && doc.currentPage !== cur) {
      internalPageRef.current = cur
      state.setPage(doc.doc_id, cur)
    }
  }

  useEffect(() => {
    recomputeRange()
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', recomputeRange, { passive: true })
    return () => el.removeEventListener('scroll', recomputeRange)
  }, [pageCount, zoom, total])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !activeDoc) return
    if (internalPageRef.current === activeDoc.currentPage) {
      internalPageRef.current = null
      return
    }
    el.scrollTo({ top: offsets[activeDoc.currentPage] ?? 0, behavior: 'auto' })
  }, [activeDoc?.currentPage, activeDoc?.doc_id])

  const requestedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    requestedRef.current = new Set()
    setLoaded((prev) => { Object.values(prev).forEach(revokePageUrl); return {} })
  }, [activeDoc?.doc_id, activeDoc?.docVersion, zoom])

  useEffect(() => {
    if (!activeDoc) return
    const d = window.devicePixelRatio || 1
    let cancelled = false
    const toRender: number[] = []
    for (let i = range.start; i < range.end && i < pageCount; i++) {
      if (!requestedRef.current.has(i)) { requestedRef.current.add(i); toRender.push(i) }
    }
    if (toRender.length === 0) return
    const pending = new Set(toRender)
    ;(async () => {
      for (const i of toRender) {
        if (cancelled) return
        const ps = activeDoc.page_sizes[i]
        const pw = ps?.width || 612
        const rz = Math.min(3, Math.max(0.5, ((widths[i] || pw) / pw) * d))
        try {
          const r = await renderPdfPage(activeDoc.doc_id, activeDoc.docVersion, i, rz)
          if (cancelled) { revokePageUrl(r.url); return }
          pending.delete(i)
          setLoaded((prev) => prev[i] ? (revokePageUrl(r.url), prev) : { ...prev, [i]: r.url })
        } catch { pending.delete(i); requestedRef.current.delete(i) }
      }
    })()
    return () => {
      cancelled = true
      pending.forEach((i) => requestedRef.current.delete(i))
    }
  }, [range.start, range.end, activeDoc?.doc_id, activeDoc?.docVersion, zoom])

  if (!activeDoc) {
    return <ViewerEmptyState containerRef={containerRef} onDragOver={handleDragOver} onDrop={handleDrop} />
  }

  const topSpacer = offsets[range.start] ?? 0
  const lastRendered = Math.min(range.end, pageCount) - 1
  const bottomStart = lastRendered >= 0 ? (offsets[lastRendered] + heights[lastRendered]) : 0
  const bottomSpacer = Math.max(0, total - bottomStart)

  const pages: number[] = []
  for (let i = range.start; i < range.end && i < pageCount; i++) pages.push(i)

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-surface">
    <div ref={containerRef} className="flex-1 overflow-auto">
      <div style={{ width: Math.max(maxWidth, 0), minWidth: '100%' }}>
        <div style={{ height: topSpacer }} />
        <div className="flex flex-col items-center" style={{ gap: GAP }}>
        {pages.map((i) => {
          const ps = activeDoc.page_sizes[i]
          const pw = ps?.width || 612
          const ph = ps?.height || 792
          return (
            <div
              key={i}
              data-page={i}
              onClick={() => { internalPageRef.current = i; store.setPage(activeDoc.doc_id, i) }}
              className="relative shadow-lg bg-white"
              style={{ width: widths[i], height: heights[i] }}
            >
              {loaded[i] ? (
                <img src={loaded[i]} alt={`Página ${i + 1}`} className="w-full h-full block rounded-sm" draggable={false} />
              ) : (
                <div className="skeleton w-full h-full flex items-center justify-center text-muted">
                  {i + 1}
                </div>
              )}
              <ContinuousPageOverlay
                doc={activeDoc}
                page={i}
                width={widths[i]}
                height={heights[i]}
                pw={pw}
                ph={ph}
              />
              <div className="absolute bottom-1 right-2 text-micro px-1 rounded bg-black/40 text-white/80 pointer-events-none">{i + 1}</div>
            </div>
          )
        })}
        </div>
        <div style={{ height: bottomSpacer }} />
      </div>
    </div>
      {currentFormFields.length > 0 && !formHintOff && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl border border-info/60 bg-panel shadow-token text-mini text-fg">
          <span className="w-2 h-2 rounded-full bg-info shrink-0" />
          Formulario: {currentFormFields.length} campo(s). Seleccioná (V) para mover o borrar.
          <button onClick={() => setFormHintOff(true)} aria-label="Ocultar aviso"
            className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      {store.selectedAnnotationIds.length > 1 && (
        <MultiSelectionBar docId={activeDoc.doc_id} ids={store.selectedAnnotationIds} />
      )}
    </div>
  )
}
