import { MessageSquare } from 'lucide-react'
import { type Annotation } from '../../store/usePdfStore'

export interface PageDims {
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

export type ToScreen = (pdfX: number, pdfY: number) => { x: number; y: number }

// lineWidth se guarda en puntos PDF (igual que al embeber); el SVG vive en px de
// bitmap, así que el trazo escala con el zoom exactamente como la página.
export function strokePropsFor(ann: Annotation, sx: number, defaultWidth = 2) {
  const lw = (ann.lineWidth ?? defaultWidth) * sx
  const style = ann.lineStyle || 'solid'
  return {
    strokeWidth: lw,
    strokeDasharray: style === 'dashed' ? `${lw * 3} ${lw * 2}` : style === 'dotted' ? `${Math.max(0.5, lw * 0.1)} ${lw * 2}` : undefined,
    strokeLinecap: 'round' as const,
    opacity: ann.opacity ?? 1,
  }
}

export function getAnnotationBounds(
  ann: Annotation,
  pageData: PageDims,
  toScreen: ToScreen,
): { x: number; y: number; w: number; h: number } | null {
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  switch (ann.type) {
    case 'highlight':
    case 'rect':
    case 'circle':
    case 'check':
    case 'cross':
    case 'star':
    case 'cloud': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 0) * sx, h: (ann.height || 0) * sy }
    }
    case 'underline':
    case 'strikethrough': {
      const s = toScreen(ann.x, ann.y)
      const h = (ann.height || 16) * sy
      return { x: s.x, y: s.y, w: (ann.width || 0) * sx, h }
    }
    case 'text': {
      const s = toScreen(ann.x, ann.y)
      const fs = (ann.fontSize || 14)
      const tw = ann.width ? ann.width * sx : Math.max(80, (ann.text?.length || 4) * fs * 0.55) * sx
      const th = ann.height ? ann.height * sy : Math.max(24, fs * 1.4) * sy
      return { x: s.x, y: s.y, w: tw, h: th }
    }
    case 'note': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 28) * sx, h: (ann.height || 28) * sy }
    }
    case 'count': {
      const s = toScreen(ann.x, ann.y)
      const r = 9 * sx
      return { x: s.x - r, y: s.y - r * (sy / sx), w: r * 2, h: r * 2 * (sy / sx) }
    }
    case 'image': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 200) * sx, h: (ann.height || 150) * sy }
    }
    case 'arrow':
    case 'line': {
      const s1 = toScreen(ann.x, ann.y)
      const s2 = toScreen(ann.x + (ann.width || 0), ann.y + (ann.height || 0))
      return { x: Math.min(s1.x, s2.x), y: Math.min(s1.y, s2.y), w: Math.abs(s2.x - s1.x), h: Math.abs(s2.y - s1.y) }
    }
    case 'callout': {
      const s = toScreen(ann.x, ann.y)
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      return { x: w < 0 ? s.x + w : s.x, y: h < 0 ? s.y + h : s.y, w: Math.abs(w), h: Math.abs(h) }
    }
    case 'draw':
    case 'polygon':
    case 'measure_perimeter': {
      if (!ann.points || ann.points.length === 0) return null
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    }
    default:
      return null
  }
}

// Estrella de 5 puntas inscrita en el bbox (radios escalados por eje para llenarlo).
function starPath(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2
  const cy = y + h / 2
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const f = i % 2 === 0 ? 0.5 : 0.21
    pts.push(`${cx + Math.cos(angle) * w * f},${cy + Math.sin(angle) * h * f}`)
  }
  return `M ${pts.join(' L ')} Z`
}

