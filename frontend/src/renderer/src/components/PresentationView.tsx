import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'

// Fullscreen slideshow overlay. Click left/right halves or use arrow keys / space to
// navigate; Esc exits. Renders only the current page bitmap (PDF.js) on a black backdrop.
export default function PresentationView() {
  const store = useStoreSlice('docs', 'activeDocId', 'nextPage', 'prevPage', 'togglePresentationMode')
  const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
  const [img, setImg] = useState<string | null>(null)

  useEffect(() => {
    if (!activeDoc) { setImg(null); return }
    let url: string | null = null
    let cancelled = false
    renderPdfPage(activeDoc.doc_id, activeDoc.docVersion, activeDoc.currentPage, 2)
      .then((r) => { if (cancelled) { revokePageUrl(r.url); return } url = r.url; setImg(r.url) })
      .catch(() => {})
    return () => { cancelled = true; revokePageUrl(url || undefined) }
  }, [activeDoc?.doc_id, activeDoc?.currentPage, activeDoc?.docVersion])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeDoc) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); store.nextPage(activeDoc.doc_id)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); store.prevPage(activeDoc.doc_id)
      } else if (e.key === 'Escape') {
        e.preventDefault(); store.togglePresentationMode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeDoc?.doc_id])

  if (!activeDoc) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none">
      {img && (
        <img src={img} alt={`Página ${activeDoc.currentPage + 1}`} className="max-h-screen max-w-full object-contain" draggable={false} />
      )}

      {/* Click zones */}
      <div className="absolute inset-y-0 left-0 w-1/2 cursor-w-resize" onClick={() => store.prevPage(activeDoc.doc_id)} />
      <div className="absolute inset-y-0 right-0 w-1/2 cursor-e-resize" onClick={() => store.nextPage(activeDoc.doc_id)} />

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 rounded-full px-5 py-2 text-white/90 backdrop-blur">
        <button onClick={() => store.prevPage(activeDoc.doc_id)} disabled={activeDoc.currentPage <= 0} className="disabled:opacity-30 hover:text-white"><ChevronLeft size={20} /></button>
        <span className="text-sm tabular-nums">{activeDoc.currentPage + 1} / {activeDoc.page_count}</span>
        <button onClick={() => store.nextPage(activeDoc.doc_id)} disabled={activeDoc.currentPage >= activeDoc.page_count - 1} className="disabled:opacity-30 hover:text-white"><ChevronRight size={20} /></button>
      </div>

      <button onClick={() => store.togglePresentationMode()} className="absolute top-5 right-5 text-white/70 hover:text-white" title="Salir (Esc)">
        <X size={24} />
      </button>
    </div>
  )
}
