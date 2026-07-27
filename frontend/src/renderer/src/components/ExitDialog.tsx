import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { saveDocument } from '../lib/saveDocument'

/** Aviso propio al cerrar con cambios sin guardar. El cuadro nativo de Windows
 * desentonaba y solo ofrecía perder el trabajo; aquí lo normal (guardar y salir) es
 * la acción principal. */
export default function ExitDialog() {
  const { docs, showToast } = useStoreSlice('docs', 'showToast')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => window.api.onConfirmClose(() => setOpen(true)), [])

  if (!open) return null
  const dirty = docs.filter((d) => d.dirty)

  const saveAndExit = async () => {
    setSaving(true)
    try {
      for (const d of dirty) {
        if (!(await saveDocument(d.doc_id))) {
          setSaving(false)
          setOpen(false)
          showToast(`No se pudo guardar ${d.file_name}. No se cerró la app.`, 'error')
          return
        }
      }
      window.api.forceClose()
    } catch {
      setSaving(false)
      setOpen(false)
      showToast('No se pudo guardar. No se cerró la app.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false) }}>
      <div className="w-[440px] max-w-[92vw] rounded-2xl border border-border bg-panel shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 p-2 rounded-full bg-amber-500/15 text-amber-500 shrink-0"><AlertTriangle size={18} /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">
              {dirty.length === 1 ? 'Hay un documento sin guardar' : `Hay ${dirty.length} documentos sin guardar`}
            </h2>
            <p className="text-xs text-muted mt-1">Si salís sin guardar, esos cambios se pierden.</p>
            <ul className="mt-2 max-h-28 overflow-y-auto text-xs text-fg space-y-0.5">
              {dirty.map((d) => (
                <li key={d.doc_id} className="truncate" title={d.file_path}>• {d.file_name}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface">
          <button onClick={() => setOpen(false)} disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg text-fg hover:bg-hover transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => window.api.forceClose()} disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
            Salir sin guardar
          </button>
          <button onClick={saveAndExit} disabled={saving} autoFocus
            className="px-3 py-1.5 text-xs rounded-lg bg-accent text-toolbar hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-70">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar y salir'}
          </button>
        </div>
      </div>
    </div>
  )
}