// Nube: rect con festones semicirculares hacia afuera en todo el perímetro.
function cloudPath(x: number, y: number, w: number, h: number): string {
  const r = Math.max(5, Math.min(w, h) / 6)
  const seg = (len: number) => Math.max(2, Math.round(len / (r * 2)))
  let d = `M ${x} ${y}`
  const nTop = seg(w)
  for (let i = 1; i <= nTop; i++) d += ` A ${w / nTop / 2} ${r} 0 0 1 ${x + (w / nTop) * i} ${y}`
  const nRight = seg(h)
  for (let i = 1; i <= nRight; i++) d += ` A ${h / nRight / 2} ${r} 0 0 1 ${x + w} ${y + (h / nRight) * i}`
  const nBottom = seg(w)
  for (let i = 1; i <= nBottom; i++) d += ` A ${w / nBottom / 2} ${r} 0 0 1 ${x + w - (w / nBottom) * i} ${y + h}`
  const nLeft = seg(h)
  for (let i = 1; i <= nLeft; i++) d += ` A ${h / nLeft / 2} ${r} 0 0 1 ${x} ${y + h - (h / nLeft) * i}`
  return d + ' Z'
}

export interface RenderAnnotationOptions {
  isPreview?: boolean
  onSelect?: (e: React.MouseEvent) => void
  onNoteClick?: (ann: Annotation, screen: { x: number; y: number }) => void
  onTextDoubleClick?: (ann: Annotation) => void
  textDefaults?: { fontSize: number; fontFamily: string }
}

