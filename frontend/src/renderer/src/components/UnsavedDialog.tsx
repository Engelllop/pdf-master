import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePdfStore } from '../store/usePdfStore'
import { saveDocument } from '../lib/saveDocument'
import { registerUnsavedHandler, type UnsavedChoice } from '../lib/unsavedPrompt'

/** Aviso de cambios sin guardar, uno solo para los dos caminos: cerrar la ventana
 * (lo pide el proceso main) y cerrar una pestaña (lo pide `closeDocument.ts`).
 * Antes el primero tenía este diálogo y el segundo sacaba el `window.confirm()`
 * de Windows. La acción principal es siempre guardar. */
type Request = {
  docIds: string[]
  /** qué hacer con la respuesta; null = cerrar la app */
  resolve: ((choice: UnsavedChoice) => void) | null
}

export default function UnsavedDialog() {
  const { docs, showToast } = useStoreSlice('docs', 'showToast')
  const [request, setRequest] = useState<Request | null>(null)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(request)
  const savingRef = useRef(saving)
  requestRef.current = request
  savingRef.current = saving

  // Cierre de la ventana completa. Los documentos sucios se leen en ese momento,
  // no en el render.
  useEffect(() => window.api.onConfirmClose(() => {
    const dirty = usePdfStore.getState().docs.filter((d) => d.dirty).map((d) => d.doc_id)
    setRequest({ docIds: dirty, resolve: null })
  }), [])

  // Cierre de una pestaña
  useEffect(() => {
    registerUnsavedHandler((docIds) => new Promise<UnsavedChoice>((resolve) => {
      setRequest({ docIds, resolve })
    }))
  }, [])

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || savingRef.current) return
      e.preventDefault()
      const current = requestRef.current
      if (!current) return
      setRequest(null)
      setSaving(false)
      if (current.resolve) current.resolve('cancel')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return null
  const affected = docs.filter((d) => request.docIds.includes(d.doc_id))
  const isAppClose = request.resolve === null

  const finish = (choice: UnsavedChoice) => {
    const { resolve } = request
    setRequest(null)
    setSaving(false)
    if (resolve) resolve(choice)
    else if (choice !== 'cancel') window.api.forceClose()
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      for (const d of affected) {
        if (!(await saveDocument(d.doc_id))) {
          setSaving(false)
          setRequest(null)
          request.resolve?.('cancel')
          showToast(`No se pudo guardar ${d.file_name}.`, 'error')
          return
        }
      }
      finish('save')
    } catch {
      setSaving(false)
      setRequest(null)
      request.resolve?.('cancel')
      showToast('No se pudo guardar.', 'error')
    }
  }

  return (
    <div className="overlay-in fixed inset-0 z-modal flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) finish('cancel') }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="unsaved-title" tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex]:not([tabindex="-1"])')
          if (!nodes || nodes.length === 0) return
          const first = nodes[0], last = nodes[nodes.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }}
        className="panel-in w-[440px] max-w-[92vw] rounded-token border border-border bg-panel shadow-token-lg overflow-hidden">
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 p-2 rounded-full bg-warning/15 text-warning shrink-0"><AlertTriangle size={18} /></span>
          <div className="min-w-0">
            <h2 id="unsaved-title" className="text-base font-semibold text-fg">
              {affected.length === 1 ? 'Hay un documento sin guardar' : `Hay ${affected.length} documentos sin guardar`}
            </h2>
            <p className="text-mini text-muted mt-1">
              {isAppClose ? 'Si salís sin guardar, esos cambios se pierden.' : 'Si cerrás sin guardar, esos cambios se pierden.'}
            </p>
            <ul className="mt-2 max-h-28 overflow-y-auto text-mini text-fg space-y-0.5">
              {affected.map((d) => (
                <li key={d.doc_id} className="truncate" title={d.file_path}>• {d.file_name}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface">
          <button onClick={() => finish('cancel')} disabled={saving}
            className="px-3 py-1.5 text-mini rounded-token text-fg hover:bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Cancelar
          </button>
          <button onClick={() => finish('discard')} disabled={saving}
            className="px-3 py-1.5 text-mini rounded-token text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {isAppClose ? 'Salir sin guardar' : 'Cerrar sin guardar'}
          </button>
          <button onClick={saveAll} disabled={saving} autoFocus
            className="px-3 py-1.5 text-mini rounded-token bg-accent text-on-accent hover:brightness-110 active:brightness-95 transition-opacity flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Guardando…' : isAppClose ? 'Guardar y salir' : 'Guardar y cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
