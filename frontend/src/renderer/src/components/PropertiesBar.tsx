import { type Annotation, type LineStyle } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  X, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { FONT_OPTIONS } from '../lib/fonts'
import { BUILTIN_STAMPS, loadStamps, renderStampText } from '../lib/stamps'

const WIDTH_PRESETS = [0.5, 1, 2, 4, 8]
const OPACITY_PRESETS = [25, 50, 75, 100]

const COLORS = ['#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#1f2329', '#ffffff']
const SHAPE_IDS = ['check', 'cross', 'star', 'cloud', 'polygon']
const STROKE_TYPES = ['rect', 'circle', 'arrow', 'line', 'callout', 'draw', 'signature', 'underline', 'strikethrough', 'highlight', 'measure_distance', 'measure_area', 'measure_perimeter', ...SHAPE_IDS]
const STROKE_TOOLS = ['draw', 'rect', 'circle', 'arrow', 'line', 'callout', 'underline', 'strikethrough', 'highlight', 'signature', 'measure_calibrate', 'measure_distance', 'measure_area', 'measure_perimeter', ...SHAPE_IDS]
const COLOR_TOOLS = [...STROKE_TOOLS, 'note', 'text']
const LINE_STYLES: Array<{ id: LineStyle; label: string; dash?: string }> = [
  { id: 'solid', label: 'Sólida' },
  { id: 'dashed', label: 'Discontinua', dash: '6 3' },
  { id: 'dotted', label: 'Punteada', dash: '1.5 3.5' },
]
const ROTATABLE = ['image', 'text', 'rect', 'circle']

