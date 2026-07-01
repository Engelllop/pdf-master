import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Lock, Unlock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, GitCompare, Layers } from 'lucide-react'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'
import { useStoreSlice } from '../hooks/useStoreSlice'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'

import { apiFetch, apiUrl } from '../lib/api'

interface PageData {
  image: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

function ComparePagePanel({
  docId,
  page,
  zoom,
  label,
  scrollRef,
  onScroll,
}: {
  docId: string
  page: number
  zoom: number
  label: string
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}) {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/pdf/page-info/${docId}/${page}?zoom=1.5`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData({
          image: apiUrl(`/pdf/page-image/${docId}/${page}?zoom=1.5`),
          width: d.width,
          height: d.height,
          originalWidth: d.original_width,
          originalHeight: d.original_height,
        })
      })
      .catch(() => setData(null))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [docId, page])

  const scale = data ? zoom / (data.width / data.originalWidth) : 1

  const tc = useThemeClasses()
  return (
    <div className={`flex-1 flex flex-col min-w-0 ${tc('bg-slate-900', 'bg-gray-100')}`}>
      <div className={`px-3 py-1.5 border-b text-xs flex items-center justify-between shrink-0 ${tc('bg-slate-800 border-slate-700 text-slate-300', 'bg-white border-gray-300 text-gray-600')}`}>
        <span className="truncate" title={label}>{label} — Pág. {page + 1}</span>
        {loading && <span className="text-blue-400 animate-pulse shrink-0 ml-2">Cargando…</span>}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        <div className="min-h-full flex items-start justify-center p-4">
          {data ? (
            <img
              src={data.image}
              alt={`Página ${page + 1}`}
              className="rounded shadow-lg bg-white"
              style={{
                width: data.width * scale,
                height: data.height * scale,
              }}
              draggable={false}
            />
          ) : (
            <div className={`self-center text-sm ${tc('text-slate-500', 'text-gray-500')}`}>{loading ? '' : 'Error al cargar página'}</div>
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
  docA, versionA, pageA, docB, versionB, pageB, zoom,
}: {
  docA: string; versionA: number; pageA: number
  docB: string; versionB: number; pageB: number
  zoom: number
}) {
  const tc = useThemeClasses()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

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
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(tintedB, 0, 0)
        setDims({ w, h })
      } finally {
        revokePageUrl(a.url)
        revokePageUrl(b.url)
        if (!cancelled) setLoading(false)
      }
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [docA, versionA, pageA, docB, versionB, pageB])

  return (
    <div className={`flex-1 overflow-auto ${tc('bg-slate-900', 'bg-gray-100')}`}>
      <div className="min-h-full flex items-start justify-center p-4">
        {error ? (
          <div className={`self-center text-sm ${tc('text-slate-500', 'text-gray-500')}`}>Error al componer el overlay</div>
        ) : (
          <div className="relative">
            {loading && (
              <div className={`absolute inset-0 flex items-center justify-center text-xs ${tc('text-slate-400', 'text-gray-500')}`}>Componiendo…</div>
            )}
            <canvas ref={canvasRef} className="rounded shadow-lg bg-white"
              style={dims ? { width: (dims.w / OVERLAY_SCALE) * zoom, height: (dims.h / OVERLAY_SCALE) * zoom } : undefined} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function ComparisonView() {
  const tc = useThemeClasses()
  const { docs, activeDocId, compareDocId, compareSync, clearCompare, setCompareSync } = useStoreSlice(
    'docs', 'activeDocId', 'compareDocId', 'compareSync', 'clearCompare', 'setCompareSync',
  )

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const compareDoc = docs.find((d) => d.doc_id === compareDocId)

  const [zoom, setZoom] = useState(1.0)
  const [leftPage, setLeftPage] = useState(activeDoc?.currentPage || 0)
  const [rightPage, setRightPage] = useState(activeDoc?.currentPage || 0)
  const [diff, setDiff] = useState<{ page: number; added: string; removed: string }[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [overlayMode, setOverlayMode] = useState(false)

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

  const handleZoomIn = () => setZoom((z) => Math.min(5, z + 0.2))
  const handleZoomOut = () => setZoom((z) => Math.max(0.3, z - 0.2))
  const handleFit = () => setZoom(1.5)

  if (!activeDoc || !compareDoc) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center ${tc('bg-slate-900 text-slate-400', 'bg-gray-100 text-gray-500')}`}>
        <p>Documento de comparación no disponible</p>
        <button onClick={clearCompare} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm">Salir</button>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col ${tc('bg-slate-900', 'bg-gray-100')}`}>
      {/* Toolbar de comparación */}
      <div className={`h-11 border-b flex items-center px-3 gap-2 shrink-0 ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
        <span className={`text-xs font-semibold uppercase tracking-wider mr-2 ${tc('text-slate-400', 'text-gray-500')}`}>Comparar</span>

        <Tooltip content="Página anterior">
          <button onClick={goPrev} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <ChevronLeft size={16} />
          </button>
        </Tooltip>
        <span className={`text-xs w-24 text-center font-mono ${tc('text-slate-300', 'text-gray-700')}`}>
          {leftPage + 1} / {activeDoc.page_count}
        </span>
        <Tooltip content="Página siguiente">
          <button onClick={goNext} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <ChevronRight size={16} />
          </button>
        </Tooltip>

        <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

        <Tooltip content="Alejar">
          <button onClick={handleZoomOut} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <ZoomOut size={16} />
          </button>
        </Tooltip>
        <span className={`text-xs w-12 text-center font-mono ${tc('text-slate-300', 'text-gray-700')}`}>{Math.round(zoom * 100)}%</span>
        <Tooltip content="Acercar">
          <button onClick={handleZoomIn} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <ZoomIn size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Ajustar">
          <button onClick={handleFit} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <Maximize2 size={16} />
          </button>
        </Tooltip>

        <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

        <Tooltip content={compareSync ? 'Navegación sincronizada' : 'Navegación independiente'}>
          <button
            onClick={() => setCompareSync(!compareSync)}
            className={`p-1.5 rounded transition-colors ${compareSync ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}
          >
            {compareSync ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </Tooltip>

        <Tooltip content={diff ? 'Ocultar diferencias de texto' : 'Comparar texto'}>
          <button onClick={runDiff} className={`p-1.5 rounded transition-colors ${diff ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <GitCompare size={16} />
          </button>
        </Tooltip>

        <Tooltip content={overlayMode ? 'Volver a lado a lado' : 'Overlay de revisiones (actual en rojo, comparado en azul)'}>
          <button onClick={() => setOverlayMode((v) => !v)}
            className={`p-1.5 rounded transition-colors ${overlayMode ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-100 text-gray-600')}`}>
            <Layers size={16} />
          </button>
        </Tooltip>

        {overlayMode && (
          <span className={`text-xs flex items-center gap-2 ml-1 ${tc('text-slate-400', 'text-gray-500')}`}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ff2222' }} />{activeDoc.file_name}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#2244ff' }} />{compareDoc.file_name}</span>
          </span>
        )}

        <div className="flex-1" />

        <Tooltip content="Salir de comparación">
          <button onClick={clearCompare} className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs text-red-400 ${tc('hover:bg-red-900/50', 'hover:bg-red-50')}`}>
            <X size={16} /> Salir
          </button>
        </Tooltip>
      </div>

      {/* Panel de diferencias de texto */}
      {(diff !== null || diffLoading) && (
        <div className={`max-h-48 overflow-y-auto border-b text-xs ${tc('bg-slate-800 border-slate-700', 'bg-gray-50 border-gray-300')}`}>
          {diffLoading ? (
            <div className={`p-2 ${tc('text-slate-400', 'text-gray-500')}`}>Comparando texto…</div>
          ) : diff && diff.length > 0 ? (
            <>
              <div className={`px-3 py-1 font-semibold ${tc('text-slate-300', 'text-gray-700')}`}>{diff.length} página(s) con cambios</div>
              {diff.map((d) => (
                <button key={d.page} onClick={() => { setLeftPage(d.page); setRightPage(d.page) }}
                  className={`block w-full text-left px-3 py-1.5 border-t ${tc('border-slate-700/50 hover:bg-slate-700/40', 'border-gray-200 hover:bg-gray-100')}`}>
                  <span className={`font-mono mr-2 ${tc('text-slate-400', 'text-gray-500')}`}>Pág {d.page + 1}</span>
                  {d.removed && <span className="text-red-400 line-through mr-2">{d.removed}</span>}
                  {d.added && <span className="text-emerald-400">{d.added}</span>}
                </button>
              ))}
            </>
          ) : (
            <div className={`p-2 ${tc('text-slate-400', 'text-gray-500')}`}>Sin diferencias de texto</div>
          )}
        </div>
      )}

      {/* Overlay compuesto o paneles lado a lado */}
      {overlayMode ? (
        <CompareOverlayPanel
          docA={activeDoc.doc_id} versionA={activeDoc.docVersion} pageA={leftPage}
          docB={compareDoc.doc_id} versionB={compareDoc.docVersion} pageB={rightPage}
          zoom={zoom}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <ComparePagePanel
            docId={activeDoc.doc_id}
            page={leftPage}
            zoom={zoom}
            label={activeDoc.file_name}
            scrollRef={leftScrollRef}
            onScroll={() => syncScroll('left')}
          />
          <div className={`w-px shrink-0 ${tc('bg-slate-700', 'bg-gray-300')}`} />
          <ComparePagePanel
            docId={compareDoc.doc_id}
            page={rightPage}
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
