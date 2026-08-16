import { CheckCircle2, Loader2, Ruler, ZoomIn, ZoomOut, Maximize2, MoveVertical, ScrollText, ChevronDown, Pointer } from 'lucide-react'
import { useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { toolLabel } from '../lib/tools'

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export default function StatusBar() {
  const {
    docs, activeDocId, saveStatus, activeTool, stickyTools,
    setZoom, setPage, setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    continuousMode, toggleContinuousMode,
  } = useStoreSlice(
    'docs', 'activeDocId', 'saveStatus', 'activeTool', 'stickyTools',
    'setZoom', 'setPage', 'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'continuousMode', 'toggleContinuousMode',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)

  const scale = activeDoc?.measurementScale
  const measuring = !!activeTool && activeTool.startsWith('measure')
  const zoomPercent = activeDoc ? Math.round(activeDoc.zoom * 100) : 100
  const dims = activeDoc
    ? `${Math.round(activeDoc.page_sizes[activeDoc.currentPage]?.width || 0)} × ${Math.round(activeDoc.page_sizes[activeDoc.currentPage]?.height || 0)} pt`
    : ''

  const applyFit = (mode: 'fit-width' | 'fit-page') => {
    if (!activeDoc) return
    setFitMode(activeDoc.doc_id, mode)
    setZoom(activeDoc.doc_id, computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, mode, viewerWidth, viewerHeight), false)
  }

  const iconBtn = 'p-1 rounded hover:bg-hover text-muted hover:text-fg transition-colors disabled:opacity-30'

  return (
    <div className="h-8 border-t border-border bg-toolbar text-muted flex items-center px-3 text-mini select-none gap-3">
      {activeDoc ? (
        <span className="flex items-center gap-1">
          Pág.
          <input type="number" min={1} max={activeDoc.page_count} value={activeDoc.currentPage + 1}
            onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= activeDoc.page_count) setPage(activeDoc.doc_id, v - 1) }}
            aria-label="Página actual"
            className="w-10 border border-border rounded px-1 py-0.5 text-center bg-panel text-fg focus:outline-none focus:border-accent" />
          / {activeDoc.page_count}
        </span>
      ) : (
        <span>Sin documento</span>
      )}
      {dims && <span className="text-muted">{dims}</span>}

      {activeDoc && scale && (
        <span className="flex items-center gap-1 text-success" title="Escala de medición calibrada">
          <Ruler size={12} /> 1 {scale.unit} = {scale.pixelsPerUnit.toFixed(2)} pt
        </span>
      )}
      {activeDoc && !scale && measuring && (
        <span className="flex items-center gap-1 text-warning" title="Usa Calibrar escala antes de medir">
          <Ruler size={12} /> Sin calibrar
        </span>
      )}

      {activeDoc && activeTool && (
        <span className="flex items-center gap-1.5 text-accent" title="Herramienta activa">
          <Pointer size={12} /> {toolLabel(activeTool)}
          {stickyTools && <span className="text-muted">(fija)</span>}
          <kbd className="px-1 py-px rounded border border-border text-micro text-muted">Esc</kbd>
        </span>
      )}

      <div className="flex-1" />

      {saveStatus === 'saving' && (
        <span className="flex items-center gap-1 text-accent"><Loader2 size={12} className="animate-spin" /> Guardando...</span>
      )}
      {saveStatus !== 'saving' && activeDoc?.dirty && (
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-save'))}
          className="flex items-center gap-1 text-warning hover:text-fg transition-colors"
          title="Guardar cambios" aria-label="Sin guardar. Guardar con Ctrl+S">
          Sin guardar · <kbd className="px-1 py-px rounded border border-border text-micro text-muted">Ctrl+S</kbd>
        </button>
      )}
      {saveStatus === 'saved' && !activeDoc?.dirty && (
        <span className="flex items-center gap-1 text-success"><CheckCircle2 size={12} /> Guardado</span>
      )}

      {activeDoc && (
        <>
          <button onClick={() => toggleContinuousMode()} className={`${iconBtn} ${continuousMode ? 'text-accent' : ''}`}
            title="Scroll continuo" aria-label="Scroll continuo" aria-pressed={continuousMode}>
            <ScrollText size={14} />
          </button>
          <button onClick={() => applyFit('fit-width')} className={iconBtn} title="Ajustar al ancho" aria-label="Ajustar al ancho"><MoveVertical size={14} /></button>
          <button onClick={() => applyFit('fit-page')} className={iconBtn} title="Ajustar página" aria-label="Ajustar página"><Maximize2 size={14} /></button>
          <div className="w-px h-4 bg-border" />
          <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} className={iconBtn} title="Alejar" aria-label="Alejar"><ZoomOut size={14} /></button>
          <div className="relative">
            <button onClick={() => setZoomMenuOpen((o) => !o)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-hover text-fg" title="Nivel de zoom" aria-label="Nivel de zoom" aria-haspopup="menu" aria-expanded={zoomMenuOpen}>
              <span className="w-9 text-right tabular-nums">{zoomPercent}%</span>
              <ChevronDown size={12} className="text-muted" />
            </button>
            {zoomMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setZoomMenuOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1 z-50 w-32 border border-border rounded-token shadow-token py-1 bg-panel">
                  {ZOOM_PRESETS.map((z) => (
                    <button key={z} onClick={() => { setZoom(activeDoc.doc_id, z); setFitMode(activeDoc.doc_id, 'custom'); setZoomMenuOpen(false) }}
                      className={`w-full text-left px-3 py-1 text-mini hover:bg-hover ${Math.round(z * 100) === zoomPercent ? 'bg-accent text-toolbar' : 'text-fg'}`}>
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                  <div className="h-px my-1 bg-border" />
                  <button onClick={() => { applyFit('fit-width'); setZoomMenuOpen(false) }} className="w-full text-left px-3 py-1 text-mini text-fg hover:bg-hover">Ajustar al ancho</button>
                  <button onClick={() => { applyFit('fit-page'); setZoomMenuOpen(false) }} className="w-full text-left px-3 py-1 text-mini text-fg hover:bg-hover">Ajustar página</button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} className={iconBtn} title="Acercar" aria-label="Acercar"><ZoomIn size={14} /></button>
        </>
      )}
    </div>
  )
}
