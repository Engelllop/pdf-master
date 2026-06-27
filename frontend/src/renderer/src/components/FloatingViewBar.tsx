import { useEffect, useState } from 'react'
import { ZoomIn, ZoomOut, ChevronUp, ChevronDown, Maximize2, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

// Barra flotante de zoom/navegación (estilo SwifDoo): aparece centrada abajo cuando
// NO estás en la pestaña Leer, para no perder el acceso a zoom y paso de página.
export default function FloatingViewBar() {
  const {
    docs, activeDocId, activeRibbon, setZoom, setPage, setFitMode,
    computeFitZoom, viewerWidth, viewerHeight, togglePresentationMode,
  } = useStoreSlice(
    'docs', 'activeDocId', 'activeRibbon', 'setZoom', 'setPage', 'setFitMode',
    'computeFitZoom', 'viewerWidth', 'viewerHeight', 'togglePresentationMode',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [dismissed, setDismissed] = useState(false)
  const [zoomMenu, setZoomMenu] = useState(false)
  // Reaparece al cambiar de pestaña aunque el usuario la haya ocultado.
  useEffect(() => { setDismissed(false) }, [activeRibbon])

  if (!activeDoc || activeRibbon === 'read' || dismissed) return null
  const zoomPercent = Math.round(activeDoc.zoom * 100)
  const applyFit = (mode: 'fit-width' | 'fit-page') => {
    setFitMode(activeDoc.doc_id, mode)
    setZoom(activeDoc.doc_id, computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, mode, viewerWidth, viewerHeight), false)
  }
  const iconBtn = 'p-1.5 rounded hover:bg-hover text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1 rounded-xl border border-border bg-panel shadow-token">
      <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} className={iconBtn} title="Alejar"><ZoomOut size={16} /></button>
      <div className="relative">
        <button onClick={() => setZoomMenu((o) => !o)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-hover text-fg text-xs font-mono" title="Nivel de zoom">
          {zoomPercent}%<ChevronDown size={12} className="text-muted" />
        </button>
        {zoomMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setZoomMenu(false)} />
            <div className="absolute bottom-full left-0 mb-1 z-50 w-32 border border-border rounded-token shadow-token py-1 bg-panel">
              {ZOOM_PRESETS.map((z) => (
                <button key={z} onClick={() => { setZoom(activeDoc.doc_id, z); setFitMode(activeDoc.doc_id, 'custom'); setZoomMenu(false) }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-hover ${Math.round(z * 100) === zoomPercent ? 'text-accent' : 'text-fg'}`}>
                  {Math.round(z * 100)}%
                </button>
              ))}
              <div className="h-px my-1 bg-border" />
              <button onClick={() => { applyFit('fit-width'); setZoomMenu(false) }} className="w-full text-left px-3 py-1 text-xs text-fg hover:bg-hover">Ajustar al ancho</button>
              <button onClick={() => { applyFit('fit-page'); setZoomMenu(false) }} className="w-full text-left px-3 py-1 text-xs text-fg hover:bg-hover">Ajustar página</button>
            </div>
          </>
        )}
      </div>
      <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} className={iconBtn} title="Acercar"><ZoomIn size={16} /></button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button onClick={() => setPage(activeDoc.doc_id, Math.max(0, activeDoc.currentPage - 1))} disabled={activeDoc.currentPage <= 0} className={iconBtn} title="Página anterior"><ChevronUp size={16} /></button>
      <span className="text-xs font-mono text-fg tabular-nums px-1">{activeDoc.currentPage + 1} / {activeDoc.page_count}</span>
      <button onClick={() => setPage(activeDoc.doc_id, Math.min(activeDoc.page_count - 1, activeDoc.currentPage + 1))} disabled={activeDoc.currentPage >= activeDoc.page_count - 1} className={iconBtn} title="Página siguiente"><ChevronDown size={16} /></button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button onClick={() => togglePresentationMode()} className={iconBtn} title="Pantalla completa"><Maximize2 size={16} /></button>
      <button onClick={() => setDismissed(true)} className={iconBtn} title="Ocultar barra"><X size={16} /></button>
    </div>
  )
}
