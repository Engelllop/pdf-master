import { type Annotation, type LineStyle } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { X, Bold, Italic, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { FONT_OPTIONS } from '../lib/fonts'
import { BUILTIN_STAMPS, loadStamps, renderStampText } from '../lib/stamps'

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
    'selectedStamp', 'setSelectedStamp', 'stampColor', 'setStampColor', 'updateAnnotation',
    'annotationAuthor',
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

  const Sep = () => <div className="w-px h-5 bg-border shrink-0" />
  const Label = ({ children }: { children: React.ReactNode }) => <span className="text-[11px] text-muted shrink-0">{children}</span>

  return (
    <div className="min-h-10 border-b border-border bg-toolbar flex items-center gap-3 px-3 py-1.5 flex-wrap text-fg">
      {(showColor || isStamp) && (
        <div className="flex items-center gap-1.5">
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
            className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color personalizado" />
        </div>
      )}

      {isTextCtx && (
        <>
          <Sep />
          <div className="flex items-center gap-2">
            <Label>Fuente</Label>
            <select value={selAnn?.type === 'text' ? (selAnn.fontFamily || store.textFontFamily) : store.textFontFamily}
              onChange={(e) => { store.setTextFontFamily(e.target.value); if (selAnn?.type === 'text') applyToSel({ fontFamily: e.target.value }) }}
              className="border border-border rounded px-2 py-1 text-xs bg-panel text-fg focus:outline-none focus:border-accent">
              {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <input type="number" min={4} max={72}
              value={selAnn?.type === 'text' ? (selAnn.fontSize || store.textFontSize) : store.textFontSize}
              onChange={(e) => { const v = parseInt(e.target.value) || 14; store.setTextFontSize(v); if (selAnn?.type === 'text') applyToSel({ fontSize: v }) }}
              className="w-14 border border-border rounded px-2 py-1 text-xs text-center bg-panel text-fg focus:outline-none focus:border-accent" title="Tamaño" />
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
              const tBtn = (active: boolean) => `p-1.5 rounded transition-colors ${active ? 'bg-hover text-accent' : 'text-muted hover:text-fg hover:bg-hover'}`
              return (
                <>
                  <button title="Negrita" className={tBtn(sv.bold)} onClick={() => setStyle({ bold: !sv.bold })}><Bold size={13} /></button>
                  <button title="Cursiva" className={tBtn(sv.italic)} onClick={() => setStyle({ italic: !sv.italic })}><Italic size={13} /></button>
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    return <button key={a} title={`Alinear ${a}`} className={tBtn(sv.align === a)} onClick={() => setStyle({ align: a })}><Icon size={13} /></button>
                  })}
                  <select title="Interlineado" value={sv.lineHeight} onChange={(e) => setStyle({ lineHeight: parseFloat(e.target.value) })}
                    className="border border-border rounded px-1 py-1 text-xs bg-panel text-fg focus:outline-none">
                    {[1, 1.15, 1.3, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
                  </select>
                  <select title="Lista" value={sv.listStyle} onChange={(e) => setStyle({ listStyle: e.target.value as typeof sv.listStyle })}
                    className="border border-border rounded px-1 py-1 text-xs bg-panel text-fg focus:outline-none">
                    <option value="none">Sin lista</option>
                    <option value="bullet">• Viñetas</option>
                    <option value="number">1. Numerada</option>
                  </select>
                </>
              )
            })()}
          </div>
        </>
      )}

      {showStroke && (
        <>
          <Sep />
          <div className="flex items-center gap-2">
            <Label>Grosor</Label>
            <input type="range" min={0.5} max={12} step={0.5} value={lineWidthVal}
              onChange={(e) => changeWidth(parseFloat(e.target.value))} className="w-20" />
            <span className="text-[11px] text-muted w-6">{lineWidthVal}</span>
          </div>
          <div className="flex items-center gap-1">
            {LINE_STYLES.map((ls) => (
              <button key={ls.id} onClick={() => changeStyle(ls.id)} title={ls.label} aria-label={`Línea ${ls.label}`}
                className={`h-7 w-9 rounded border flex items-center justify-center transition-colors ${
                  lineStyleVal === ls.id ? 'border-accent bg-active text-accent' : 'border-border text-muted hover:bg-hover'
                }`}>
                <svg width="26" height="8" aria-hidden="true"><line x1="2" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={ls.dash} strokeLinecap="round" /></svg>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label>Opacidad</Label>
            <input type="range" min={10} max={100} step={5} value={Math.round(opacityVal * 100)}
              onChange={(e) => changeOpacity(parseInt(e.target.value) / 100)} className="w-20" />
            <span className="text-[11px] text-muted w-8">{Math.round(opacityVal * 100)}%</span>
          </div>
          {fillCapable && (
            <div className="flex items-center gap-2">
              <Label>Relleno</Label>
              <input type="color" value={fillColorVal || '#ffffff'} onChange={(e) => changeFillColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color de relleno" />
              {fillColorVal ? (
                <>
                  <input type="range" min={5} max={100} step={5} value={Math.round(fillOpacityVal * 100)}
                    onChange={(e) => changeFillOpacity(parseInt(e.target.value) / 100)} className="w-16" title="Opacidad del relleno" />
                  <button onClick={() => changeFillColor(null)} title="Quitar relleno"
                    className="p-1 rounded border border-border text-muted hover:bg-hover"><X size={12} /></button>
                </>
              ) : <Label>sin relleno</Label>}
            </div>
          )}
        </>
      )}

      {isStamp && (
        <>
          <Sep />
          <div className="flex items-center gap-2">
            <Label>Sello</Label>
            <select value={store.selectedStamp} onChange={(e) => store.setSelectedStamp(e.target.value)}
              className="border border-border rounded px-2 py-1 text-xs bg-panel text-fg focus:outline-none focus:border-accent">
              {[...BUILTIN_STAMPS, ...customStamps.map((s) => renderStampText(s, store.annotationAuthor))]
                .map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-stamps'))}
              className="px-2 py-1 text-[11px] rounded border border-border text-muted hover:bg-hover hover:text-fg transition-colors">
              Gestionar…
            </button>
          </div>
        </>
      )}

      {rotAnn && (
        <>
          <Sep />
          <div className="flex items-center gap-2">
            <Label>Rotación</Label>
            <input type="range" min={0} max={360} step={1} value={rotAnn.rotation || 0}
              onChange={(e) => applyToSel({ rotation: parseInt(e.target.value) })} className="w-24" />
            <span className="text-[11px] text-muted w-8">{rotAnn.rotation || 0}°</span>
          </div>
        </>
      )}
    </div>
  )
}
