import { memo, useEffect, useState } from 'react'
import { type PageDims } from './annotationRender'
import { getSpans, type SpanItem } from '../../lib/spans'

// Invisible, selectable text layer overlaid on the page bitmap (PDF.js-style).
// The container is pointer-events:none so empty areas fall through to the annotation
// SVG below; individual spans capture pointer events only when no tool is active.
function TextLayer({ docId, page, version = 0, pageData, active }: {
  docId: string
  page: number
  version?: number
  pageData: PageDims
  active: boolean
}) {
  const [spans, setSpans] = useState<SpanItem[]>([])
  useEffect(() => {
    let alive = true
    getSpans(docId, page, version).then((s) => { if (alive) setSpans(s) })
    return () => { alive = false; setSpans([]) }
  }, [docId, page, version])
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  return (
    <div className="absolute top-0 left-0" style={{ width: pageData.width, height: pageData.height, pointerEvents: 'none', zIndex: 22, userSelect: 'text' }}>
      {spans.map((s, i) => {
        const h = (s.y1 - s.y0) * sy
        return (
          <span key={i} style={{
            position: 'absolute',
            left: s.x0 * sx,
            top: s.y0 * sy,
            width: (s.x1 - s.x0) * sx,
            height: h,
            fontSize: h * 0.82,
            lineHeight: `${h}px`,
            color: 'transparent',
            whiteSpace: 'pre',
            overflow: 'hidden',
            cursor: 'text',
            pointerEvents: active ? 'auto' : 'none',
          }}>{s.text}</span>
        )
      })}
    </div>
  )
}

export default memo(TextLayer)
