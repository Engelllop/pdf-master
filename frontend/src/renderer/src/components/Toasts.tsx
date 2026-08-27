import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

export default function Toasts() {
  const { toasts, removeToast } = useStoreSlice('toasts', 'removeToast')
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info
        // Panel con una barra de color y el icono teñido, no un bloque saturado: un
        // rectángulo verde o rojo entero sobre el plano compite con las marcas del
        // usuario y, encima, obliga a texto blanco sobre un fondo que en claro casi
        // no contrasta.
        const tinte = toast.type === 'success' ? 'text-success' : toast.type === 'error' ? 'text-danger' : 'text-info'
        const barra = toast.type === 'success' ? 'bg-success' : toast.type === 'error' ? 'bg-danger' : 'bg-info'
        return (
          <div key={toast.id} role="status" aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            className={`${toast.leaving ? 'toast-leaving' : 'toast-pop'} pointer-events-auto relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-token border border-border bg-panel text-fg shadow-token-lg text-base min-w-[280px] max-w-[420px] overflow-hidden`}>
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${barra}`} aria-hidden />
            <Icon size={16} className={`shrink-0 ${tinte}`} />
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} aria-label="Cerrar"
              className="shrink-0 p-1 -mr-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors duration-fast ease-token">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
