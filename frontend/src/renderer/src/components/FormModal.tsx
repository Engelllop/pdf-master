import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'

export interface Field {
  name: string
  label: string
  type?: 'text' | 'number' | 'password' | 'select' | 'checkbox' | 'textarea'
  defaultValue?: string | number | boolean
  options?: string[]
  placeholder?: string
  min?: number
  max?: number
  readOnly?: boolean
}

export type FormValues = Record<string, string | boolean>

interface State {
  title: string; fields: Field[]; submitLabel: string; resolve: (v: FormValues | null) => void
  confirm?: boolean; destructive?: boolean; message?: string
}

const DESTRUCTIVE_RE = /eliminar|borrar|redactar|quitar|descartar/i

export function useFormModal() {
  const [state, setState] = useState<State | null>(null)

  const askForm = (title: string, fields: Field[], submitLabel = 'Aceptar') =>
    new Promise<FormValues | null>((resolve) => setState({ title, fields, submitLabel, resolve }))

  const askConfirm = (title: string, message: string, submitLabel = 'Aceptar') =>
    new Promise<boolean>((resolve) =>
      setState({ title, fields: [], submitLabel, message, confirm: true, destructive: DESTRUCTIVE_RE.test(submitLabel), resolve: (v) => resolve(v !== null) }))

  const close = (v: FormValues | null) => { state?.resolve(v); setState(null) }

  const formModal = state ? (
    <FormModal title={state.title} fields={state.fields} submitLabel={state.submitLabel}
      confirm={state.confirm} destructive={state.destructive} message={state.message}
      onSubmit={(v) => close(v)} onCancel={() => close(null)} />
  ) : null

  return { askForm, askConfirm, formModal }
}

function FormModal({ title, fields, submitLabel, confirm, destructive, message, onSubmit, onCancel }:
  { title: string; fields: Field[]; submitLabel: string; confirm?: boolean; destructive?: boolean; message?: string
    onSubmit: (v: FormValues) => void; onCancel: () => void }) {
  const [values, setValues] = useState<FormValues>(() => {
    const v: FormValues = {}
    for (const f of fields) v[f.name] = f.type === 'checkbox' ? !!f.defaultValue : String(f.defaultValue ?? '')
    return v
  })
  const set = (n: string, val: string | boolean) => setValues((p) => ({ ...p, [n]: val }))
  const showCancel = confirm || !fields.every((f) => f.readOnly)
  const inputCls = `w-full border border-border rounded px-2 py-1.5 text-base bg-surface text-fg focus:outline-none focus:border-accent`

  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Foco inicial: en confirmaciones destructivas, sobre Cancelar (opción segura).
  useEffect(() => { if (confirm) cancelRef.current?.focus() }, [confirm])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
    if (e.key !== 'Tab') return
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (!nodes || nodes.length === 0) return
    const first = nodes[0], last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="overlay-in fixed inset-0 z-[95] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
        className="panel-in w-[380px] max-w-[92vw] rounded-lg border shadow-2xl bg-panel border-border text-fg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {destructive && <AlertTriangle size={16} className="text-danger shrink-0" />}
          <h2 className="text-base font-semibold flex-1">{title}</h2>
          <button onClick={onCancel} aria-label="Cerrar" className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
        </div>
        {confirm ? (
          <div className="px-4 py-4">
            <p className="text-base whitespace-pre-wrap text-fg">{message}</p>
          </div>
        ) : (
        <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {fields.map((f) => (
            <div key={f.name} className={f.type === 'checkbox' ? 'flex items-center gap-2' : 'space-y-1'}>
              {f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-base cursor-pointer text-fg">
                  <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
                  {f.label}
                </label>
              ) : (
                <>
                  <label className="block text-mini text-muted">{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)} className={inputCls}>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={String(values[f.name])} readOnly={f.readOnly} rows={f.readOnly ? 8 : 3}
                      onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder}
                      className={`${inputCls} resize-none ${f.readOnly ? 'whitespace-pre-wrap' : ''}`} />
                  ) : (
                    <input type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      autoFocus={fields.findIndex((x) => !x.readOnly) === fields.indexOf(f)}
                      value={String(values[f.name])} min={f.min} max={f.max} placeholder={f.placeholder}
                      onChange={(e) => set(f.name, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(values) }}
                      className={inputCls} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        )}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          {showCancel && <button ref={cancelRef} onClick={onCancel} className="px-3 py-1.5 text-base rounded text-fg hover:bg-hover transition-colors">Cancelar</button>}
          <button onClick={() => onSubmit(values)}
            className={`px-4 py-1.5 text-base rounded transition-opacity ${destructive ? 'bg-danger text-white hover:bg-danger' : 'bg-fg text-toolbar hover:opacity-90'}`}>{submitLabel}</button>
        </div>
      </div>
    </div>
  )
}
