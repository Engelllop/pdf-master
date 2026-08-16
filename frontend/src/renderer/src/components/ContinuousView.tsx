import { useEffect, useMemo, useRef, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePdfStore } from '../store/usePdfStore'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'

const GAP = 16
const BUFFER_PX = 1200

// Read-only continuous scroll of the whole document with windowed virtualization:
// only pages near the viewport are rendered; the rest are sized placeholders so the
// scrollbar stays correct. Shares the page bitmap cache with the single-page viewer.
export default function ContinuousView() {
  const store = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'setZoom', 'setViewerSize', 'computeFitZoom',
    'viewerWidth', 'viewerHeight',
  )
  const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 4 })
  const [loaded, setLoaded] = useState<Record<number, string>>({})

  // El zoom es el mismo de la cinta/barra flotante (px por punto): antes esta vista
  // lo ignoraba y ajustaba al ancho del panel, así que los botones no hacían nada.
  const zoom = activeDoc?.zoom ?? 1

  // Tamaño del panel → el store lo usa para calcular los modos de ajuste
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => store.setViewerSize(el.clientWidth, el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeDoc?.doc_id])

  // Con un modo de ajuste activo, reajustar al cambiar de tamaño o de página
  useEffect(() => {
    if (!activeDoc || activeDoc.fitMode === 'custom') return
    const z = store.computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, activeDoc.fitMode, store.viewerWidth, store.viewerHeight)
    if (Math.abs(z - activeDoc.zoom) > 0.001) store.setZoom(activeDoc.doc_id, z, false)
  }, [store.viewerWidth, store.viewerHeight, activeDoc?.fitMode, activeDoc?.doc_id, activeDoc?.currentPage])

  const pageCount = activeDoc?.page_count ?? 0

  // Anchos/altos y desplazamientos acumulados al zoom actual
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

  // Página cuyo cambio nació aquí (scroll o clic): el efecto de auto-scroll la
  // ignora para no pelear con el scroll del usuario.
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

    // Sincroniza currentPage con la página en el centro del viewport, para que la
    // barra de estado y las miniaturas sigan el scroll (antes quedaban clavadas).
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

  // Scroll to the active page when it is changed from elsewhere (thumbnails, search…)
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

  // Reset bitmaps (y revoca los blobs) cuando cambia el documento o su layout.
  // Va ANTES del efecto de render: React ejecuta los cuerpos en orden de
  // declaración, así el render arranca ya con el set limpio.
  useEffect(() => {
    requestedRef.current = new Set()
    setLoaded((prev) => { Object.values(prev).forEach(revokePageUrl); return {} })
  }, [activeDoc?.doc_id, activeDoc?.docVersion, zoom])

  // Render the visible window locally with PDF.js (sin round-trip a Python).
  useEffect(() => {
    if (!activeDoc) return
    const d = window.devicePixelRatio || 1
    let cancelled = false
    const toRender: number[] = []
    for (let i = range.start; i < range.end && i < pageCount; i++) {
      if (!requestedRef.current.has(i)) { requestedRef.current.add(i); toRender.push(i) }
    }
    if (toRender.length === 0) return
    // Las páginas que quedan sin dibujar al cancelar el efecto (cambio de rango
    // mientras se renderizaba) tienen que salir del set: si no, se marcan como
    // "pedidas" para siempre y se quedan en gris — pasaba al volver de comparar.
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
    return <div className="flex-1 flex items-center justify-center bg-surface text-muted">Abre un PDF</div>
  }

  const topSpacer = offsets[range.start] ?? 0
  const lastRendered = Math.min(range.end, pageCount) - 1
  const bottomStart = lastRendered >= 0 ? (offsets[lastRendered] + heights[lastRendered]) : 0
  const bottomSpacer = Math.max(0, total - bottomStart)

  const pages: number[] = []
  for (let i = range.start; i < range.end && i < pageCount; i++) pages.push(i)

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-surface">
      <div className="sticky top-0 z-10 mx-auto max-w-xl mt-2 mb-1 px-3 py-1.5 rounded border border-border bg-panel text-mini text-muted text-center">
        Vista continua: solo lectura. Volvé a página única para marcar.
      </div>
      <div style={{ width: Math.max(maxWidth, 0), minWidth: '100%' }}>
        <div style={{ height: topSpacer }} />
        <div className="flex flex-col items-center" style={{ gap: GAP }}>
        {pages.map((i) => (
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
            <div className="absolute bottom-1 right-2 text-micro px-1 rounded bg-black/40 text-white/80 pointer-events-none">{i + 1}</div>
          </div>
        ))}
        </div>
        <div style={{ height: bottomSpacer }} />
      </div>
    </div>
  )
}
