import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Lock, Unlock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, GitCompare } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'

import { API_BASE } from '../lib/api'

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
  scrollRef: React.RefObject<HTMLDivElement>
  onScroll: () => void
}) {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${API_BASE}/pdf/page-info/${docId}/${page}?zoom=1.5`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData({
          image: `${API_BASE}/pdf/page-image/${docId}/${page}?zoom=1.5`,
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
      const res = await fetch(`${API_BASE}/pdf/compare-text/${activeDoc.doc_id}/${compareDoc.doc_id}`)
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

      {/* Paneles lado a lado */}
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
    </div>
  )
}
