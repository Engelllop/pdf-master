import { useEffect, useMemo, useRef, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePdfStore } from '../store/usePdfStore'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'

const GAP = 16
const BUFFER_PX = 1200
const MAX_WIDTH = 1000

// Read-only continuous scroll of the whole document with windowed virtualization:
// only pages near the viewport are rendered; the rest are sized placeholders so the
// scrollbar stays correct. Shares the page bitmap cache with the single-page viewer.
export default function ContinuousView() {
  const store = useStoreSlice('docs', 'activeDocId', 'setPage')
  const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(MAX_WIDTH)
  const [range, setRange] = useState({ start: 0, end: 4 })
  const [loaded, setLoaded] = useState<Record<number, string>>({})

  // Track container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setWidth(Math.min(MAX_WIDTH, Math.max(200, el.clientWidth - 32)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeDoc?.doc_id])

  const pageCount = activeDoc?.page_count ?? 0

  // Page heights / cumulative offsets at the current display width
  const { heights, offsets, total } = useMemo(() => {
    const h: number[] = []
    const o: number[] = []
    let acc = 0
    for (let i = 0; i < pageCount; i++) {
      const ps = activeDoc?.page_sizes[i]
      const pw = ps?.width || 612
      const ph = ps?.height || 792
      const ph_i = width * (ph / pw)
      o.push(acc)
      h.push(ph_i)
      acc += ph_i + GAP
    }
    return { heights: h, offsets: o, total: Math.max(0, acc - GAP) }
  }, [pageCount, width, activeDoc?.doc_id, activeDoc?.docVersion])

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
  }, [pageCount, width, total])

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

  // Render the visible window locally with PDF.js (sin round-trip a Python).
  const requestedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!activeDoc) return
    const d = window.devicePixelRatio || 1
    let cancelled = false
    const toRender: number[] = []
    for (let i = range.start; i < range.end && i < pageCount; i++) {
      if (!requestedRef.current.has(i)) { requestedRef.current.add(i); toRender.push(i) }
    }
    if (toRender.length === 0) return
    ;(async () => {
      for (const i of toRender) {
        if (cancelled) return
        const ps = activeDoc.page_sizes[i]
        const pw = ps?.width || 612
        const rz = Math.min(3, Math.max(1, (width / pw) * d))
        try {
          const r = await renderPdfPage(activeDoc.doc_id, activeDoc.docVersion, i, rz)
          if (cancelled) { revokePageUrl(r.url); return }
          setLoaded((prev) => prev[i] ? (revokePageUrl(r.url), prev) : { ...prev, [i]: r.url })
        } catch { requestedRef.current.delete(i) }
      }
    })()
    return () => { cancelled = true }
  }, [range.start, range.end, activeDoc?.doc_id, activeDoc?.docVersion, width])

  // Reset bitmaps (y revoca los blobs) cuando cambia el documento o su layout
  useEffect(() => {
    requestedRef.current = new Set()
    setLoaded((prev) => { Object.values(prev).forEach(revokePageUrl); return {} })
  }, [activeDoc?.doc_id, activeDoc?.docVersion, width])

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
      <div style={{ height: topSpacer }} />
      <div className="flex flex-col items-center" style={{ gap: GAP }}>
        {pages.map((i) => (
          <div
            key={i}
            data-page={i}
            onClick={() => { internalPageRef.current = i; store.setPage(activeDoc.doc_id, i) }}
            className="relative shadow-lg bg-white"
            style={{ width, height: heights[i] }}
          >
            {loaded[i] ? (
              <img src={loaded[i]} alt={`Página ${i + 1}`} className="w-full h-full block rounded-sm" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-active text-muted">
                {i + 1}
              </div>
            )}
            <div className="absolute bottom-1 right-2 text-[10px] px-1 rounded bg-black/40 text-white/80 pointer-events-none">{i + 1}</div>
          </div>
        ))}
      </div>
      <div style={{ height: bottomSpacer }} />
    </div>
  )
}