export default function PropertiesBar() {
  const customStamps = loadStamps()
  const store = useStoreSlice(
    'docs', 'activeDocId', 'activeTool', 'selectedAnnotationId',
    'annotationColor', 'setAnnotationColor', 'annotationLineWidth', 'setAnnotationLineWidth',
    'annotationLineStyle', 'setAnnotationLineStyle', 'annotationOpacity', 'setAnnotationOpacity',
    'annotationFillColor', 'setAnnotationFillColor', 'annotationFillOpacity', 'setAnnotationFillOpacity',
    'textFontFamily', 'setTextFontFamily', 'textFontSize', 'setTextFontSize', 'textStyle', 'setTextStyle',
    'selectedStamp', 'setSelectedStamp', 'stampColor', 'setStampColor', 'stampSize', 'setStampSize', 'updateAnnotation',
    'annotationAuthor', 'setActiveTool',
  )
  const { activeTool, activeDocId, docs } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const selAnn = activeDoc?.annotations.find((a) => a.id === store.selectedAnnotationId) || null

  const isTextCtx = activeTool === 'text' || activeTool === 'callout' || selAnn?.type === 'text' || selAnn?.type === 'callout'
  const strokeSel = selAnn && STROKE_TYPES.includes(selAnn.type) ? selAnn : null
  const showStroke = strokeSel !== null || (!!activeTool && STROKE_TOOLS.includes(activeTool))
  const showColor = isTextCtx || showStroke || activeTool === 'note' || (!!activeTool && COLOR_TOOLS.includes(activeTool)) || (!!selAnn && selAnn.type !== 'image')
  const isStamp = activeTool === 'stamp'
  const FILLABLE = ['rect', 'circle', 'star', 'cloud', 'polygon', 'callout']
  const fillCapable = strokeSel ? FILLABLE.includes(strokeSel.type) : (!!activeTool && FILLABLE.includes(activeTool))
  const rotAnn = selAnn && ROTATABLE.includes(selAnn.type) ? selAnn : null

  // Nada relevante que mostrar → no ocupar espacio.
  if (!activeDoc || (!showColor && !showStroke && !isTextCtx && !isStamp && !rotAnn)) return null

  const lineWidthVal = strokeSel ? (strokeSel.lineWidth ?? 2) : store.annotationLineWidth
  const lineStyleVal: LineStyle = strokeSel ? (strokeSel.lineStyle || 'solid') : store.annotationLineStyle
  const opacityVal = strokeSel ? (strokeSel.opacity ?? (strokeSel.type === 'highlight' ? 0.5 : 1)) : store.annotationOpacity
  const fillColorVal = strokeSel ? (strokeSel.fillColor ?? null) : store.annotationFillColor
  const fillOpacityVal = strokeSel ? (strokeSel.fillOpacity ?? 0.3) : store.annotationFillOpacity
  const colorVal = selAnn ? (selAnn.color || store.annotationColor) : store.annotationColor

  const applyToSel = (u: Partial<Annotation>) => { if (selAnn && activeDoc) store.updateAnnotation(activeDoc.doc_id, selAnn.id, u) }
  const applyColor = (c: string) => { store.setAnnotationColor(c); if (selAnn) applyToSel({ color: c }) }
  const changeWidth = (w: number) => strokeSel ? applyToSel({ lineWidth: w }) : store.setAnnotationLineWidth(w)
  const changeStyle = (s: LineStyle) => strokeSel ? applyToSel({ lineStyle: s }) : store.setAnnotationLineStyle(s)
  const changeOpacity = (o: number) => strokeSel ? applyToSel({ opacity: o }) : store.setAnnotationOpacity(o)
  const changeFillColor = (c: string | null) => strokeSel ? applyToSel({ fillColor: c ?? undefined }) : store.setAnnotationFillColor(c)
  const changeFillOpacity = (o: number) => strokeSel ? applyToSel({ fillOpacity: o }) : store.setAnnotationFillOpacity(o)

  const Label = ({ children }: { children: React.ReactNode }) => <span className="text-micro text-muted shrink-0">{children}</span>
  // Grupo con fondo propio: separa visualmente cada ajuste en vez de una fila plana
  const Group = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-panel px-2 py-1 shrink-0">{children}</div>
  )

  return (
    <div className="min-h-10 border-b border-border bg-toolbar flex items-center gap-2 px-3 py-1.5 flex-wrap text-fg">
      {(showColor || isStamp) && (
        <Group>
          <Label>Color</Label>
          {COLORS.map((c) => {
            const current = isStamp ? store.stampColor : colorVal
            const set = isStamp ? store.setStampColor : applyColor
            return (
              <button key={c} onClick={() => set(c)} aria-label={`Color ${c}`}
                className={`w-5 h-5 rounded-full border transition-transform ${current.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-accent scale-110 border-transparent' : 'border-border hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            )
          })}
          <input type="color" value={isStamp ? store.stampColor : colorVal}
            onChange={(e) => (isStamp ? store.setStampColor(e.target.value) : applyColor(e.target.value))}
            className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color personalizado" aria-label="Color personalizado" />
        </Group>
      )}

      {isTextCtx && (
        <Group>
          <Label>Fuente</Label>
            <select value={selAnn?.type === 'text' ? (selAnn.fontFamily || store.textFontFamily) : store.textFontFamily}
              onChange={(e) => { store.setTextFontFamily(e.target.value); if (selAnn?.type === 'text') applyToSel({ fontFamily: e.target.value }) }}
              aria-label="Fuente"
              className="border border-border rounded px-2 py-1 text-mini bg-panel text-fg focus:outline-none focus:border-accent">
              {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <input type="number" min={4} max={72}
              value={selAnn?.type === 'text' ? (selAnn.fontSize || store.textFontSize) : store.textFontSize}
              onChange={(e) => { const v = parseInt(e.target.value) || 14; store.setTextFontSize(v); if (selAnn?.type === 'text') applyToSel({ fontSize: v }) }}
              className="w-14 border border-border rounded px-2 py-1 text-mini text-center bg-panel text-fg focus:outline-none focus:border-accent" title="Tamaño" aria-label="Tamaño de fuente" />
            <Label>px</Label>
            {(() => {
              const isTextSel = selAnn?.type === 'text'
              const sv = {
                bold: isTextSel ? !!selAnn.bold : store.textStyle.bold,
                italic: isTextSel ? !!selAnn.italic : store.textStyle.italic,
                align: isTextSel ? (selAnn.align || 'left') : store.textStyle.align,
                lineHeight: isTextSel ? (selAnn.lineHeight || 1.3) : store.textStyle.lineHeight,
                listStyle: isTextSel ? (selAnn.listStyle || 'none') : store.textStyle.listStyle,
              }
              const setStyle = (u: Partial<typeof sv>) => {
                store.setTextStyle(u)
                if (isTextSel) applyToSel(u)
              }
              const tBtn = (active: boolean) => `p-1.5 rounded transition-colors ${active ? 'bg-accent text-toolbar' : 'text-muted hover:text-fg hover:bg-hover'}`
              return (
                <>
                  <button title="Negrita" aria-label="Negrita" className={tBtn(sv.bold)} onClick={() => setStyle({ bold: !sv.bold })}><Bold size={13} /></button>
                  <button title="Cursiva" aria-label="Cursiva" className={tBtn(sv.italic)} onClick={() => setStyle({ italic: !sv.italic })}><Italic size={13} /></button>
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    const alignLabel = a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'
                    return <button key={a} title={`Alinear ${alignLabel}`} aria-label={`Alinear ${alignLabel}`} className={tBtn(sv.align === a)} onClick={() => setStyle({ align: a })}><Icon size={13} /></button>
                  })}
                  <select title="Interlineado" aria-label="Interlineado" value={sv.lineHeight} onChange={(e) => setStyle({ lineHeight: parseFloat(e.target.value) })}
                    className="border border-border rounded px-1 py-1 text-mini bg-panel text-fg focus:outline-none">
                    {[1, 1.15, 1.3, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
                  </select>
                  <select title="Lista" aria-label="Lista" value={sv.listStyle} onChange={(e) => setStyle({ listStyle: e.target.value as typeof sv.listStyle })}
                    className="border border-border rounded px-1 py-1 text-mini bg-panel text-fg focus:outline-none">
                    <option value="none">Sin lista</option>
                    <option value="bullet">• Viñetas</option>
                    <option value="number">1. Numerada</option>
                  </select>
                </>
              )
            })()}
        </Group>
      )}

      {showStroke && (
        <>
          {/* Grosor: pesos visibles (se ve el trazo antes de dibujarlo) + ajuste fino */}
          <Group>
            <Label>Grosor</Label>
            {WIDTH_PRESETS.map((w) => (
              <button key={w} onClick={() => changeWidth(w)} title={`${w} pt`} aria-label={`Grosor ${w}`}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                  lineWidthVal === w ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
                }`}>
                <span className="rounded-full bg-current block" style={{ width: Math.max(2, w * 1.6), height: Math.max(2, w * 1.6) }} />
              </button>
            ))}
            <input type="number" min={0.5} max={24} step={0.5} value={lineWidthVal}
              onChange={(e) => changeWidth(Math.min(24, Math.max(0.5, parseFloat(e.target.value) || 1)))}
              className="w-12 border border-border rounded px-1 py-0.5 text-micro text-center bg-surface text-fg focus:outline-none focus:border-accent"
              title="Grosor exacto (pt)" aria-label="Grosor exacto" />
          </Group>

          <Group>
            <Label>Estilo</Label>
            {LINE_STYLES.map((ls) => (
              <button key={ls.id} onClick={() => changeStyle(ls.id)} title={ls.label} aria-label={`Línea ${ls.label}`}
                className={`h-7 w-9 rounded-md flex items-center justify-center transition-colors ${
                  lineStyleVal === ls.id ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
                }`}>
                <svg width="26" height="8" aria-hidden="true"><line x1="2" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={ls.dash} strokeLinecap="round" /></svg>
              </button>
            ))}
          </Group>

          <Group>
            <Label>Opacidad</Label>
            {OPACITY_PRESETS.map((o) => (
              <button key={o} onClick={() => changeOpacity(o / 100)} title={`${o}%`} aria-label={`Opacidad ${o}%`}
                className={`h-7 px-1.5 rounded-md text-micro tabular-nums transition-colors ${
                  Math.round(opacityVal * 100) === o ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
                }`}>{o}</button>
            ))}
            <input type="range" min={10} max={100} step={5} value={Math.round(opacityVal * 100)}
              onChange={(e) => changeOpacity(parseInt(e.target.value) / 100)} className="w-16" aria-label="Opacidad" />
          </Group>

          {fillCapable && (
            <Group>
              <Label>Relleno</Label>
              {fillColorVal ? (
                <>
                  <input type="color" value={fillColorVal} onChange={(e) => changeFillColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color de relleno" aria-label="Color de relleno" />
                  <input type="range" min={5} max={100} step={5} value={Math.round(fillOpacityVal * 100)}
                    onChange={(e) => changeFillOpacity(parseInt(e.target.value) / 100)} className="w-16" title="Opacidad del relleno" aria-label="Opacidad del relleno" />
                  <span className="text-micro text-muted w-8 tabular-nums">{Math.round(fillOpacityVal * 100)}%</span>
                  <button onClick={() => changeFillColor(null)} title="Quitar relleno" aria-label="Quitar relleno"
                    className="p-1 rounded-md text-muted hover:bg-hover hover:text-fg"><X size={12} /></button>
                </>
              ) : (
                <button onClick={() => changeFillColor(colorVal)} title="Rellenar con el color actual"
                  className="px-2 h-6 rounded-md text-micro text-muted hover:bg-hover hover:text-fg border border-dashed border-border">
                  sin relleno
                </button>
              )}
            </Group>
          )}
        </>
      )}

      {isStamp && (
        <Group>
          <Label>Sello</Label>
          <select value={store.selectedStamp} onChange={(e) => store.setSelectedStamp(e.target.value)}
            aria-label="Sello"
            className="border border-border rounded px-2 py-1 text-mini bg-panel text-fg focus:outline-none focus:border-accent">
              {[...BUILTIN_STAMPS, ...customStamps.map((s) => renderStampText(s, store.annotationAuthor))]
                .map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          {/* Vista previa: el mismo estilo con el que va a caer el sello */}
          <span className="px-2 py-0.5 rounded border border-dashed border-border max-w-[200px] truncate leading-none"
            title="Así se va a ver"
            style={{ color: store.stampColor, fontStyle: 'italic', fontWeight: 700, fontSize: Math.min(20, Math.max(10, store.stampSize * 0.6)) }}>
            {store.selectedStamp}
          </span>
          <Label>Tamaño</Label>
          <input type="range" min={8} max={72} step={2} value={store.stampSize}
            onChange={(e) => store.setStampSize(parseInt(e.target.value))} className="w-20" aria-label="Tamaño del sello" />
          <span className="text-micro text-muted w-6 tabular-nums">{store.stampSize}</span>
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-stamps'))}
            className="px-2 py-1 text-micro rounded border border-border text-muted hover:bg-hover hover:text-fg transition-colors">
            Gestionar…
          </button>
        </Group>
      )}

      {rotAnn && (
        <Group>
          <Label>Rotación</Label>
          <input type="range" min={0} max={360} step={1} value={rotAnn.rotation || 0}
            onChange={(e) => applyToSel({ rotation: parseInt(e.target.value) })} className="w-24" />
          <span className="text-micro text-muted w-8 tabular-nums">{rotAnn.rotation || 0}°</span>
        </Group>
      )}
    </div>
  )
}
