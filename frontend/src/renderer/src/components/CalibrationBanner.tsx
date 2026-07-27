import { useEffect, useState } from 'react'
import { Ruler, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

/** Aviso accionable al activar una medición sin escala calibrada: antes el usuario
 * medía primero y descubría después (por un toast) que el resultado era en píxeles. */
export default function CalibrationBanner() {
  const { docs, activeDocId, activeTool, setActiveTool } = useStoreSlice(
    'docs', 'activeDocId', 'activeTool', 'setActiveTool',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [dismissed, setDismissed] = useState(false)

  // Vuelve a avisar si se cambia de documento o de herramienta.
  useEffect(() => { setDismissed(false) }, [activeDocId, activeTool])

  const measuring = activeTool === 'measure_distance' || activeTool === 'measure_area'
  if (!activeDoc || !measuring || activeDoc.measurementScale || dismissed) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl border border-amber-500/60 bg-panel shadow-token">
      <Ruler size={16} className="text-amber-500 shrink-0" />
      <span className="text-xs text-fg">
        Sin calibrar — las medidas saldrán en píxeles
      </span>
      <button onClick={() => setActiveTool('measure_calibrate')}
        className="text-xs px-2.5 py-1 rounded bg-fg text-toolbar hover:opacity-90 transition-opacity">
        Calibrar ahora
      </button>
      <button onClick={() => setDismissed(true)} title="Medir en píxeles" aria-label="Descartar aviso"
        className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}
