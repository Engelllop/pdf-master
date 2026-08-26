import { useMemo } from 'react'
import { type LineStyle } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  X, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { FONT_OPTIONS } from '../lib/fonts'
import { BUILTIN_STAMPS, loadStamps, renderStampText } from '../lib/stamps'

const WIDTH_PRESETS = [0.5, 1, 2, 4, 8]
// Mismo tope que el store y que la barra flotante de la marca seleccionada: el input
// decía 24, el store recortaba a 20 y la ficha del proyecto hablaba de 12.
const WIDTH_MAX = 20
const OPACITY_PRESETS = [25, 50, 75, 100]

const COLORS = ['#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#1f2329', '#ffffff']
// Un lector de pantalla leyendo «Color numeral efe be be dos cuatro» no dice nada.
const COLOR_NAMES: Record<string, string> = {
  '#fbbf24': 'Ámbar', '#ef4444': 'Rojo', '#3b82f6': 'Azul', '#22c55e': 'Verde',
  '#a855f7': 'Morado', '#1f2329': 'Negro', '#ffffff': 'Blanco',
}
const SHAPE_IDS = ['check', 'cross', 'star', 'cloud', 'polygon']
const STROKE_TOOLS = ['draw', 'rect', 'circle', 'arrow', 'line', 'callout', 'underline', 'strikethrough', 'highlight', 'signature', 'measure_calibrate', 'measure_distance', 'measure_area', 'measure_perimeter', ...SHAPE_IDS]
const COLOR_TOOLS = [...STROKE_TOOLS, 'note', 'text']
const FILLABLE = ['rect', 'circle', 'star', 'cloud', 'polygon', 'callout']
const LINE_STYLES: Array<{ id: LineStyle; label: string; dash?: string }> = [
  { id: 'solid', label: 'Sólida' },
  { id: 'dashed', label: 'Discontinua', dash: '6 3' },
  { id: 'dotted', label: 'Punteada', dash: '1.5 3.5' },
]

