import { usePdfStore } from '../store/usePdfStore'
import { Monitor, CheckCircle2, Loader2, Ruler } from 'lucide-react'
import { useThemeClasses } from '../hooks/useThemeClasses'

export default function StatusBar() {
  const tc = useThemeClasses()
  const store = usePdfStore()
  const { docs, activeDocId, saveStatus, sidebarOpen, toolsPanelOpen, activeTool } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const scale = activeDoc?.measurementScale
  const measuring = !!activeTool && activeTool.startsWith('measure')

  const zoomPercent = activeDoc ? Math.round(activeDoc.zoom * 100) : 100
  const pageLabel = activeDoc
    ? `Página ${activeDoc.currentPage + 1} / ${activeDoc.page_count}`
    : 'Sin documento'
  const dims = activeDoc
    ? `${Math.round(activeDoc.page_sizes[activeDoc.currentPage]?.width || 0)} × ${Math.round(activeDoc.page_sizes[activeDoc.currentPage]?.height || 0)} pt`
    : ''

  return (
    <div className={`h-7 border-t flex items-center px-3 text-xs select-none gap-4 ${tc('bg-slate-950 border-slate-700 text-slate-400', 'bg-gray-100 border-gray-300 text-gray-600')}`}>
      <span className="min-w-[140px]">{pageLabel}</span>
      {dims && <span className="min-w-[100px] text-slate-500">{dims}</span>}
      <span className="min-w-[60px]">Zoom {zoomPercent}%</span>

      {activeDoc && scale && (
        <span className="flex items-center gap-1 text-emerald-500" title="Escala de medición calibrada">
          <Ruler size={12} />
          1 {scale.unit} = {scale.pixelsPerUnit.toFixed(2)} pt
        </span>
      )}
      {activeDoc && !scale && measuring && (
        <span className="flex items-center gap-1 text-amber-500" title="Usa Calibrar escala antes de medir">
          <Ruler size={12} />
          Sin calibrar
        </span>
      )}

      <div className="flex-1" />

      {saveStatus === 'saving' && (
        <span className="flex items-center gap-1 text-blue-400">
          <Loader2 size={12} className="animate-spin" />
          Guardando...
        </span>
      )}
      {saveStatus === 'saved' && (
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 size={12} />
          Guardado
        </span>
      )}

      {(sidebarOpen || toolsPanelOpen) && (
        <span className="text-slate-500">
          <Monitor size={12} className="inline mr-1" />
          {sidebarOpen && toolsPanelOpen ? 'Paneles' : sidebarOpen ? 'Sidebar' : 'Tools'}
        </span>
      )}
    </div>
  )
}
