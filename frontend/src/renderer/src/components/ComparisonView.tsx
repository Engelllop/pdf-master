import { useState, useEffect, useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { X, Lock, Unlock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import Tooltip from './Tooltip'

const API_BASE = 'http://localhost:8745'

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
}: {
  docId: string
  page: number
  zoom: number
  label: string
}) {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(false)
  const store = usePdfStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Try cache first
    const cached = store.getCachedPage(docId, page)
    if (cached) {
      setData(cached)
      setLoading(false)
      return
    }
    fetch(`${API_BASE}/pdf/render/${docId}/${page}?zoom=1.5`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const pageData = {
          image: `data:image/png;base64,${d.image_base64}`,
          width: d.width,
          height: d.height,
          originalWidth: d.original_width,
          originalHeight: d.original_height,
        }
        store.cachePage(docId, page, pageData)
        setData(pageData)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    return () => { cancelled = true }
  }, [docId, page])

  const scale = data ? zoom / 1.5 : 1

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-auto relative">
      <div className="px-3 py-1 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 flex items-center justify-between">
        <span>{label} — Página {page + 1}</span>
        {loading && <span className="text-blue-400 animate-pulse">Cargando...</span>}
      </div>
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
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
          <div className="text-slate-500 text-sm">Error al cargar página</div>
        )}
      </div>
    </div>
  )
}

export default function ComparisonView() {
  const store = usePdfStore()
  const { docs, activeDocId, compareDocId, compareSync, clearCompare, setCompareSync } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const compareDoc = docs.find((d) => d.doc_id === compareDocId)

  const [zoom, setZoom] = useState(1.5)
  const [leftPage, setLeftPage] = useState(activeDoc?.currentPage || 0)
  const [rightPage, setRightPage] = useState(activeDoc?.currentPage || 0)

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
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-400">
        <p>Documento de comparación no disponible</p>
        <button onClick={clearCompare} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm">Salir</button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      {/* Toolbar de comparación */}
      <div className="h-11 bg-slate-800 border-b border-slate-700 flex items-center px-3 gap-2 shrink-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">Comparar</span>

        <Tooltip content="Página anterior">
          <button onClick={goPrev} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
            <ChevronLeft size={16} />
          </button>
        </Tooltip>
        <span className="text-xs text-slate-300 w-24 text-center font-mono">
          {leftPage + 1} / {activeDoc.page_count}
        </span>
        <Tooltip content="Página siguiente">
          <button onClick={goNext} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
            <ChevronRight size={16} />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <Tooltip content="Alejar">
          <button onClick={handleZoomOut} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
            <ZoomOut size={16} />
          </button>
        </Tooltip>
        <span className="text-xs text-slate-300 w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <Tooltip content="Acercar">
          <button onClick={handleZoomIn} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
            <ZoomIn size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Ajustar">
          <button onClick={handleFit} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
            <Maximize2 size={16} />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <Tooltip content={compareSync ? 'Navegación sincronizada' : 'Navegación independiente'}>
          <button
            onClick={() => setCompareSync(!compareSync)}
            className={`p-1.5 rounded transition-colors ${compareSync ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}
          >
            {compareSync ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip content="Salir de comparación">
          <button onClick={clearCompare} className="p-1.5 rounded hover:bg-red-900/50 text-red-400 transition-colors flex items-center gap-1 text-xs">
            <X size={16} /> Salir
          </button>
        </Tooltip>
      </div>

      {/* Paneles lado a lado */}
      <div className="flex-1 flex overflow-hidden">
        <ComparePagePanel
          docId={activeDoc.doc_id}
          page={leftPage}
          zoom={zoom}
          label={activeDoc.file_name}
        />
        <div className="w-px bg-slate-700 shrink-0" />
        <ComparePagePanel
          docId={compareDoc.doc_id}
          page={rightPage}
          zoom={zoom}
          label={compareDoc.file_name}
        />
      </div>
    </div>
  )
}
