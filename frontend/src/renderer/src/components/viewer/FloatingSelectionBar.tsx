import { useRef } from 'react'
import { Copy, Trash2, Minus, Plus, Bold, Italic, AlignLeft, AlignCenter, AlignRight, RotateCw, Droplet, X } from 'lucide-react'
import { type Annotation, type LineStyle } from '../../store/usePdfStore'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { getAnnotationBounds, type PageDims, type ToScreen } from './annotationRender'
import { FONT_OPTIONS } from '../../lib/fonts'

const STROKE_TYPES = [
  'rect', 'circle', 'arrow', 'line', 'callout', 'draw', 'signature',
  'underline', 'strikethrough', 'highlight',
  'measure_distance', 'measure_area', 'measure_perimeter',
  'check', 'cross', 'star', 'cloud', 'polygon',
]
const FILLABLE = ['rect', 'circle', 'star', 'cloud', 'polygon', 'callout']
const ROTATABLE = ['image', 'text', 'rect', 'circle']
const LINE_STYLES: Array<{ id: LineStyle; label: string; dash?: string }> = [
  { id: 'solid', label: 'Sólida' },
  { id: 'dashed', label: 'Discontinua', dash: '6 3' },
  { id: 'dotted', label: 'Punteada', dash: '1.5 3.5' },
]
const BAR_H = 36

