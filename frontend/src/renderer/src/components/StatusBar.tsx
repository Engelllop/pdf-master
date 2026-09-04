import { CheckCircle2, Loader2, Ruler, ZoomIn, ZoomOut, Maximize2, MoveVertical, ScrollText, ChevronDown, Pointer } from 'lucide-react'
import { useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { toolLabel } from '../lib/tools'
import { scaleForPage } from '../store/usePdfStore'

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export default function StatusBar() {
  const {
    docs, activeDocId, saveStatus, activeTool, stickyTools,
    setZoom, setPage, setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    continuousMode, toggleContinuousMode, compareMode,
    setMeasurementScale, showToast,
  } = useStoreSlice(
    'docs', 'activeDocId', 'saveStatus', 'activeTool', 'stickyTools',
    'setZoom', 'setPage', 'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'continuousMode', 'toggleContinuousMode', 'compareMode',
    'setMeasurementScale', 'showToast',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)

  // La escala se muestra por página: en un juego con láminas a distinta escala, la
  // del documento no es la que se está usando para medir acá.
  const pagina = activeDoc?.currentPage ?? 0
  const scale = scaleForPage(activeDoc, pagina)
  // Escala propia de ESTA lámina (un juego mezcla escalas). Se distingue de la heredada
  // del documento porque son cosas distintas al recalibrar: recalibrar el documento no
  // toca las láminas con escala propia, así que el usuario tiene que ver cuál está
  // usando — y poder devolver la lámina a la del documento si la calibró por error.
  const escalaPropia = activeDoc?.pageScales?.[pagina]
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

  const iconBtn = 'w-7 h-7 inline-flex items-center justify-center rounded-token-sm hover:bg-hover text-muted hover:text-fg transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'

  return (
    <div className="h-status material material-edge text-muted flex items-center px-3 text-mini select-none gap-3">
      {activeDoc ? (
        <span className="flex items-center gap-1">
          Pág.
          <input type="number" min={1} max={activeDoc.page_count} value={activeDoc.currentPage + 1}
            onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= activeDoc.page_count) setPage(activeDoc.doc_id, v - 1) }}
            aria-label="Página actual"
            className="w-10 border border-border rounded-token-sm px-1 py-0.5 text-center bg-panel text-fg focus:outline-none focus:border-accent" />
          / {activeDoc.page_count}
        </span>
      ) : (
        <span>Sin documento</span>
      )}
      {dims && <span className="text-muted">{dims}</span>}

      {activeDoc && scale && (
        <span className="flex items-center gap-1 text-muted"
          title={escalaPropia
            ? `Escala propia de la página ${pagina + 1} (el documento usa otra)`
            : 'Escala de medición del documento'}>
          <Ruler size={12} /> 1 {scale.unit} = {scale.pixelsPerUnit.toFixed(2)} pt
          {escalaPropia && (
            <>
              <span className="text-micro text-muted">· pág. {pagina + 1}</span>
              <button
                onClick={() => {
                  setMeasurementScale(activeDoc.doc_id, null, pagina)
                  showToast(`La página ${pagina + 1} vuelve a la escala del documento`, 'info')
                }}
                className="text-micro text-muted hover:text-fg underline decoration-dotted"
                title="Quitar la escala propia de esta página y usar la del documento">
                usar la del documento
              </button>
            </>
          )}
        </span>
      )}
      {activeDoc && !scale && measuring && (
        <span className="flex items-center gap-1 text-warning" title="Usa Calibrar escala antes de medir">
          <Ruler size={12} /> Sin calibrar
        </span>
      )}

      {activeDoc && activeTool && (
        <span className="flex items-center gap-1.5 text-fg" title="Herramienta activa">
          <Pointer size={12} /> {toolLabel(activeTool)}
          {stickyTools && <span className="text-muted">(fija)</span>}
          <kbd className="px-1 py-px rounded-token-sm border border-border text-micro text-muted">Esc</kbd>
        </span>
      )}

      <div className="flex-1" />

      {saveStatus === 'saving' && (
        <span className="flex items-center gap-1 text-fg"><Loader2 size={12} className="animate-spin" /> Guardando...</span>
      )}
      {saveStatus !== 'saving' && activeDoc?.dirty && (
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-save'))}
          className="flex items-center gap-1 text-warning hover:text-fg transition-colors"
          title="Guardar cambios" aria-label="Sin guardar. Guardar con Ctrl+S">
          Sin guardar · <kbd className="px-1 py-px rounded-token-sm border border-border text-micro text-muted">Ctrl+S</kbd>
        </button>
      )}
      {saveStatus === 'saved' && !activeDoc?.dirty && (
        <span className="flex items-center gap-1 text-success"><CheckCircle2 size={12} /> Guardado</span>
      )}

      {activeDoc && !compareMode && (
        <>
          <button onClick={() => toggleContinuousMode()} className={`${iconBtn} ${continuousMode ? 'bg-accent text-on-accent hover:text-on-accent' : ''}`}
            title="Scroll continuo" aria-label="Scroll continuo" aria-pressed={continuousMode}>
            <ScrollText size={14} />
          </button>
          <button onClick={() => applyFit('fit-width')} className={iconBtn} title="Ajustar al ancho" aria-label="Ajustar al ancho"><MoveVertical size={14} /></button>
          <button onClick={() => applyFit('fit-page')} className={iconBtn} title="Ajustar página" aria-label="Ajustar página"><Maximize2 size={14} /></button>
          <div className="w-px h-4 mx-1 bg-border" />
          <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} className={iconBtn} title="Alejar" aria-label="Alejar"><ZoomOut size={14} /></button>
          <div className="relative">
            <button onClick={() => setZoomMenuOpen((o) => !o)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-token-sm hover:bg-hover text-fg" title="Nivel de zoom" aria-label="Nivel de zoom" aria-haspopup="menu" aria-expanded={zoomMenuOpen}>
              <span className="w-9 text-right tabular">{zoomPercent}%</span>
              <ChevronDown size={12} className="text-muted" />
            </button>
            {zoomMenuOpen && (
              <>
                <div className="fixed inset-0 z-sticky" onClick={() => setZoomMenuOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1 z-dropdown w-32 border border-border rounded-token shadow-token-md py-1 bg-panel">
                  {ZOOM_PRESETS.map((z) => (
                    <button key={z} onClick={() => { setZoom(activeDoc.doc_id, z); setFitMode(activeDoc.doc_id, 'custom'); setZoomMenuOpen(false) }}
                      className={`w-full text-left px-3 py-1 text-mini hover:bg-hover ${Math.round(z * 100) === zoomPercent ? 'bg-accent text-on-accent' : 'text-fg'}`}>
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
