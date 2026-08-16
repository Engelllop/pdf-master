import { useEffect, useRef, useState } from 'react'
import { type FormField } from '../../hooks/useFormFields'
import { type PageDims } from './annotationRender'
import { askConfirm } from '../../lib/uiPrompt'

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
      className="bg-info/10 hover:bg-info/20 focus:bg-white text-black text-mini border border-info/70 focus:border-info rounded px-1 outline-none transition-colors"
      style={style}
      title={field.field_name}
      aria-label={field.field_name || 'Campo de texto'}
    />
  )
}

type Rect = { x: number; y: number; width: number; height: number }

function LayoutChrome({
  field, sx, sy, selected, onSelect, onCommit, onDelete,
}: {
  field: FormField
  sx: number
  sy: number
  selected: boolean
  onSelect: () => void
  onCommit: (rect: Rect) => void
  onDelete: () => void
}) {
  const start = useRef<{ ox: number; oy: number; rect: Rect; mode: 'move' | 'resize' } | null>(null)
  const [preview, setPreview] = useState<Rect | null>(null)
  const rect = preview ?? field.rect
  const left = rect.x * sx
  const top = rect.y * sy
  const w = Math.max(8, rect.width * sx)
  const h = Math.max(8, rect.height * sy)

  const onDown = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    start.current = { ox: e.clientX, oy: e.clientY, rect: field.rect, mode }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = (e.clientX - start.current.ox) / sx
    const dy = (e.clientY - start.current.oy) / sy
    if (start.current.mode === 'move') {
      setPreview({ ...start.current.rect, x: start.current.rect.x + dx, y: start.current.rect.y + dy })
    } else {
      setPreview({
        ...start.current.rect,
        width: Math.max(8, start.current.rect.width + dx),
        height: Math.max(8, start.current.rect.height + dy),
      })
    }
  }
  const onUp = () => {
    const next = preview
    start.current = null
    setPreview(null)
    if (!next) return
    const moved = Math.abs(next.x - field.rect.x) > 0.5 || Math.abs(next.y - field.rect.y) > 0.5
      || Math.abs(next.width - field.rect.width) > 0.5 || Math.abs(next.height - field.rect.height) > 0.5
    if (moved) onCommit(next)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Campo ${field.field_name}`}
      aria-pressed={selected}
      onPointerDown={(e) => onDown(e, 'move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={`absolute box-border ${selected ? 'ring-2 ring-accent' : 'ring-1 ring-info/70'} bg-info/10 cursor-move`}
      style={{ left, top, width: w, height: h }}
      title={`${field.field_name} — arrastrá para mover`}
    >
      {selected && (
        <>
          <button type="button" aria-label="Eliminar campo"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="absolute -top-6 right-0 px-1.5 py-0.5 text-micro rounded bg-danger text-white shadow">
            Borrar
          </button>
          <div
            onPointerDown={(e) => onDown(e, 'resize')}
            className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-accent rounded-sm cursor-nwse-resize"
          />
        </>
      )}
    </div>
  )
}

export default function FormFieldsLayer({
  fields, pageData, onChange, onTransform, interactive = true, layoutMode = false,
}: {
  fields: FormField[]
  pageData: PageDims
  onChange: (fieldName: string, value: string) => void
  onTransform?: (xref: number, next: Rect | { delete: true }) => void
  interactive?: boolean
  layoutMode?: boolean
}) {
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => { setSelected(null) }, [fields])

  const confirmDelete = async (xref: number) => {
    const ok = await askConfirm(
      'Borrar campo',
      'Se eliminará este campo del formulario. Ctrl+Z deshace.',
      'Borrar',
    )
    if (!ok) return
    onTransform?.(xref, { delete: true })
    setSelected(null)
  }

  useEffect(() => {
    if (!layoutMode || selected == null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void confirmDelete(selected)
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layoutMode, selected, onTransform])

  if (fields.length === 0) return null
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  return (
    <div className="absolute top-0 left-0" style={{
      width: pageData.width, height: pageData.height,
      pointerEvents: (interactive || layoutMode) ? 'auto' : 'none',
      zIndex: 25,
    }}>
      {layoutMode ? fields.map((field) => (
        <LayoutChrome
          key={field.xref || `${field.field_name}-${field.rect.x}-${field.rect.y}`}
          field={field} sx={sx} sy={sy}
          selected={selected === field.xref}
          onSelect={() => setSelected(field.xref)}
          onCommit={(rect) => onTransform?.(field.xref, rect)}
          onDelete={() => { void confirmDelete(field.xref) }}
        />
      )) : fields.map((field, i) => {
        const style = {
          position: 'absolute' as const,
          left: field.rect.x * sx,
          top: field.rect.y * sy,
          width: field.rect.width * sx,
          height: field.rect.height * sy,
        }
        const isCheckbox = field.field_type.toLowerCase().includes('check')
        const isRadio = field.field_type.toLowerCase().includes('radio')
        const isSelect = field.field_type.toLowerCase().includes('combo') || field.field_type.toLowerCase().includes('list')
        if (isCheckbox) {
          return (
            <input key={`${field.field_name}-${i}`} type="checkbox"
              checked={field.value === 'Yes' || field.value === 'On'}
              onChange={(e) => onChange(field.field_name, e.target.checked ? 'Yes' : 'Off')}
              className="accent-[rgb(var(--info))]"
              style={style}
              title={field.field_name}
              aria-label={field.field_name || 'Casilla'}
            />
          )
        }
        if (isRadio) {
          const checked = field.value === 'Yes' || field.value === 'On' || field.value === field.field_name
          return (
            <input key={`${field.field_name}-${i}`} type="radio" name={field.field_name.split('.').slice(0, -1).join('.') || field.field_name}
              checked={checked}
              onChange={() => onChange(field.field_name, field.options[0] || 'Yes')}
              className="accent-[rgb(var(--info))]"
              style={style}
              title={field.field_name}
              aria-label={field.field_name || 'Opción'}
            />
          )
        }
        if (isSelect) {
          return (
            <select key={`${field.field_name}-${i}`}
              value={field.value}
              onChange={(e) => onChange(field.field_name, e.target.value)}
              className="bg-white text-black text-mini border border-info rounded"
              style={style}
              title={field.field_name}
              aria-label={field.field_name || 'Lista'}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )
        }
        return (
          <TextWidget key={`${field.field_name}-${i}`} field={field} style={style}
            onCommit={(v) => onChange(field.field_name, v)} />
        )
      })}
    </div>
  )
}