export default function FloatingSelectionBar({ ann, docId, pageData, toScreen, scale, wrapperWidth }: {
  ann: Annotation
  docId: string
  pageData: PageDims
  toScreen: ToScreen
  scale: number
  wrapperWidth: number
}) {
  const { updateAnnotationUndoable, deleteAnnotation, addAnnotation, selectAnnotation } = useStoreSlice(
    'updateAnnotationUndoable', 'deleteAnnotation', 'addAnnotation', 'selectAnnotation',
  )
  const colorInputRef = useRef<HTMLInputElement>(null)
  const fillInputRef = useRef<HTMLInputElement>(null)

  const bounds = getAnnotationBounds(ann, pageData, toScreen)
  if (!bounds) return null

  const isText = ann.type === 'text'
  const isStroke = STROKE_TYPES.includes(ann.type)
  const hasColor = ann.type !== 'image'
  const canFill = FILLABLE.includes(ann.type)
  const canRotate = ROTATABLE.includes(ann.type)
  const barW = isText ? 460 : isStroke ? 380 : canRotate ? 180 : 130

  const bx = bounds.x * scale
  const by = bounds.y * scale
  const bw = bounds.w * scale
  const bh = bounds.h * scale
  const left = Math.max(4, Math.min(bx + bw / 2 - barW / 2, wrapperWidth - barW - 4))
  const top = by - BAR_H - 10 > 4 ? by - BAR_H - 10 : by + bh + 10

  // Undoable: cada cambio de propiedad es un paso. Los controles continuos (selector
  // de color, deslizador de opacidad) disparan un evento por píxel y el store los
  // fusiona en uno solo.
  const apply = (u: Partial<Annotation>) => updateAnnotationUndoable(docId, ann.id, u)

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

  // `active:scale` en la superficie más pulsada al anotar: sin él, veinte botones
  // no devolvían ningún acuse de la pulsación.
  const btn = 'p-1.5 rounded-token-sm text-muted hover:text-fg hover:bg-hover active:scale-[0.97] transition-[color,background-color,transform] duration-fast ease-token'
  const onBtn = (active: boolean) => `p-1.5 rounded-token-sm active:scale-[0.97] transition-[color,background-color,transform] duration-fast ease-token ${active ? 'bg-selected text-fg' : 'text-muted hover:text-fg hover:bg-hover'}`
  const styleVal: LineStyle = ann.lineStyle || 'solid'
  const opacityPct = Math.round((ann.opacity ?? (ann.type === 'highlight' ? 0.5 : 1)) * 100)

  return (
    <div className="absolute z-sticky flex items-center gap-0.5 px-1.5 rounded-token border border-border bg-panel shadow-token-lg select-none"
      style={{ left, top, height: BAR_H, maxWidth: wrapperWidth - 8 }}
      onMouseDown={(e) => e.stopPropagation()}>
      {hasColor && (
        <>
          <button title="Color" aria-label="Color" onClick={() => colorInputRef.current?.click()}
            className="relative w-6 h-6 rounded-full border-2 border-border hover:scale-105 active:scale-100 transition-transform duration-fast ease-token shrink-0"
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
          <button title="Línea más fina" aria-label="Línea más fina" className={btn}
            onClick={() => apply({ lineWidth: Math.max(0.5, (ann.lineWidth ?? 2) - 0.5) })}><Minus size={14} /></button>
          <span className="text-micro text-fg w-6 text-center tabular">{ann.lineWidth ?? 2}</span>
          <button title="Línea más gruesa" aria-label="Línea más gruesa" className={btn}
            onClick={() => apply({ lineWidth: Math.min(20, (ann.lineWidth ?? 2) + 0.5) })}><Plus size={14} /></button>
          {LINE_STYLES.map((ls) => (
            <button key={ls.id} title={`Línea ${ls.label}`} aria-label={`Línea ${ls.label}`}
              className={onBtn(styleVal === ls.id)}
              onClick={() => apply({ lineStyle: ls.id })}>
              <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={ls.dash} strokeLinecap="round" /></svg>
            </button>
          ))}
          <input type="range" min={10} max={100} step={5} value={opacityPct}
            onChange={(e) => apply({ opacity: parseInt(e.target.value) / 100 })}
            className="w-14" title="Opacidad" aria-label="Opacidad" />
          <span className="text-micro text-muted w-7 tabular">{opacityPct}%</span>
          {canFill && (
            <>
              <button title={ann.fillColor ? 'Color de relleno' : 'Rellenar'} aria-label={ann.fillColor ? 'Color de relleno' : 'Rellenar'}
                onClick={() => ann.fillColor ? fillInputRef.current?.click() : apply({ fillColor: ann.color || '#fbbf24', fillOpacity: ann.fillOpacity ?? 0.3 })}
                className="relative w-6 h-6 rounded-token-sm border border-border shrink-0 flex items-center justify-center"
                style={{ backgroundColor: ann.fillColor || 'transparent' }}>
                {!ann.fillColor && <Droplet size={12} className="text-muted" />}
                <input ref={fillInputRef} type="color" value={ann.fillColor || '#fbbf24'}
                  onChange={(e) => apply({ fillColor: e.target.value })}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              </button>
              {ann.fillColor && (
                <button title="Quitar relleno" aria-label="Quitar relleno" className={btn}
                  onClick={() => apply({ fillColor: undefined })}><X size={12} /></button>
              )}
            </>
          )}
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      {isText && (
        <>
          <select value={ann.fontFamily || 'Arial'} onChange={(e) => apply({ fontFamily: e.target.value })}
            className="border border-border rounded-token-sm px-1 py-0.5 text-micro bg-panel text-fg focus:outline-none w-28">
            {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <button title="Reducir tamaño" aria-label="Reducir tamaño" className={`${btn} text-micro font-semibold`}
            onClick={() => apply({ fontSize: Math.max(4, (ann.fontSize || 14) - 2) })}>A</button>
          <span className="text-micro text-fg w-6 text-center tabular">{ann.fontSize || 14}</span>
          <button title="Aumentar tamaño" aria-label="Aumentar tamaño" className={`${btn} text-base font-semibold`}
            onClick={() => apply({ fontSize: Math.min(72, (ann.fontSize || 14) + 2) })}>A</button>
          <button title="Negrita" aria-label="Negrita" className={onBtn(!!ann.bold)}
            onClick={() => apply({ bold: !ann.bold })}><Bold size={14} /></button>
          <button title="Cursiva" aria-label="Cursiva" className={onBtn(!!ann.italic)}
            onClick={() => apply({ italic: !ann.italic })}><Italic size={14} /></button>
          {(['left', 'center', 'right'] as const).map((a) => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
            const alignLabel = a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'
            return (
              <button key={a} title={`Alinear a la ${alignLabel}`} aria-label={`Alinear a la ${alignLabel}`}
                className={onBtn((ann.align || 'left') === a)}
                onClick={() => apply({ align: a })}><Icon size={14} /></button>
            )
          })}
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      {canRotate && (
        <>
          <button title="Rotar 90°" aria-label="Rotar 90°" className={btn}
            onClick={() => apply({ rotation: ((ann.rotation || 0) + 90) % 360 })}><RotateCw size={14} /></button>
          <span className="text-micro text-muted w-8 tabular">{ann.rotation || 0}°</span>
          <div className="w-px h-4 mx-1 bg-border" />
        </>
      )}
      <button title="Duplicar" aria-label="Duplicar" className={btn} onClick={duplicate}><Copy size={14} /></button>
      <button title="Eliminar (Supr)" aria-label="Eliminar" className={`${btn} hover:text-danger`}
        onClick={() => deleteAnnotation(docId, ann.id)}><Trash2 size={14} /></button>
    </div>
  )
}
