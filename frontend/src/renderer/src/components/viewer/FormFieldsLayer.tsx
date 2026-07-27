import { useEffect, useState } from 'react'
import { type FormField } from '../../hooks/useFormFields'
import { type PageDims } from './annotationRender'

// Widgets de formulario del PDF (inputs/checkbox/select) superpuestos al bitmap.
// Los de texto escriben en estado local y se confirman al salir del campo o con
// Enter: guardar en cada tecla mandaba un POST por pulsación al motor (1 worker) y
// el campo, al ser controlado por la respuesta, se comía letras y parecía bloqueado.
function TextWidget({ field, style, onCommit }: {
  field: FormField
  style: React.CSSProperties
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(field.value)
  useEffect(() => { setDraft(field.value) }, [field.value])
  return (
    <input type="text" value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== field.value) onCommit(draft) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        else if (e.key === 'Escape') { setDraft(field.value); e.currentTarget.blur() }
      }}
      className="bg-blue-500/10 hover:bg-blue-500/20 focus:bg-white text-black text-xs border border-blue-400/70 focus:border-blue-500 rounded px-1 outline-none transition-colors"
      style={style}
      title={field.field_name}
    />
  )
}

export default function FormFieldsLayer({ fields, pageData, onChange }: {
  fields: FormField[]
  pageData: PageDims
  onChange: (fieldName: string, value: string) => void
}) {
  if (fields.length === 0) return null
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  return (
    <div className="absolute top-0 left-0" style={{ width: pageData.width, height: pageData.height, pointerEvents: 'auto', zIndex: 25 }}>
      {fields.map((field) => {
        const style = {
          position: 'absolute' as const,
          left: field.rect.x * sx,
          top: field.rect.y * sy,
          width: field.rect.width * sx,
          height: field.rect.height * sy,
        }
        const isCheckbox = field.field_type.toLowerCase().includes('check')
        const isSelect = field.field_type.toLowerCase().includes('combo') || field.field_type.toLowerCase().includes('list')
        if (isCheckbox) {
          return (
            <input key={field.field_name} type="checkbox"
              checked={field.value === 'Yes' || field.value === 'On'}
              onChange={(e) => onChange(field.field_name, e.target.checked ? 'Yes' : 'Off')}
              className="accent-blue-600"
              style={style}
              title={field.field_name}
            />
          )
        }
        if (isSelect) {
          return (
            <select key={field.field_name}
              value={field.value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
              className="bg-white text-black text-xs border border-blue-400 rounded"
              style={style}
              title={field.field_name}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )
        }
        return (
          <TextWidget key={field.field_name} field={field} style={style}
            onCommit={(v) => onChange(field.field_name, v)} />
        )
      })}
    </div>
  )
}
