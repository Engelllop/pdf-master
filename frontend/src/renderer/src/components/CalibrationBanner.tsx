import { useEffect, useState } from 'react'
import { Ruler, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

/** Aviso accionable al activar una medición sin escala calibrada: antes el usuario
 * medía primero y descubría después (por un toast) que el resultado era en píxeles.
 * También explica cómo se usa cada herramienta de medida: sin esto, calibrar y las
 * de varios clics no se entendían (no dicen qué hay que marcar). */
export default function CalibrationBanner() {
  const { docs, activeDocId, activeTool, setActiveTool } = useStoreSlice(
    'docs', 'activeDocId', 'activeTool', 'setActiveTool',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [dismissed, setDismissed] = useState(false)

  // Vuelve a avisar si se cambia de documento o de herramienta.
  useEffect(() => { setDismissed(false) }, [activeDocId, activeTool])

  const HINTS: Record<string, string> = {
    measure_calibrate: 'Arrastrá sobre algo que ya sepas cuánto mide (una cota del plano, un tramo acotado) y escribí su medida real. Eso fija la escala del documento.',
    measure_distance: 'Arrastrá de un punto al otro. Se pega a los vértices del plano.',
    measure_perimeter: 'Un clic por vértice y Enter para terminar: suma la longitud del recorrido (no lo cierra).',
    measure_area: 'Un clic por vértice y Enter para cerrar: da la superficie encerrada.',
    count: 'Cada clic numera una marca de la categoría activa. Cambiá la categoría para contar otra cosa.',
  }

  const hint = activeTool ? HINTS[activeTool] : undefined
  const needsScale = !!activeTool && activeTool.startsWith('measure_') && activeTool !== 'measure_calibrate' && !activeDoc?.measurementScale

  if (!activeDoc || dismissed || (!hint && !needsScale)) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl border border-warning/60 bg-panel shadow-token max-w-[min(680px,90%)]">
      <Ruler size={16} className="text-warning shrink-0" />
      <span className="text-mini text-fg">
        {needsScale && <b className="text-warning">Sin calibrar — las medidas saldrán en píxeles. </b>}
        {hint}
      </span>
      {needsScale && (
        <button onClick={() => setActiveTool('measure_calibrate')}
          className="text-mini px-2.5 py-1 rounded bg-fg text-toolbar hover:opacity-90 transition-opacity shrink-0">
          Calibrar
        </button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Descartar aviso"
        className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}
