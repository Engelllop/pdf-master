import { useState, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  DialogShell, DialogHeader, DialogFooter, btnPrimary, btnDanger, btnGhost, fieldInput, nativeAccent,
} from './panelUi'

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
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Foco inicial: en confirmaciones destructivas, sobre Cancelar (opción segura).
  useEffect(() => { if (confirm) cancelRef.current?.focus() }, [confirm])

  return (
    <DialogShell label={title} zClass="z-prompt" panelClass="w-[380px] flex flex-col max-h-[84vh]" onClose={onCancel}>
      <DialogHeader title={title} onClose={onCancel}
        icon={destructive ? AlertTriangle : undefined} iconClass="text-danger" />
      {confirm ? (
        <div className="px-4 py-4">
          <p className="text-base whitespace-pre-wrap text-fg">{message}</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {fields.map((f) => (
            <div key={f.name} className={f.type === 'checkbox' ? 'flex items-center gap-2' : 'space-y-1'}>
              {f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-base cursor-pointer text-fg">
                  <input type="checkbox" checked={!!values[f.name]} style={nativeAccent}
                    onChange={(e) => set(f.name, e.target.checked)} />
                  {f.label}
                </label>
              ) : (
                <>
                  <label className="block text-mini text-muted" htmlFor={`fm-${f.name}`}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select id={`fm-${f.name}`} value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)}
                      className={`${fieldInput} w-full`}>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea id={`fm-${f.name}`} value={String(values[f.name])} readOnly={f.readOnly} rows={f.readOnly ? 8 : 3}
                      onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder}
                      className={`${fieldInput} w-full resize-none ${f.readOnly ? 'whitespace-pre-wrap' : ''}`} />
                  ) : (
                    <input id={`fm-${f.name}`} type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      autoFocus={fields.findIndex((x) => !x.readOnly) === fields.indexOf(f)}
                      value={String(values[f.name])} min={f.min} max={f.max} placeholder={f.placeholder}
                      readOnly={f.readOnly}
                      onChange={(e) => set(f.name, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(values) }}
                      className={`${fieldInput} w-full`} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <DialogFooter>
        {showCancel && <button ref={cancelRef} onClick={onCancel} className={btnGhost}>Cancelar</button>}
        <button onClick={() => onSubmit(values)} className={destructive ? btnDanger : btnPrimary}>
          {submitLabel}
        </button>
      </DialogFooter>
    </DialogShell>
  )
}
