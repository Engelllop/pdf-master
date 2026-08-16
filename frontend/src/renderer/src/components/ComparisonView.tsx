import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Lock, Unlock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, GitCompare, Layers } from 'lucide-react'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'
import { useStoreSlice } from '../hooks/useStoreSlice'
import Tooltip from './Tooltip'

import { apiFetch } from '../lib/api'

// Cada panel ajusta SU documento al hueco disponible: los dos planos se ven al mismo
// tamaño aparente aunque las láminas midan distinto (antes el zoom multiplicaba los
// puntos de cada PDF, así que una lámina grande salía gigante y estirada).
function ComparePagePanel({
  docId,
  version,
  page,
  pageSize,
  zoom,
  label,
  scrollRef,
  onScroll,
}: {
  docId: string
  version: number
  page: number
  pageSize?: { width: number; height: number }
  zoom: number
  label: string
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [avail, setAvail] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  const pw = pageSize?.width || 612
  const ph = pageSize?.height || 792
  const fit = avail.w > 0 && avail.h > 0 ? Math.min((avail.w - 32) / pw, (avail.h - 32) / ph) : 0
  const dispW = Math.max(1, pw * fit * zoom)
  const dispH = Math.max(1, ph * fit * zoom)

  // Escala de rasterizado en pasos de 0.25 para no re-renderizar en cada clic de zoom
  const dpr = window.devicePixelRatio || 1
  const renderScale = fit > 0
    ? Math.min(4, Math.max(0.5, Math.ceil(((dispW / pw) * dpr) / 0.25) * 0.25))
    : 0

  useEffect(() => {
    if (renderScale <= 0) return
    let cancelled = false
    setLoading(true)
    setError(false)
    renderPdfPage(docId, version, page, renderScale)
      .then((r) => {
        if (cancelled) { revokePageUrl(r.url); return }
        setUrl((prev) => { revokePageUrl(prev ?? undefined); urlRef.current = r.url; return r.url })
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [docId, version, page, renderScale])

  useEffect(() => () => { revokePageUrl(urlRef.current ?? undefined) }, [])

  return (
    <div className={`flex-1 flex flex-col min-w-0 bg-surface`}>
      <div className={`px-3 py-1.5 border-b text-mini flex items-center justify-between shrink-0 bg-panel border-border text-muted`}>
        <span className="truncate" title={label}>{label} — Pág. {page + 1}</span>
        {loading && <span className="text-muted animate-pulse shrink-0 ml-2">Cargando…</span>}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        <div className="min-h-full flex items-start justify-center p-4">
          {error ? (
            <div className={`self-center text-base text-muted`}>Error al cargar página</div>
          ) : (
            <div className="rounded shadow-lg bg-white" style={{ width: dispW, height: dispH }}>
              {url && (
                <img
                  src={url}
                  alt={`Página ${page + 1}`}
                  className="w-full h-full block rounded"
                  draggable={false}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const OVERLAY_SCALE = 2

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// Colorea las líneas de una página (negro sobre blanco) con 'screen':
// screen(negro, tinte) = tinte, screen(blanco, tinte) = blanco.
function tintPage(img: HTMLImageElement, w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  return c
}

function CompareOverlayPanel({
  docA, versionA, pageA, docB, versionB, pageB, zoom, mix = 0.5,
}: {
  docA: string; versionA: number; pageA: number
  docB: string; versionB: number; pageB: number
  zoom: number
  mix?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      const a = await renderPdfPage(docA, versionA, pageA, OVERLAY_SCALE)
      const b = await renderPdfPage(docB, versionB, pageB, OVERLAY_SCALE)
      try {
        if (cancelled) return
        const [imgA, imgB] = await Promise.all([loadImage(a.url), loadImage(b.url)])
        if (cancelled || !canvasRef.current) return
        // Ambas revisiones al mismo ancho (los planos suelen coincidir; si no, se escala B)
        const w = imgA.width
        const h = Math.max(imgA.height, Math.round(imgB.height * (w / imgB.width)))
        const canvas = canvasRef.current
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        const tintedA = tintPage(imgA, w, Math.round(imgA.height * (w / imgA.width)), '#ff2222')
        const tintedB = tintPage(imgB, w, Math.round(imgB.height * (w / imgB.width)), '#2244ff')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(tintedA, 0, 0)
        ctx.globalAlpha = mix
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(tintedB, 0, 0)
        ctx.globalAlpha = 1
        setDims({ w, h })
      } finally {
        revokePageUrl(a.url)
        revokePageUrl(b.url)
        if (!cancelled) setLoading(false)
      }
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [docA, versionA, pageA, docB, versionB, pageB, mix])

  // Mismo criterio que los paneles lado a lado: zoom 1 = la lámina cabe entera
  const fit = dims && avail.w > 0
    ? Math.min((avail.w - 32) / (dims.w / OVERLAY_SCALE), (avail.h - 32) / (dims.h / OVERLAY_SCALE))
    : 0

  return (
    <div ref={hostRef} className={`flex-1 overflow-auto bg-surface`}>
      <div className="min-h-full flex items-start justify-center p-4">
        {error ? (
          <div className={`self-center text-base text-muted`}>Error al componer el overlay</div>
        ) : (
          <div className="relative">
            {loading && (
              <div className={`absolute inset-0 flex items-center justify-center text-mini text-muted`}>Componiendo…</div>
            )}
            <canvas ref={canvasRef} className="rounded shadow-lg bg-white"
              style={dims && fit > 0
                ? { width: (dims.w / OVERLAY_SCALE) * fit * zoom, height: (dims.h / OVERLAY_SCALE) * fit * zoom }
                : undefined} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function ComparisonView() {
  const { docs, activeDocId, compareDocId, compareSync, clearCompare, setCompareSync, compareZoom, setCompareZoom } = useStoreSlice(
    'docs', 'activeDocId', 'compareDocId', 'compareSync', 'clearCompare', 'setCompareSync',
    'compareZoom', 'setCompareZoom',
  )

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const compareDoc = docs.find((d) => d.doc_id === compareDocId)

  // Un solo zoom: el mismo valor que mueven los botones de la cinta mientras se compara
  const zoom = compareZoom
  const [leftPage, setLeftPage] = useState(activeDoc?.currentPage || 0)
  const [rightPage, setRightPage] = useState(activeDoc?.currentPage || 0)
  const [diff, setDiff] = useState<{ page: number; added: string; removed: string }[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [overlayMode, setOverlayMode] = useState(false)
  const [overlayMix, setOverlayMix] = useState(0.5)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)

  // Con el candado activo, mover un panel arrastra al otro. El guard por diferencia
  // (>1px) corta el bucle de eco: al igualar el destino, su propio evento scroll ya
  // coincide y no reescribe el origen.
  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (!compareSync) return
    const from = source === 'left' ? leftScrollRef.current : rightScrollRef.current
    const to = source === 'left' ? rightScrollRef.current : leftScrollRef.current
    if (!from || !to) return
    if (Math.abs(to.scrollTop - from.scrollTop) > 1) to.scrollTop = from.scrollTop
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) to.scrollLeft = from.scrollLeft
  }, [compareSync])

  // Al activar el candado, alinear de inmediato el panel derecho con el izquierdo.
  useEffect(() => {
    if (!compareSync) return
    const l = leftScrollRef.current, r = rightScrollRef.current
    if (l && r) { r.scrollTop = l.scrollTop; r.scrollLeft = l.scrollLeft }
  }, [compareSync])

  const runDiff = async () => {
    if (!activeDoc || !compareDoc) return
    if (diff) { setDiff(null); return }
    setDiffLoading(true)
    try {
      const res = await apiFetch(`/pdf/compare-text/${activeDoc.doc_id}/${compareDoc.doc_id}`)
      const data = await res.json()
      setDiff(data.diffs || [])
    } catch { setDiff([]) } finally { setDiffLoading(false) }
  }

  // Sync pages when sync is enabled
  useEffect(() => {
    if (compareSync && activeDoc) {
      setLeftPage(activeDoc.currentPage)
      setRightPage(activeDoc.currentPage)
    }
  }, [compareSync, activeDoc?.currentPage])

  const goPrev = useCallback(() => {
    setLeftPage((p) => Math.max(0, p - 1))
    if (compareSync) setRightPage((p) => Math.max(0, p - 1))
  }, [compareSync])

  const goNext = useCallback(() => {
    const maxL = (activeDoc?.page_count || 1) - 1
    const maxR = (compareDoc?.page_count || 1) - 1
    setLeftPage((p) => Math.min(maxL, p + 1))
    if (compareSync) {
      setRightPage((p) => Math.min(maxR, p + 1))
    }
  }, [compareSync, activeDoc?.page_count, compareDoc?.page_count])

  const handleZoomIn = () => setCompareZoom(zoom + 0.2)
  const handleZoomOut = () => setCompareZoom(zoom - 0.2)
  const handleFit = () => setCompareZoom(1)

  if (!activeDoc || !compareDoc) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center bg-surface text-muted`}>
        <p>Documento de comparación no disponible</p>
        <button onClick={clearCompare} className="mt-2 px-3 py-1 bg-accent text-toolbar rounded text-base">Salir</button>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col bg-surface`}>
      {/* Toolbar de comparación */}
      <div className={`h-11 border-b flex items-center px-3 gap-2 shrink-0 bg-panel border-border`}>
        <span className={`text-mini font-semibold uppercase tracking-wider mr-2 text-muted`}>Comparar</span>

        <Tooltip content="Página anterior">
          <button onClick={goPrev} className={`p-1.5 rounded transition-colors hover:bg-hover text-muted`}>
            <ChevronLeft size={16} />
          </button>
        </Tooltip>
        <span className={`text-mini w-24 text-center font-mono text-fg`}>
          {leftPage + 1} / {activeDoc.page_count}
        </span>
        <Tooltip content="Página siguiente">
          <button onClick={goNext} className={`p-1.5 rounded transition-colors hover:bg-hover text-muted`}>
            <ChevronRight size={16} />
          </button>
        </Tooltip>

        <div className={`w-px h-5 mx-1 bg-border`} />

        <Tooltip content="Alejar">
          <button onClick={handleZoomOut} className={`p-1.5 rounded transition-colors hover:bg-hover text-muted`}>
            <ZoomOut size={16} />
          </button>
        </Tooltip>
        <span className={`text-mini w-12 text-center font-mono text-fg`}>{Math.round(zoom * 100)}%</span>
        <Tooltip content="Acercar">
          <button onClick={handleZoomIn} className={`p-1.5 rounded transition-colors hover:bg-hover text-muted`}>
            <ZoomIn size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Ajustar la lámina al panel">
          <button onClick={handleFit} className={`p-1.5 rounded transition-colors ${Math.abs(zoom - 1) < 0.001 ? 'bg-accent text-toolbar' : 'hover:bg-hover text-muted'}`}>
            <Maximize2 size={16} />
          </button>
        </Tooltip>

        <div className={`w-px h-5 mx-1 bg-border`} />

        <Tooltip content={compareSync ? 'Navegación sincronizada' : 'Navegación independiente'}>
          <button
            onClick={() => setCompareSync(!compareSync)}
            className={`p-1.5 rounded transition-colors ${compareSync ? 'bg-accent text-toolbar' : 'hover:bg-hover text-muted'}`}
          >
            {compareSync ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </Tooltip>

        <Tooltip content={diff ? 'Ocultar diferencias de texto' : 'Comparar texto'}>
          <button onClick={runDiff} className={`p-1.5 rounded transition-colors ${diff ? 'bg-accent text-toolbar' : 'hover:bg-hover text-muted'}`}>
            <GitCompare size={16} />
          </button>
        </Tooltip>

        <Tooltip content={overlayMode ? 'Volver a lado a lado' : 'Overlay de revisiones (actual en rojo, comparado en azul)'}>
          <button onClick={() => setOverlayMode((v) => !v)}
            className={`p-1.5 rounded transition-colors ${overlayMode ? 'bg-accent text-toolbar' : 'hover:bg-hover text-muted'}`}>
            <Layers size={16} />
          </button>
        </Tooltip>

        {overlayMode && (
          <span className={`text-mini flex items-center gap-2 ml-1 text-muted`}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ff2222' }} />{activeDoc.file_name}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#2244ff' }} />{compareDoc.file_name}</span>
            <label className="flex items-center gap-1" title="Opacidad del overlay">
              Mezcla
              <input type="range" min={0} max={100} value={Math.round(overlayMix * 100)}
                onChange={(e) => setOverlayMix(Number(e.target.value) / 100)}
                className="w-20" />
            </label>
          </span>
        )}

        <div className="flex-1" />

        <Tooltip content="Salir de comparación">
          <button onClick={clearCompare} className="p-1.5 rounded transition-colors flex items-center gap-1 text-mini text-danger hover:bg-danger/10">
            <X size={16} /> Salir
          </button>
        </Tooltip>
      </div>

      {/* Panel de diferencias de texto */}
      {(diff !== null || diffLoading) && (
        <div className={`max-h-48 overflow-y-auto border-b text-mini bg-panel border-border`}>
          {diffLoading ? (
            <div className={`p-2 text-muted`}>Comparando texto…</div>
          ) : diff && diff.length > 0 ? (
            <>
              <div className={`px-3 py-1 font-semibold text-fg`}>{diff.length} página(s) con cambios</div>
              {diff.map((d) => (
                <button key={d.page} onClick={() => { setLeftPage(d.page); setRightPage(d.page) }}
                  className={`block w-full text-left px-3 py-1.5 border-t border-border hover:bg-hover`}>
                  <span className={`font-mono mr-2 text-muted`}>Pág {d.page + 1}</span>
                  {d.removed && <span className="text-danger line-through mr-2">{d.removed}</span>}
                  {d.added && <span className="text-success">{d.added}</span>}
                </button>
              ))}
            </>
          ) : (
            <div className={`p-2 text-muted`}>Sin diferencias de texto</div>
          )}
        </div>
      )}

      {/* Overlay compuesto o paneles lado a lado */}
      {overlayMode ? (
        <CompareOverlayPanel
          docA={activeDoc.doc_id} versionA={activeDoc.docVersion} pageA={leftPage}
          docB={compareDoc.doc_id} versionB={compareDoc.docVersion} pageB={rightPage}
          zoom={zoom} mix={overlayMix}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <ComparePagePanel
            docId={activeDoc.doc_id}
            version={activeDoc.docVersion}
            page={leftPage}
            pageSize={activeDoc.page_sizes[leftPage]}
            zoom={zoom}
            label={activeDoc.file_name}
            scrollRef={leftScrollRef}
            onScroll={() => syncScroll('left')}
          />
          <div className={`w-px shrink-0 bg-border`} />
          <ComparePagePanel
            docId={compareDoc.doc_id}
            version={compareDoc.docVersion}
            page={rightPage}
            pageSize={compareDoc.page_sizes[rightPage]}
            zoom={zoom}
            label={compareDoc.file_name}
            scrollRef={rightScrollRef}
            onScroll={() => syncScroll('right')}
          />
        </div>
      )}
    </div>
  )
}
