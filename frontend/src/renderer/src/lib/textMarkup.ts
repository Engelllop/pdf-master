import { type SpanItem } from './spans'

export interface LineRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface SelRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function intersects(s: SpanItem, r: SelRect): boolean {
  return s.x1 > r.x0 && s.x0 < r.x1 && s.y1 > r.y0 && s.y0 < r.y1
}

// Agrupa los spans que toca el rectángulo de selección en líneas de texto (solape
// vertical > 50%) y devuelve un rect por línea, recortado horizontalmente a la
// selección. Es lo que ancla resaltado/subrayado/tachado al texto real (estilo
// Acrobat) en vez de dejar un rect dibujado a ojo.
export function computeLineRects(
  spans: SpanItem[],
  sel: { x: number; y: number; width: number; height: number },
): LineRect[] {
  const r: SelRect = {
    x0: Math.min(sel.x, sel.x + sel.width),
    y0: Math.min(sel.y, sel.y + sel.height),
    x1: Math.max(sel.x, sel.x + sel.width),
    y1: Math.max(sel.y, sel.y + sel.height),
  }
  const hits = spans.filter((s) => s.text.trim() && intersects(s, r))
  if (hits.length === 0) return []

  hits.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const lines: Array<{ y0: number; y1: number; x0: number; x1: number }> = []
  for (const s of hits) {
    const cx0 = Math.max(s.x0, r.x0)
    const cx1 = Math.min(s.x1, r.x1)
    if (cx1 - cx0 < 1) continue
    const line = lines.find((l) => {
      const overlap = Math.min(l.y1, s.y1) - Math.max(l.y0, s.y0)
      return overlap > 0.5 * Math.min(l.y1 - l.y0, s.y1 - s.y0)
    })
    if (line) {
      line.y0 = Math.min(line.y0, s.y0)
      line.y1 = Math.max(line.y1, s.y1)
      line.x0 = Math.min(line.x0, cx0)
      line.x1 = Math.max(line.x1, cx1)
    } else {
      lines.push({ y0: s.y0, y1: s.y1, x0: cx0, x1: cx1 })
    }
  }
  return lines
    .filter((l) => l.x1 - l.x0 >= 1 && l.y1 - l.y0 >= 1)
    .sort((a, b) => a.y0 - b.y0)
}
