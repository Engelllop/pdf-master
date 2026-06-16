import { type FormField } from '../../hooks/useFormFields'
import { type PageDims } from './annotationRender'

// Widgets de formulario del PDF (inputs/checkbox/select) superpuestos al bitmap.
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
          <input key={field.field_name} type="text"
            value={field.value}
            onChange={(e) => onChange(field.field_name, e.target.value)}
            className="bg-white/90 text-black text-xs border border-blue-400 rounded px-1"
            style={style}
            title={field.field_name}
          />
        )
      })}
    </div>
  )
}
