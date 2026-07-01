import { memo, useEffect, useState } from 'react'
import { type PageDims } from './annotationRender'

import { apiFetch } from '../../lib/api'

interface SpanItem { text: string; x0: number; y0: number; x1: number; y1: number; size: number }

// Invisible, selectable text layer overlaid on the page bitmap (PDF.js-style).
// The container is pointer-events:none so empty areas fall through to the annotation
// SVG below; individual spans capture pointer events only when no tool is active.
function TextLayer({ docId, page, pageData, active }: {
  docId: string
  page: number
  pageData: PageDims
  active: boolean
}) {
  const [spans, setSpans] = useState<SpanItem[]>([])
  useEffect(() => {
    const c = new AbortController()
    apiFetch(`/pdf/spans/${docId}/${page}`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.spans) setSpans(d.spans) })
      .catch(() => {})
    return () => { c.abort(); setSpans([]) }
  }, [docId, page])
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
