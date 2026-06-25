import { useState } from 'react'
import { X } from 'lucide-react'
import { useThemeClasses } from '../hooks/useThemeClasses'

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

interface State { title: string; fields: Field[]; submitLabel: string; resolve: (v: FormValues | null) => void }

export function useFormModal() {
  const [state, setState] = useState<State | null>(null)

  const askForm = (title: string, fields: Field[], submitLabel = 'Aceptar') =>
    new Promise<FormValues | null>((resolve) => setState({ title, fields, submitLabel, resolve }))

  const askConfirm = (title: string, message: string, submitLabel = 'Aceptar') =>
    new Promise<boolean>((resolve) =>
      setState({ title, fields: [{ name: '_msg', label: message, type: 'textarea', readOnly: true, defaultValue: '' }], submitLabel, resolve: (v) => resolve(v !== null) }))

  const close = (v: FormValues | null) => { state?.resolve(v); setState(null) }

  const formModal = state ? (
    <FormModal title={state.title} fields={state.fields} submitLabel={state.submitLabel}
      onSubmit={(v) => close(v)} onCancel={() => close(null)} />
  ) : null

  return { askForm, askConfirm, formModal }
}

function FormModal({ title, fields, submitLabel, onSubmit, onCancel }:
  { title: string; fields: Field[]; submitLabel: string; onSubmit: (v: FormValues) => void; onCancel: () => void }) {
  const tc = useThemeClasses()
  const [values, setValues] = useState<FormValues>(() => {
    const v: FormValues = {}
    for (const f of fields) v[f.name] = f.type === 'checkbox' ? !!f.defaultValue : String(f.defaultValue ?? '')
    return v
  })
  const set = (n: string, val: string | boolean) => setValues((p) => ({ ...p, [n]: val }))
  const onlyReadonly = fields.every((f) => f.readOnly)
  const inputCls = `w-full border border-border rounded px-2 py-1.5 text-sm bg-surface text-fg focus:outline-none focus:border-accent`

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`menu-pop w-[380px] max-w-[92vw] rounded-lg border shadow-2xl bg-panel ${tc('border-slate-600 text-slate-200', 'border-gray-300 text-gray-800')}`}>
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${tc('border-slate-700', 'border-gray-200')}`}>
          <h2 className="text-sm font-semibold flex-1">{title}</h2>
          <button onClick={onCancel} aria-label="Cerrar" className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
        </div>
        <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {fields.map((f) => (
            <div key={f.name} className={f.type === 'checkbox' ? 'flex items-center gap-2' : 'space-y-1'}>
              {f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer text-fg">
                  <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
                  {f.label}
                </label>
              ) : (
                <>
                  <label className="block text-xs text-muted">{f.label}</label>
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
        <div className={`flex justify-end gap-2 px-4 py-3 border-t ${tc('border-slate-700', 'border-gray-200')}`}>
          {!onlyReadonly && <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded text-fg hover:bg-hover transition-colors">Cancelar</button>}
          <button onClick={() => onSubmit(values)} className="px-4 py-1.5 text-sm rounded bg-fg text-toolbar hover:opacity-90 transition-opacity">{submitLabel}</button>
        </div>
      </div>
    </div>
  )
}
