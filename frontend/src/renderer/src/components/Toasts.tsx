import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

export default function Toasts() {
  const { toasts, removeToast } = useStoreSlice('toasts', 'removeToast')
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info
        const style = toast.type === 'success'
          ? 'bg-success border-success text-white'
          : toast.type === 'error'
          ? 'bg-danger border-danger text-white'
          : 'bg-fg border-border text-toolbar'
        return (
          <div key={toast.id} role="status" aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            className={`${toast.leaving ? 'toast-leaving' : 'toast-pop'} pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-base ${style} min-w-[260px]`}>
            <Icon size={18} className="shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} aria-label="Cerrar" className="opacity-70 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
