import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'

// Fullscreen slideshow overlay. Click left/right halves or use arrow keys / space to
// navigate; Esc exits. Renders only the current page bitmap (PDF.js) on a black backdrop.
// La página se rasteriza al alto real de la pantalla en vez de a un 2× fijo: en un
// monitor 4K el 2× se veía blando y en uno pequeño sobraba resolución.
function fitScale(pageHeightPt: number): number {
  const dpr = window.devicePixelRatio || 1
  return Math.min(3, Math.max(1, (window.innerHeight * dpr) / (pageHeightPt || 792)))
}

export default function PresentationView() {
  const store = useStoreSlice('docs', 'activeDocId', 'nextPage', 'prevPage', 'setPage', 'togglePresentationMode')
  const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
  const [img, setImg] = useState<string | null>(null)
  // Página actual y vecinas. Sin esto cada pase esperaba al rasterizado y la
  // diapositiva anterior seguía en pantalla con el contador ya cambiado.
  const cacheRef = useRef<{ key: string; pages: Map<number, string> }>({ key: '', pages: new Map() })

  useEffect(() => {
    if (!activeDoc) { setImg(null); return }
    const { doc_id: docId, docVersion: version, currentPage, page_count: pageCount } = activeDoc
    const key = `${docId}:${version}`
    const cache = cacheRef.current
    if (cache.key !== key) {
      cache.pages.forEach(revokePageUrl)
      cache.pages = new Map()
      cache.key = key
    }
    // Suelta lo lejano antes de pedir nada: la actual y sus vecinas se conservan, así
    // que nunca se revoca el blob que está en pantalla.
    for (const [p, url] of cache.pages) {
      if (Math.abs(p - currentPage) > 1) { revokePageUrl(url); cache.pages.delete(p) }
    }

    let cancelled = false
    const scale = fitScale(activeDoc.page_sizes[currentPage]?.height ?? 792)
    const load = async (p: number): Promise<string | undefined> => {
      if (p < 0 || p >= pageCount) return
      const hit = cache.pages.get(p)
      if (hit) return hit
      const r = await renderPdfPage(docId, version, p, scale)
      if (cache.key !== key) { revokePageUrl(r.url); return }
      cache.pages.set(p, r.url)
      return r.url
    }
    load(currentPage)
      .then((url) => {
        if (cancelled || !url) return
        setImg(url)
        return load(currentPage + 1)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeDoc?.doc_id, activeDoc?.currentPage, activeDoc?.docVersion])

  useEffect(() => () => {
    cacheRef.current.pages.forEach(revokePageUrl)
    cacheRef.current.pages.clear()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeDoc) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); store.nextPage(activeDoc.doc_id)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); store.prevPage(activeDoc.doc_id)
      } else if (e.key === 'Home') {
        e.preventDefault(); store.setPage(activeDoc.doc_id, 0)
      } else if (e.key === 'End') {
        e.preventDefault(); store.setPage(activeDoc.doc_id, activeDoc.page_count - 1)
      } else if (e.key === 'Escape') {
        e.preventDefault(); store.togglePresentationMode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeDoc?.doc_id])

  if (!activeDoc) return null

  return (
    <div role="dialog" aria-modal="true"
      aria-label={`Presentación, página ${activeDoc.currentPage + 1} de ${activeDoc.page_count}`}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none">
      {img && (
        <img src={img} alt={`Página ${activeDoc.currentPage + 1}`} className="max-h-screen max-w-full object-contain" draggable={false} />
      )}

      {/* Click zones */}
      <div aria-hidden className="absolute inset-y-0 left-0 w-1/2 cursor-w-resize" onClick={() => store.prevPage(activeDoc.doc_id)} />
      <div aria-hidden className="absolute inset-y-0 right-0 w-1/2 cursor-e-resize" onClick={() => store.nextPage(activeDoc.doc_id)} />

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 rounded-full px-5 py-2 text-white/90 backdrop-blur">
        <button onClick={() => store.prevPage(activeDoc.doc_id)} disabled={activeDoc.currentPage <= 0} aria-label="Página anterior" className="disabled:opacity-30 hover:text-white"><ChevronLeft size={20} /></button>
        <span className="text-base tabular-nums">{activeDoc.currentPage + 1} / {activeDoc.page_count}</span>
        <button onClick={() => store.nextPage(activeDoc.doc_id)} disabled={activeDoc.currentPage >= activeDoc.page_count - 1} aria-label="Página siguiente" className="disabled:opacity-30 hover:text-white"><ChevronRight size={20} /></button>
      </div>

      <button onClick={() => store.togglePresentationMode()} className="absolute top-5 right-5 text-white/70 hover:text-white" title="Salir (Esc)" aria-label="Salir de la presentación">
        <X size={24} />
      </button>
    </div>
  )
}
