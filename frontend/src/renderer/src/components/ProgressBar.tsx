import { Loader2, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

/** Aviso flotante de operación larga: qué se está haciendo, por dónde va y cómo
 * pararlo. No es modal a propósito: se puede seguir leyendo el documento. */
export default function ProgressBar() {
  const { progress, requestCancel } = useStoreSlice('progress', 'requestCancel')
  if (!progress) return null

  const { label, detail, current, total, cancelable, canceled } = progress
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null

  return (
    <div role="status" aria-live="polite"
      className="toast-pop absolute bottom-16 left-1/2 -translate-x-1/2 z-sticky w-[380px] max-w-[92vw] px-3 py-2.5 rounded-token-lg border border-border bg-panel shadow-token-md">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="text-fg animate-spin shrink-0" />
        <span className="text-mini text-fg flex-1 truncate">
          {canceled ? `Cancelando ${label.toLowerCase()}…` : label}
        </span>
        {pct !== null && <span className="text-micro text-muted tabular">{current}/{total}</span>}
        {cancelable && !canceled && (
          <button onClick={requestCancel} title="Cancelar" aria-label="Cancelar operación"
            className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-hover overflow-hidden">
        {/* Progreso constante = curva lineal: con `ease-token` la barra se frenaba y
            arrancaba en cada tick. Y sin porcentaje conocido, recorre en vez de
            parpadear en el sitio, que es lo que dice "sigo trabajando". */}
        <div className={`h-full bg-fg transition-[width] duration-token ease-linear ${pct === null ? 'w-1/3 progreso-indet' : ''}`}
          style={pct !== null ? { width: `${pct}%` } : undefined} />
      </div>
      {detail && <div className="mt-1 text-micro text-muted truncate">{detail}</div>}
    </div>
  )
}
