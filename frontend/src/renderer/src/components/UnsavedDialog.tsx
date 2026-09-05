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

/** Lo que dura `panel-out`/`overlay-out` en App.css (`--dur-fast`). */
const SALIDA = 120
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export default function UnsavedDialog() {
  const { docs, showToast } = useStoreSlice('docs', 'showToast')
  const [request, setRequest] = useState<Request | null>(null)
  const [saving, setSaving] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(request)
  const savingRef = useRef(saving)
  const cerrando = useRef(false)
  const salida = useRef<number | null>(null)
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

  useEffect(() => () => { if (salida.current) clearTimeout(salida.current) }, [])

  /** Único camino de cierre para Esc, el clic en el fondo y los tres botones: la
   * respuesta se entrega YA y el diálogo se desmonta cuando acaba su salida. El
   * guardia impide entregar dos respuestas o animar la salida dos veces. */
  const finish = (choice: UnsavedChoice) => {
    if (cerrando.current) return
    cerrando.current = true
    const resolve = requestRef.current?.resolve
    if (resolve) resolve(choice)
    else if (choice !== 'cancel') window.api.forceClose()
    // `saving` se limpia al desmontar, no ahora: el botón no puede volver de
    // «Guardando…» a su texto normal mientras el panel todavía se está yendo.
    const desmontar = () => {
      cerrando.current = false
      setSaliendo(false)
      setSaving(false)
      setRequest(null)
    }
    if (sinMovimiento()) { desmontar(); return }
    setSaliendo(true)
    salida.current = window.setTimeout(desmontar, SALIDA)
  }

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || savingRef.current || cerrando.current) return
      e.preventDefault()
      finish('cancel')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return null
  const affected = docs.filter((d) => request.docIds.includes(d.doc_id))
  const isAppClose = request.resolve === null

  const saveAll = async () => {
    setSaving(true)
    try {
      for (const d of affected) {
        if (!(await saveDocument(d.doc_id))) {
          showToast(`No se pudo guardar ${d.file_name}.`, 'error')
          finish('cancel')
          return
        }
      }
      finish('save')
    } catch {
      showToast('No se pudo guardar.', 'error')
      finish('cancel')
    }
  }

  return (
    <div className="overlay-in fixed inset-0 z-modal flex items-center justify-center bg-[rgb(var(--scrim)/0.45)] backdrop-blur-[2px]"
      data-closing={saliendo || undefined}
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
            className="px-3 py-1.5 text-mini rounded-token text-fg hover:bg-hover transition-colors duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed">
            Cancelar
          </button>
          <button onClick={() => finish('discard')} disabled={saving}
            className="px-3 py-1.5 text-mini rounded-token text-danger hover:bg-danger/10 transition-colors duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed">
            {isAppClose ? 'Salir sin guardar' : 'Cerrar sin guardar'}
          </button>
          <button onClick={saveAll} disabled={saving} autoFocus
            className="px-3 py-1.5 text-mini rounded-token bg-fg text-panel hover:opacity-90 active:opacity-80 active:scale-[0.97] transition-[filter,transform] duration-fast ease-token flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Guardando…' : isAppClose ? 'Guardar y salir' : 'Guardar y cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
