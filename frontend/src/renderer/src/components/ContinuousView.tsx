import { useEffect, useMemo, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useThemeClasses } from '../hooks/useThemeClasses'

const API_BASE = 'http://localhost:8745'
const GAP = 16
const BUFFER_PX = 1200
const MAX_WIDTH = 1000

// Read-only continuous scroll of the whole document with windowed virtualization:
// only pages near the viewport are rendered; the rest are sized placeholders so the
// scrollbar stays correct. Shares the page bitmap cache with the single-page viewer.
export default function ContinuousView() {
  const tc = useThemeClasses()
  const store = usePdfStore()
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
    el.scrollTo({ top: offsets[activeDoc.currentPage] ?? 0, behavior: 'auto' })
  }, [activeDoc?.currentPage, activeDoc?.doc_id])

  // Assign binary image URLs for the visible window (the browser streams/caches the PNGs)
  useEffect(() => {
    if (!activeDoc) return
    const d = window.devicePixelRatio || 1
    setLoaded((prev) => {
      const next = { ...prev }
      let changed = false
      for (let i = range.start; i < range.end && i < pageCount; i++) {
        if (next[i]) continue
        const ps = activeDoc.page_sizes[i]
        const pw = ps?.width || 612
        const rz = Math.min(3, Math.max(1, (width / pw) * d))
        next[i] = `${API_BASE}/pdf/page-image/${activeDoc.doc_id}/${i}?zoom=${rz}&v=${activeDoc.docVersion}`
        changed = true
      }
      return changed ? next : prev
    })
  }, [range.start, range.end, activeDoc?.doc_id, activeDoc?.docVersion, width])

  // Reset loaded bitmaps when the document or its layout changes
  useEffect(() => { setLoaded({}) }, [activeDoc?.doc_id, activeDoc?.docVersion])

  if (!activeDoc) {
    return <div className={`flex-1 flex items-center justify-center ${tc('bg-slate-900 text-slate-500', 'bg-gray-100 text-gray-500')}`}>Abre un PDF</div>
  }

  const topSpacer = offsets[range.start] ?? 0
  const lastRendered = Math.min(range.end, pageCount) - 1
  const bottomStart = lastRendered >= 0 ? (offsets[lastRendered] + heights[lastRendered]) : 0
  const bottomSpacer = Math.max(0, total - bottomStart)

  const pages: number[] = []
  for (let i = range.start; i < range.end && i < pageCount; i++) pages.push(i)

  return (
    <div ref={containerRef} className={`flex-1 overflow-auto ${tc('bg-slate-900', 'bg-gray-100')}`}>
      <div style={{ height: topSpacer }} />
      <div className="flex flex-col items-center" style={{ gap: GAP }}>
        {pages.map((i) => (
          <div
            key={i}
            data-page={i}
            onClick={() => store.setPage(activeDoc.doc_id, i)}
            className={`relative shadow-lg ${tc('bg-white', 'bg-white')}`}
            style={{ width, height: heights[i] }}
          >
            {loaded[i] ? (
              <img src={loaded[i]} alt={`Página ${i + 1}`} className="w-full h-full block rounded-sm" draggable={false} />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${tc('bg-slate-800 text-slate-600', 'bg-gray-200 text-gray-400')}`}>
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
