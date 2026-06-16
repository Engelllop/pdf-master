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
    case 'circle': {
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
    case 'image': {
      const s = toScreen(ann.x, ann.y)
      return { x: s.x, y: s.y, w: (ann.width || 200) * sx, h: (ann.height || 150) * sy }
    }
    case 'arrow': {
      const s1 = toScreen(ann.x, ann.y)
      const s2 = toScreen(ann.x + (ann.width || 0), ann.y + (ann.height || 0))
      return { x: Math.min(s1.x, s2.x), y: Math.min(s1.y, s2.y), w: Math.abs(s2.x - s1.x), h: Math.abs(s2.y - s1.y) }
    }
    case 'draw': {
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

export interface RenderAnnotationOptions {
  isPreview?: boolean
  onSelect?: () => void
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
    ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect() }, style: { cursor: 'pointer' } }
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
            if (onSelect) onSelect()
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
      const textWidth = ann.width ? ann.width * sx : Math.max(120 * sx, (ann.text?.length || 4) * displayFontSize * 0.6)
      const textHeight = ann.height ? ann.height * sy : Math.max(30 * sy, displayFontSize * 1.4)
      return (
        <foreignObject key={key} x={s.x} y={s.y} width={textWidth} height={textHeight}
          {...clickProps}
          onDoubleClick={(e) => { e.stopPropagation(); if (onSelect) onSelect(); if (onTextDoubleClick) onTextDoubleClick(ann) }}>
          <div className="leading-tight select-none" style={{ color: ann.color || '#fff', wordWrap: 'break-word', fontFamily, fontSize: displayFontSize, opacity: ann.opacity ?? 1 }}>
            {ann.text}
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
