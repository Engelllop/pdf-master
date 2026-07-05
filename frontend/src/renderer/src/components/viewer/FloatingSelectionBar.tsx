import { useRef } from 'react'
import { Copy, Trash2, Minus, Plus, Bold, Italic, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { type Annotation } from '../../store/usePdfStore'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { getAnnotationBounds, type PageDims, type ToScreen } from './annotationRender'
import { FONT_OPTIONS } from '../../lib/fonts'

const STROKE_TYPES = ['rect', 'circle', 'arrow', 'draw', 'signature', 'underline', 'strikethrough', 'measure_distance', 'measure_area', 'check', 'cross', 'star', 'cloud', 'polygon']
const BAR_H = 36

// Barra contextual flotante junto a la anotación seleccionada (estilo Acrobat):
// acciones rápidas según el tipo. Vive en el wrapper SIN escalar de la página para
// que no haga zoom con el documento; las coordenadas llegan en px de bitmap y se
// multiplican por `scale` para ubicarla.
export default function FloatingSelectionBar({ ann, docId, pageData, toScreen, scale, wrapperWidth }: {
  ann: Annotation
  docId: string
  pageData: PageDims
  toScreen: ToScreen
  scale: number
  wrapperWidth: number
}) {
  const { updateAnnotation, deleteAnnotation, addAnnotation, selectAnnotation } = useStoreSlice(
    'updateAnnotation', 'deleteAnnotation', 'addAnnotation', 'selectAnnotation',
  )
  const colorInputRef = useRef<HTMLInputElement>(null)

  const bounds = getAnnotationBounds(ann, pageData, toScreen)
  if (!bounds) return null

  const isText = ann.type === 'text'
  const isStroke = STROKE_TYPES.includes(ann.type)
  const hasColor = ann.type !== 'image'
  const barW = isText ? 420 : isStroke ? 220 : 130

  const bx = bounds.x * scale
  const by = bounds.y * scale
  const bw = bounds.w * scale
  const bh = bounds.h * scale
  const left = Math.max(4, Math.min(bx + bw / 2 - barW / 2, wrapperWidth - barW - 4))
  const top = by - BAR_H - 10 > 4 ? by - BAR_H - 10 : by + bh + 10

  const apply = (u: Partial<Annotation>) => updateAnnotation(docId, ann.id, u)

  const duplicate = () => {
    const OFF = 14
    const copy: Annotation = {
      ...ann,
      id: crypto.randomUUID(),
      x: ann.x + OFF,
      y: ann.y + OFF,
      points: ann.points?.map((p) => ({ x: p.x + OFF, y: p.y + OFF })),
    }
    addAnnotation(docId, copy)
    selectAnnotation(docId, copy.id)
  }

  const btn = 'p-1.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors'

  return (
    <div className="absolute z-40 flex items-center gap-0.5 px-1.5 rounded-lg border border-border bg-panel shadow-xl select-none"
      style={{ left, top, height: BAR_H }}
      onMouseDown={(e) => e.stopPropagation()}>
      {hasColor && (
        <>
          <button title="Color" onClick={() => colorInputRef.current?.click()}
            className="relative w-6 h-6 rounded-full border-2 border-border hover:scale-110 transition-transform shrink-0"
            style={{ backgroundColor: ann.color || '#fbbf24' }}>
            <input ref={colorInputRef} type="color" value={ann.color || '#fbbf24'}
              onChange={(e) => apply({ color: e.target.value })}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
          </button>
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      {isStroke && (
        <>
          <button title="Línea más fina" className={btn}
            onClick={() => apply({ lineWidth: Math.max(0.5, (ann.lineWidth ?? 2) - 0.5) })}><Minus size={13} /></button>
          <span className="text-[11px] text-fg w-6 text-center tabular-nums">{ann.lineWidth ?? 2}</span>
          <button title="Línea más gruesa" className={btn}
            onClick={() => apply({ lineWidth: Math.min(20, (ann.lineWidth ?? 2) + 0.5) })}><Plus size={13} /></button>
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      {isText && (
        <>
          <select value={ann.fontFamily || 'Arial'} onChange={(e) => apply({ fontFamily: e.target.value })}
            className="border border-border rounded px-1 py-0.5 text-[11px] bg-panel text-fg focus:outline-none w-28">
            {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <button title="Reducir tamaño" className={`${btn} text-[10px] font-semibold`}
            onClick={() => apply({ fontSize: Math.max(4, (ann.fontSize || 14) - 2) })}>A</button>
          <span className="text-[11px] text-fg w-6 text-center tabular-nums">{ann.fontSize || 14}</span>
          <button title="Aumentar tamaño" className={`${btn} text-[14px] font-semibold`}
            onClick={() => apply({ fontSize: Math.min(72, (ann.fontSize || 14) + 2) })}>A</button>
          <button title="Negrita" className={`p-1.5 rounded transition-colors ${ann.bold ? 'bg-hover text-accent' : 'text-muted hover:text-fg hover:bg-hover'}`}
            onClick={() => apply({ bold: !ann.bold })}><Bold size={13} /></button>
          <button title="Cursiva" className={`p-1.5 rounded transition-colors ${ann.italic ? 'bg-hover text-accent' : 'text-muted hover:text-fg hover:bg-hover'}`}
            onClick={() => apply({ italic: !ann.italic })}><Italic size={13} /></button>
          <button title={`Alineación: ${ann.align || 'left'}`} className={btn}
            onClick={() => apply({ align: ann.align === 'left' || !ann.align ? 'center' : ann.align === 'center' ? 'right' : 'left' })}>
            {ann.align === 'center' ? <AlignCenter size={13} /> : ann.align === 'right' ? <AlignRight size={13} /> : <AlignLeft size={13} />}
          </button>
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      <button title="Duplicar" className={btn} onClick={duplicate}><Copy size={14} /></button>
      <button title="Eliminar (Supr)" className={`${btn} hover:text-red-400`}
        onClick={() => deleteAnnotation(docId, ann.id)}><Trash2 size={14} /></button>
    </div>
  )
}