export function renderAnnotation(
  ann: Annotation,
  pd: PageDims,
  toScreen: ToScreen,
  opts: RenderAnnotationOptions = {},
) {
  const { isPreview = false, onSelect, onNoteClick, onTextDoubleClick, textDefaults } = opts
  const s = toScreen(ann.x, ann.y)
  const sx = pd.width / pd.originalWidth
  const sy = pd.height / pd.originalHeight
  const key = isPreview ? 'preview' : ann.id
  const stroke = strokePropsFor(ann, sx, ann.type === 'signature' ? 3 : 2)
  const clickProps = (!isPreview && onSelect)
    ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(e) }, style: { cursor: 'pointer' } }
    : {}

  switch (ann.type) {
    case 'highlight': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      return (
        <rect key={key} x={w < 0 ? s.x + w : s.x} y={h < 0 ? s.y + h : s.y}
          width={Math.abs(w)} height={Math.abs(h)}
          fill={ann.color || '#fbbf24'} fillOpacity={ann.opacity ?? (isPreview ? 0.6 : 0.5)} rx={2} {...clickProps} />
      )
    }
    case 'underline': {
      const ulH = (ann.height || 16) * sy
      return (
        <line key={key} x1={s.x} y1={s.y + ulH - 2} x2={s.x + ((ann.width || 0) * sx)} y2={s.y + ulH - 2}
          stroke={ann.color || '#3b82f6'} {...stroke} {...clickProps} />
      )
    }
    case 'strikethrough': {
      const stH = (ann.height || 16) * sy
      return (
        <line key={key} x1={s.x} y1={s.y + stH / 2} x2={s.x + ((ann.width || 0) * sx)} y2={s.y + stH / 2}
          stroke={ann.color || '#ef4444'} {...stroke} {...clickProps} />
      )
    }
    case 'rect': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      return (
        <rect key={key} x={w < 0 ? s.x + w : s.x} y={h < 0 ? s.y + h : s.y}
          width={Math.abs(w)} height={Math.abs(h)}
          fill={ann.fillColor || 'none'} fillOpacity={ann.fillColor ? (ann.fillOpacity ?? 0.3) : undefined}
          stroke={ann.color || '#fff'} rx={2} {...stroke} {...clickProps} />
      )
    }
    case 'check': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      const nx = w < 0 ? s.x + w : s.x
      const ny = h < 0 ? s.y + h : s.y
      const aw = Math.abs(w)
      const ah = Math.abs(h)
      return (
        <path key={key} d={`M ${nx + aw * 0.12} ${ny + ah * 0.55} L ${nx + aw * 0.42} ${ny + ah * 0.85} L ${nx + aw * 0.88} ${ny + ah * 0.15}`}
          fill="none" stroke={ann.color || '#22c55e'} {...stroke} strokeLinecap="round" strokeLinejoin="round" {...clickProps} />
      )
    }
    case 'cross': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      const nx = w < 0 ? s.x + w : s.x
      const ny = h < 0 ? s.y + h : s.y
      const aw = Math.abs(w)
      const ah = Math.abs(h)
      return (
        <path key={key} d={`M ${nx + aw * 0.15} ${ny + ah * 0.15} L ${nx + aw * 0.85} ${ny + ah * 0.85} M ${nx + aw * 0.85} ${ny + ah * 0.15} L ${nx + aw * 0.15} ${ny + ah * 0.85}`}
          fill="none" stroke={ann.color || '#ef4444'} {...stroke} strokeLinecap="round" {...clickProps} />
      )
    }
    case 'star': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      const nx = w < 0 ? s.x + w : s.x
      const ny = h < 0 ? s.y + h : s.y
      return (
        <path key={key} d={starPath(nx, ny, Math.abs(w), Math.abs(h))}
          fill={ann.fillColor || 'none'} fillOpacity={ann.fillColor ? (ann.fillOpacity ?? 0.3) : undefined}
          stroke={ann.color || '#f59e0b'} strokeLinejoin="round" {...stroke} {...clickProps} />
      )
    }
    case 'cloud': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      const nx = w < 0 ? s.x + w : s.x
      const ny = h < 0 ? s.y + h : s.y
      return (
        <path key={key} d={cloudPath(nx, ny, Math.abs(w), Math.abs(h))}
          fill={ann.fillColor || 'none'} fillOpacity={ann.fillColor ? (ann.fillOpacity ?? 0.3) : undefined}
          stroke={ann.color || '#3b82f6'} strokeLinejoin="round" {...stroke} {...clickProps} />
      )
    }
    case 'polygon': {
      if (!ann.points || ann.points.length < 3) return null
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      return (
        <path key={key} d={`M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`}
          fill={ann.fillColor || 'none'} fillOpacity={ann.fillColor ? (ann.fillOpacity ?? 0.3) : undefined}
          stroke={ann.color || '#8b5cf6'} strokeLinejoin="round" {...stroke} {...clickProps} />
      )
    }
    case 'circle': {
      const w = (ann.width || 0) * sx
      const h = (ann.height || 0) * sy
      return (
        <ellipse key={key} cx={s.x + w / 2} cy={s.y + h / 2} rx={Math.abs(w) / 2} ry={Math.abs(h) / 2}
          fill={ann.fillColor || 'none'} fillOpacity={ann.fillColor ? (ann.fillOpacity ?? 0.3) : undefined}
          stroke={ann.color || '#fff'} {...stroke} {...clickProps} />
      )
    }
    case 'arrow': {
      const x2 = s.x + ((ann.width || 0) * sx)
      const y2 = s.y + ((ann.height || 0) * sy)
      const angle = Math.atan2(y2 - s.y, x2 - s.x)
      const headLen = Math.max(8, stroke.strokeWidth * 4)
      const x3 = x2 - headLen * Math.cos(angle - Math.PI / 6)
      const y3 = y2 - headLen * Math.sin(angle - Math.PI / 6)
      const x4 = x2 - headLen * Math.cos(angle + Math.PI / 6)
      const y4 = y2 - headLen * Math.sin(angle + Math.PI / 6)
      return (
        <g key={key} opacity={stroke.opacity} {...clickProps}>
          <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={ann.color || '#fff'} {...stroke} opacity={undefined} />
          <polygon points={`${x2},${y2} ${x3},${y3} ${x4},${y4}`} fill={ann.color || '#fff'} />
        </g>
      )
    }
    case 'line': {
      const x2 = s.x + ((ann.width || 0) * sx)
      const y2 = s.y + ((ann.height || 0) * sy)
      return (
        <line key={key} x1={s.x} y1={s.y} x2={x2} y2={y2}
          stroke={ann.color || '#fff'} {...stroke} {...clickProps} />
      )
    }
    case 'callout': {
      // Caja de texto + línea guía al punto señalado (points[0]).
      const w = Math.abs((ann.width || 0) * sx)
      const h = Math.abs((ann.height || 0) * sy)
      const bx = (ann.width || 0) < 0 ? s.x + (ann.width || 0) * sx : s.x
      const by = (ann.height || 0) < 0 ? s.y + (ann.height || 0) * sy : s.y
      const tip = ann.points?.[0] ? toScreen(ann.points[0].x, ann.points[0].y) : null
      const color = ann.color || '#ef4444'
      const fontSize = (ann.fontSize || textDefaults?.fontSize || 12) * sx
      // La línea sale del lado de la caja que mira a la punta.
      const cx = bx + w / 2
      const cy = by + h / 2
      let anchorX = cx
      let anchorY = cy
      if (tip) {
        anchorX = tip.x < bx ? bx : tip.x > bx + w ? bx + w : cx
        anchorY = tip.y < by ? by : tip.y > by + h ? by + h : cy
      }
      return (
        <g key={key} opacity={ann.opacity ?? 1} {...clickProps}
          onDoubleClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(e); if (onTextDoubleClick) onTextDoubleClick(ann) }}>
          {tip && (
            <>
              <line x1={anchorX} y1={anchorY} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={stroke.strokeWidth} />
              <circle cx={tip.x} cy={tip.y} r={Math.max(2, stroke.strokeWidth * 1.5)} fill={color} />
            </>
          )}
          <rect x={bx} y={by} width={w} height={h} rx={3}
            fill={ann.fillColor || '#ffffff'} fillOpacity={ann.fillOpacity ?? 0.9}
            stroke={color} strokeWidth={stroke.strokeWidth} strokeDasharray={stroke.strokeDasharray} />
          <foreignObject x={bx + 3} y={by + 2} width={Math.max(0, w - 6)} height={Math.max(0, h - 4)}>
            <div className="select-none" style={{
              color, fontFamily: ann.fontFamily || textDefaults?.fontFamily || 'Arial',
              fontSize, lineHeight: ann.lineHeight || 1.25, whiteSpace: 'pre-wrap', wordWrap: 'break-word',
              fontWeight: ann.bold ? 700 : 400, fontStyle: ann.italic ? 'italic' : 'normal',
              textAlign: ann.align || 'left', overflow: 'hidden',
            }}>
              {ann.text || ''}
            </div>
          </foreignObject>
        </g>
      )
    }
    case 'draw':
    case 'signature': {
      if (!ann.points || ann.points.length < 2) return null
      const d = ann.points.map((p, i) => {
        const sp = toScreen(p.x, p.y)
        return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`
      }).join(' ')
      return <path key={key} d={d} fill="none" stroke={ann.color || '#fff'} strokeLinejoin="round" {...stroke} {...clickProps} />
    }
    case 'note': {
      const nw = (ann.width || 24) * sx
      const nh = (ann.height || 24) * sy
      const iconSize = Math.max(12, Math.min(nw, nh) * 0.6)
      return (
        <g key={key} {...clickProps}
          onClick={(e) => {
            e.stopPropagation()
            if (onSelect) onSelect(e)
            if (onNoteClick) onNoteClick(ann, toScreen(ann.x, ann.y))
          }}>
          <rect x={s.x} y={s.y} width={nw} height={nh} fill={ann.color || '#fbbf24'} rx={3} />
          <foreignObject x={s.x} y={s.y} width={nw} height={nh}>
            <div className="flex items-center justify-center w-full h-full pointer-events-none">
              <MessageSquare size={iconSize} color="#000" />
            </div>
          </foreignObject>
        </g>
      )
    }
    case 'text': {
      const fontSize = ann.fontSize || textDefaults?.fontSize || 14
      const fontFamily = ann.fontFamily || textDefaults?.fontFamily || 'Arial'
      // fontSize is stored in PDF points; the SVG lives in bitmap-px space, so the
      // on-screen size scales with zoom exactly like the page (and matches the editor).
      const displayFontSize = fontSize * sx
      const lh = ann.lineHeight || 1.3
      const rawLines = (ann.text || '').split('\n')
      const textLines = ann.listStyle === 'bullet' ? rawLines.map((l) => `• ${l}`)
        : ann.listStyle === 'number' ? rawLines.map((l, i) => `${i + 1}. ${l}`)
        : rawLines
      const longestLine = textLines.reduce((m, l) => Math.max(m, l.length), 4)
      const textWidth = ann.width ? ann.width * sx : Math.max(120 * sx, (longestLine + 1) * displayFontSize * 0.6)
      const textHeight = ann.height ? ann.height * sy : Math.max(30 * sy, textLines.length * displayFontSize * lh * 1.05)
      return (
        <foreignObject key={key} x={s.x} y={s.y} width={textWidth} height={textHeight}
          {...clickProps}
          onDoubleClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(e); if (onTextDoubleClick) onTextDoubleClick(ann) }}>
          <div className="select-none" style={{
            color: ann.color || '#fff', wordWrap: 'break-word', whiteSpace: 'pre-wrap', lineHeight: lh,
            fontFamily, fontSize: displayFontSize, opacity: ann.opacity ?? 1,
            fontWeight: ann.bold ? 700 : 400, fontStyle: ann.italic ? 'italic' : 'normal',
            textAlign: ann.align || 'left',
          }}>
            {textLines.join('\n')}
          </div>
        </foreignObject>
      )
    }
    case 'image': {
      const iw = (ann.width || 200) * sx
      const ih = (ann.height || 150) * sy
      const rot = ann.rotation || 0
      const cx = s.x + iw / 2
      const cy = s.y + ih / 2
      return (
        <g key={key} {...clickProps} transform={`rotate(${rot}, ${cx}, ${cy})`} opacity={ann.opacity ?? 1}>
          {ann.imageData ? (
            <image href={ann.imageData} x={s.x} y={s.y} width={iw} height={ih} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <rect x={s.x} y={s.y} width={iw} height={ih} fill="none" stroke={ann.color || '#fff'} strokeWidth={2} strokeDasharray="4 2" />
          )}
        </g>
      )
    }
    case 'count': {
      const r = 9 * sx
      const color = ann.color || '#ef4444'
      const sw = Math.max(1, r * 0.16)
      const inner = Math.max(1, r * 0.2)
      const symbol = ann.symbol || 'circle'
      // El símbolo distingue categorías de conteo de un vistazo (estilo Bluebeam).
      const shape = symbol === 'square'
        ? <rect x={s.x - r * 0.85} y={s.y - r * 0.85} width={r * 1.7} height={r * 1.7} fill={color} stroke="#fff" strokeWidth={sw} rx={r * 0.15} />
        : symbol === 'triangle'
        ? <polygon points={`${s.x},${s.y - r} ${s.x + r * 0.9},${s.y + r * 0.7} ${s.x - r * 0.9},${s.y + r * 0.7}`} fill={color} stroke="#fff" strokeWidth={sw} strokeLinejoin="round" />
        : symbol === 'diamond'
        ? <polygon points={`${s.x},${s.y - r} ${s.x + r},${s.y} ${s.x},${s.y + r} ${s.x - r},${s.y}`} fill={color} stroke="#fff" strokeWidth={sw} strokeLinejoin="round" />
        : symbol === 'star'
        ? <path d={starPath(s.x - r, s.y - r, r * 2, r * 2)} fill={color} stroke="#fff" strokeWidth={sw} strokeLinejoin="round" />
        : <circle cx={s.x} cy={s.y} r={r} fill={symbol === 'cross' ? 'none' : color} stroke={symbol === 'cross' ? color : '#fff'} strokeWidth={sw} />
      return (
        <g key={key} {...clickProps} opacity={ann.opacity ?? 1}>
          <title>{`Conteo: ${ann.text || 'General'}`}</title>
          {shape}
          {(symbol === 'circle' || symbol === 'cross') && (
            <>
              <line x1={s.x - r * 0.45} y1={s.y} x2={s.x + r * 0.45} y2={s.y}
                stroke={symbol === 'cross' ? color : '#fff'} strokeWidth={inner} strokeLinecap="round" />
              <line x1={s.x} y1={s.y - r * 0.45} x2={s.x} y2={s.y + r * 0.45}
                stroke={symbol === 'cross' ? color : '#fff'} strokeWidth={inner} strokeLinecap="round" />
            </>
          )}
        </g>
      )
    }
    case 'measure_perimeter': {
      if (!ann.points || ann.points.length < 2) return null
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      const label = ann.measurement?.label || ''
      const mid = pts[Math.floor(pts.length / 2)]
      return (
        <g key={key} opacity={stroke.opacity} {...clickProps}>
          <path d={d} fill="none" stroke={ann.color || '#22d3ee'} strokeWidth={stroke.strokeWidth}
            strokeDasharray={`${stroke.strokeWidth * 3} ${stroke.strokeWidth * 1.5}`} strokeLinejoin="round" />
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={ann.color || '#22d3ee'} />)}
          {label && (
            <>
              <rect x={mid.x - label.length * 4.5 - 6} y={mid.y - 26} width={label.length * 9 + 12} height={22} rx={4}
                fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
              <text x={mid.x} y={mid.y - 9} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{label}</text>
            </>
          )}
        </g>
      )
    }
    case 'measure_distance': {
      const x2 = s.x + ((ann.width || 0) * sx)
      const y2 = s.y + ((ann.height || 0) * sy)
      const midX = (s.x + x2) / 2
      const midY = (s.y + y2) / 2
      const angle = Math.atan2(y2 - s.y, x2 - s.x)
      const label = ann.measurement?.label || ''
      return (
        <g key={key} opacity={stroke.opacity} {...clickProps}>
          <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke={ann.color || '#22d3ee'} strokeWidth={stroke.strokeWidth} strokeDasharray={`${stroke.strokeWidth * 3} ${stroke.strokeWidth * 1.5}`} />
          <circle cx={s.x} cy={s.y} r={3} fill={ann.color || '#22d3ee'} />
          <circle cx={x2} cy={y2} r={3} fill={ann.color || '#22d3ee'} />
          <g transform={`translate(${midX}, ${midY}) rotate(${(angle * 180) / Math.PI})`}>
            <rect x={-label.length * 4.5 - 6} y={-12} width={label.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
            <text x={0} y={5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{label}</text>
          </g>
        </g>
      )
    }
    case 'measure_area': {
      if (!ann.points || ann.points.length < 3) return null
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
      const label = ann.measurement?.label || ''
      // Centroid for label
      let cx = 0, cy = 0
      pts.forEach((p) => { cx += p.x; cy += p.y })
      cx /= pts.length
      cy /= pts.length
      return (
        <g key={key} opacity={stroke.opacity} {...clickProps}>
          <path d={d} fill={ann.color || '#22d3ee'} fillOpacity={ann.fillOpacity ?? 0.15} stroke={ann.color || '#22d3ee'} strokeWidth={stroke.strokeWidth} strokeDasharray={`${stroke.strokeWidth * 2} ${stroke.strokeWidth}`} />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={ann.color || '#22d3ee'} />
          ))}
          <rect x={cx - label.length * 4.5 - 6} y={cy - 12} width={label.length * 9 + 12} height={22} rx={4} fill="rgba(15,23,42,0.9)" stroke={ann.color || '#22d3ee'} strokeWidth={1} />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="#fff" fontSize="14" fontFamily="sans-serif">{label}</text>
        </g>
      )
    }
    default:
      return null
  }
}