export default function PropertiesBar() {
  // `useMemo` sin dependencias: la lista solo cambia desde el gestor de sellos, que
  // remonta esta barra al cerrarse. Antes se parseaba localStorage en CADA render.
  const customStamps = useMemo(() => loadStamps(), [])
  const store = useStoreSlice(
    'docs', 'activeDocId', 'activeTool', 'selectedAnnotationId',
    'annotationColor', 'setAnnotationColor', 'annotationLineWidth', 'setAnnotationLineWidth',
    'annotationLineStyle', 'setAnnotationLineStyle', 'annotationOpacity', 'setAnnotationOpacity',
    'annotationFillColor', 'setAnnotationFillColor', 'annotationFillOpacity', 'setAnnotationFillOpacity',
    'textFontFamily', 'setTextFontFamily', 'textFontSize', 'setTextFontSize', 'textStyle', 'setTextStyle',
    'selectedStamp', 'setSelectedStamp', 'stampColor', 'setStampColor', 'stampSize', 'setStampSize',
    'annotationAuthor',
  )
  const { activeTool, activeDocId, docs } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const selAnn = activeDoc?.annotations.find((a) => a.id === store.selectedAnnotationId) || null

  const isTextCtx = activeTool === 'text' || activeTool === 'callout'
  const showStroke = !!activeTool && STROKE_TOOLS.includes(activeTool)
  const showColor = isTextCtx || showStroke || activeTool === 'note' || (!!activeTool && COLOR_TOOLS.includes(activeTool))
  const isStamp = activeTool === 'stamp'
  const fillCapable = !!activeTool && FILLABLE.includes(activeTool)

  // Defaults de herramienta. La marca seleccionada se edita en la barra flotante.
  if (!activeDoc || selAnn || (!showColor && !showStroke && !isTextCtx && !isStamp)) return null

  const lineWidthVal = store.annotationLineWidth
  const lineStyleVal: LineStyle = store.annotationLineStyle
  const opacityVal = store.annotationOpacity
  const fillColorVal = store.annotationFillColor
  const fillOpacityVal = store.annotationFillOpacity
  const colorVal = store.annotationColor

  const Label = ({ children }: { children: React.ReactNode }) => <span className="text-micro text-muted shrink-0">{children}</span>
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
            const set = isStamp ? store.setStampColor : store.setAnnotationColor
            return (
              <button key={c} onClick={() => set(c)} aria-label={COLOR_NAMES[c] || c} aria-pressed={current.toLowerCase() === c.toLowerCase()}
                className={`w-5 h-5 rounded-full border transition-transform ${current.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-accent scale-110 border-transparent' : 'border-border hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            )
          })}
          <input type="color" value={isStamp ? store.stampColor : colorVal}
            onChange={(e) => (isStamp ? store.setStampColor(e.target.value) : store.setAnnotationColor(e.target.value))}
            className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color personalizado" aria-label="Color personalizado" />
        </Group>
      )}

      {isTextCtx && (
        <Group>
          <Label>Fuente</Label>
            <select value={store.textFontFamily}
              onChange={(e) => store.setTextFontFamily(e.target.value)}
              aria-label="Fuente"
              className="border border-border rounded px-2 py-1 text-mini bg-panel text-fg focus:outline-none focus:border-accent">
              {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <input type="number" min={4} max={72}
              value={store.textFontSize}
              onChange={(e) => store.setTextFontSize(parseInt(e.target.value) || 14)}
              className="w-14 border border-border rounded px-2 py-1 text-mini text-center bg-panel text-fg focus:outline-none focus:border-accent" title="Tamaño" aria-label="Tamaño de fuente" />
            <Label>px</Label>
            {(() => {
              const sv = store.textStyle
              const tBtn = (active: boolean) => `p-1.5 rounded transition-colors ${active ? 'bg-accent text-toolbar' : 'text-muted hover:text-fg hover:bg-hover'}`
              return (
                <>
                  <button title="Negrita" aria-label="Negrita" aria-pressed={sv.bold} className={tBtn(sv.bold)} onClick={() => store.setTextStyle({ bold: !sv.bold })}><Bold size={13} /></button>
                  <button title="Cursiva" aria-label="Cursiva" aria-pressed={sv.italic} className={tBtn(sv.italic)} onClick={() => store.setTextStyle({ italic: !sv.italic })}><Italic size={13} /></button>
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    const alignLabel = a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'
                    return <button key={a} title={`Alinear ${alignLabel}`} aria-label={`Alinear ${alignLabel}`} aria-pressed={sv.align === a} className={tBtn(sv.align === a)} onClick={() => store.setTextStyle({ align: a })}><Icon size={13} /></button>
                  })}
                  <select title="Interlineado" aria-label="Interlineado" value={sv.lineHeight} onChange={(e) => store.setTextStyle({ lineHeight: parseFloat(e.target.value) })}
                    className="border border-border rounded px-1 py-1 text-mini bg-panel text-fg focus:outline-none">
                    {[1, 1.15, 1.3, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
                  </select>
                  <select title="Lista" aria-label="Lista" value={sv.listStyle} onChange={(e) => store.setTextStyle({ listStyle: e.target.value as typeof sv.listStyle })}
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
          <Group>
            <Label>Grosor</Label>
            {WIDTH_PRESETS.map((w) => (
              <button key={w} onClick={() => store.setAnnotationLineWidth(w)} title={`${w} pt`} aria-label={`Grosor ${w}`} aria-pressed={lineWidthVal === w}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                  lineWidthVal === w ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
                }`}>
                <span className="rounded-full bg-current block" style={{ width: Math.max(2, w * 1.6), height: Math.max(2, w * 1.6) }} />
              </button>
            ))}
            <input type="number" min={0.5} max={WIDTH_MAX} step={0.5} value={lineWidthVal}
              onChange={(e) => store.setAnnotationLineWidth(parseFloat(e.target.value) || 1)}
              className="w-12 border border-border rounded px-1 py-0.5 text-micro text-center bg-surface text-fg focus:outline-none focus:border-accent"
              title="Grosor exacto (pt)" aria-label="Grosor exacto" />
          </Group>

          <Group>
            <Label>Estilo</Label>
            {LINE_STYLES.map((ls) => (
              <button key={ls.id} onClick={() => store.setAnnotationLineStyle(ls.id)} title={ls.label} aria-label={`Línea ${ls.label}`} aria-pressed={lineStyleVal === ls.id}
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
              <button key={o} onClick={() => store.setAnnotationOpacity(o / 100)} title={`${o}%`} aria-label={`Opacidad ${o}%`}
                className={`h-7 px-1.5 rounded-md text-micro tabular-nums transition-colors ${
                  Math.round(opacityVal * 100) === o ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
                }`}>{o}</button>
            ))}
            <input type="range" min={10} max={100} step={5} value={Math.round(opacityVal * 100)}
              onChange={(e) => store.setAnnotationOpacity(parseInt(e.target.value) / 100)} className="w-16" aria-label="Opacidad" />
          </Group>

          {fillCapable && (
            <Group>
              <Label>Relleno</Label>
              {fillColorVal ? (
                <>
                  <input type="color" value={fillColorVal} onChange={(e) => store.setAnnotationFillColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-border p-0 bg-transparent" title="Color de relleno" aria-label="Color de relleno" />
                  <input type="range" min={5} max={100} step={5} value={Math.round(fillOpacityVal * 100)}
                    onChange={(e) => store.setAnnotationFillOpacity(parseInt(e.target.value) / 100)} className="w-16" title="Opacidad del relleno" aria-label="Opacidad del relleno" />
                  <span className="text-micro text-muted w-8 tabular-nums">{Math.round(fillOpacityVal * 100)}%</span>
                  <button onClick={() => store.setAnnotationFillColor(null)} title="Quitar relleno" aria-label="Quitar relleno"
                    className="p-1 rounded-md text-muted hover:bg-hover hover:text-fg"><X size={12} /></button>
                </>
              ) : (
                <button onClick={() => store.setAnnotationFillColor(colorVal)} title="Rellenar con el color actual"
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
    </div>
  )
}
