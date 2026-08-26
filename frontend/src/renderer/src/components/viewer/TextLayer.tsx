import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    getSpans(docId, page, version).then((s) => { if (alive) setSpans(s) })
    return () => { alive = false; setSpans([]) }
  }, [docId, page, version])
  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight

  // La fuente del PDF no es la del navegador, así que el ancho natural del texto
  // nunca coincide con el del span original: sin corregirlo el texto se desborda y
  // la selección tapa lo que no es (el usuario veía "REVISAR" gigante y traslapado).
  // Igual que PDF.js: se mide el ancho real y se ajusta con scaleX.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Compensa cualquier transform de un ancestro para medir en px de layout
    const hostScale = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const target = Number(child.dataset.w)
      child.style.transform = ''
      if (!target) continue
      const natural = child.getBoundingClientRect().width / (hostScale || 1)
      if (natural > 0.5) child.style.transform = `scaleX(${target / natural})`
    }
  }, [spans, sx, sy])

  return (
    // fontSize/lineHeight 0: los <br> que separan renglones son lo único en flujo
    // (los spans van absolutos), así que sus cajas de línea quedan a altura cero.
    <div ref={containerRef} className="absolute top-0 left-0 pdf-text-layer" style={{ width: pageData.width, height: pageData.height, pointerEvents: 'none', zIndex: 22, userSelect: 'text', fontSize: 0, lineHeight: 0 }}>
      {spans.map((s, i) => {
        const h = (s.y1 - s.y0) * sy
        // Los spans de MuPDF son trozos de renglón. Sin un salto entre renglones,
        // copiar varias líneas devolvía todo pegado: "PLANTA BAJAESCALA 1:100".
        const prev = i > 0 ? spans[i - 1] : null
        const saltoDeLinea = !!prev && Math.abs(s.y0 - prev.y0) > Math.max(1, (prev.y1 - prev.y0) * 0.5)
        return (
          <Fragment key={i}>
          {saltoDeLinea && <br role="presentation" />}
          <span data-w={(s.x1 - s.x0) * sx} style={{
            position: 'absolute',
            left: s.x0 * sx,
            top: s.y0 * sy,
            height: h,
            fontSize: (s.size || (s.y1 - s.y0)) * sy,
            lineHeight: `${h}px`,
            color: 'transparent',
            whiteSpace: 'pre',
            transformOrigin: '0 0',
            cursor: 'text',
            pointerEvents: active ? 'auto' : 'none',
          }}>{s.text}</span>
          </Fragment>
        )
      })}
    </div>
  )
}

export default memo(TextLayer)
