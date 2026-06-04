import { usePdfStore } from '../store/usePdfStore'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

export default function Toasts() {
  const { toasts, removeToast } = usePdfStore()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info
        const bg = toast.type === 'success' ? 'bg-green-900/90 border-green-700' : toast.type === 'error' ? 'bg-red-900/90 border-red-700' : 'bg-slate-800/90 border-slate-600'
        return (
          <div key={toast.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm text-white ${bg} min-w-[260px]`}>
            <Icon size={18} className={toast.type === 'success' ? 'text-green-400' : toast.type === 'error' ? 'text-red-400' : 'text-blue-400'} />
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
