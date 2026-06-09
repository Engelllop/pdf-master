import { useEffect, useRef, useState } from 'react'

const API_BASE = 'http://localhost:8745'

interface PageGeom {
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

// Crisp deep-zoom overlay. The base page bitmap is rendered at a capped resolution
// (render zoom ≤ 3) and the viewer upscales it with CSS, which blurs dense CAD/plan
// detail at high zoom. When the CSS upscale factor exceeds 1, we render just the
// visible sub-rectangle of the page at the true target zoom on the backend and lay
// it over the base image (in the same scaled coordinate space), so the part the user
// is actually looking at stays sharp without rasterizing the whole page at huge size.
export default function DetailTile({
  docId, page, pageData, zoom, version, containerRef, scrollKey,
}: {
  docId: string
  page: number
  pageData: PageGeom
  zoom: number
  version: number
  containerRef: React.RefObject<HTMLDivElement>
  scrollKey: string
}) {
  const [tile, setTile] = useState<{ url: string; left: number; top: number; w: number; h: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bitmapScale = pageData.width / pageData.originalWidth // e.g. 3
  const cssScale = zoom / bitmapScale // > 1 means the base bitmap is being upscaled (blurry)

  useEffect(() => {
    if (cssScale <= 1.1) { setTile(null); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const container = containerRef.current
      const wrapper = container?.querySelector('[data-page-wrapper="left"]') as HTMLElement | null
      if (!container || !wrapper) return
      const cRect = container.getBoundingClientRect()
      const wRect = wrapper.getBoundingClientRect()
      // Visible part of the page in wrapper-local display px
      let visLeft = Math.max(0, cRect.left - wRect.left)
      let visTop = Math.max(0, cRect.top - wRect.top)
      let visRight = Math.min(wRect.width, cRect.right - wRect.left)
      let visBottom = Math.min(wRect.height, cRect.bottom - wRect.top)
      if (visRight <= visLeft || visBottom <= visTop) { setTile(null); return }
      // Pad by ~20% of the viewport so small scrolls don't refetch constantly
      const padX = (visRight - visLeft) * 0.2
      const padY = (visBottom - visTop) * 0.2
      visLeft = Math.max(0, visLeft - padX)
      visTop = Math.max(0, visTop - padY)
      visRight = Math.min(wRect.width, visRight + padX)
      visBottom = Math.min(wRect.height, visBottom + padY)
      // Display px -> PDF points (wrapper width spans the full page at the current zoom)
      const toPdf = pageData.originalWidth / wRect.width
      const x0 = visLeft * toPdf
      const y0 = visTop * toPdf
      const x1 = visRight * toPdf
      const y1 = visBottom * toPdf
      const tzoom = Math.min(zoom * (window.devicePixelRatio || 1), 8)
      const url = `${API_BASE}/pdf/tile/${docId}/${page}?x0=${x0.toFixed(2)}&y0=${y0.toFixed(2)}&x1=${x1.toFixed(2)}&y1=${y1.toFixed(2)}&zoom=${tzoom.toFixed(2)}&v=${version}`
      setTile({
        url,
        left: x0 * bitmapScale,
        top: y0 * bitmapScale,
        w: (x1 - x0) * bitmapScale,
        h: (y1 - y0) * bitmapScale,
      })
    }, 180)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [docId, page, zoom, version, scrollKey, cssScale, bitmapScale, pageData.originalWidth, containerRef])

  if (!tile) return null
  return (
    <img src={tile.url} alt="" draggable={false}
      style={{ position: 'absolute', left: tile.left, top: tile.top, width: tile.w, height: tile.h, zIndex: 1, pointerEvents: 'none' }} />
  )
}
