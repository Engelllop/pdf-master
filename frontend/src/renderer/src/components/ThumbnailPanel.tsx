import { useEffect, useRef, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { PanelLeftClose, FileText, BookOpen, Bookmark, Trash2, MessageSquare, RotateCw, RotateCcw, Scissors, X, Search, Copy, FilePlus2 } from 'lucide-react'
import type { OutlineItem } from '../store/usePdfStore'
import { useThemeClasses } from '../hooks/useThemeClasses'

const API_BASE = 'http://localhost:8745'

function OutlineTree({ items, depth = 0, onJump, tc }: { items: OutlineItem[]; depth?: number; onJump: (page: number) => void; tc: (d: string, l: string) => string }) {
  return (
    <>
      {items.map((item, idx) => (
        <div key={idx}>
          <button
            onClick={() => onJump(item.page)}
            className={`w-full text-left text-xs rounded px-2 py-1 transition-colors truncate ${tc('text-slate-300 hover:text-white hover:bg-slate-700', 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={item.title}
          >
            {item.title}
          </button>
          {item.children && item.children.length > 0 && (
            <OutlineTree items={item.children} depth={depth + 1} onJump={onJump} tc={tc} />
          )}
        </div>
      ))}
    </>
  )
}

export default function ThumbnailPanel() {
  const tc = useThemeClasses()
  const store = useStoreSlice(
    'docs', 'activeDocId', 'sidebarOpen', 'toggleSidebar', 'setPage', 'addThumbnail',
    'bookmarks', 'removeBookmark', 'reorderPages', 'showToast', 'setDocDirty',
    'incrementDocVersion', 'viewerScroll', 'updateDocPageCount', 'goToSearchResult',
    'deleteAnnotation', 'invalidatePageCache', 'invalidateThumbnails', 'selectAnnotation',
  )
  const { docs, activeDocId, sidebarOpen, toggleSidebar, setPage, addThumbnail, bookmarks, removeBookmark, reorderPages, showToast, setDocDirty, incrementDocVersion, viewerScroll, updateDocPageCount, goToSearchResult } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'pages' | 'outline' | 'bookmarks' | 'annotations' | 'search'>('pages')

  // Jump to the search results tab automatically when a new search produces matches.
  useEffect(() => {
    if (activeDoc && activeDoc.searchResults.length > 0) setTab('search')
  }, [activeDoc?.doc_id, activeDoc?.searchResults.length])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())
  const [lastSelectedPage, setLastSelectedPage] = useState<number | null>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 })

  // Virtual scrolling
  useEffect(() => {
    if (!scrollRef.current || !activeDoc) return
    const el = scrollRef.current
    const THUMB_EST_HEIGHT = 280
    const BUFFER = 10
    const updateRange = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / THUMB_EST_HEIGHT) - BUFFER)
      const end = Math.min(activeDoc.page_count, Math.ceil((el.scrollTop + el.clientHeight) / THUMB_EST_HEIGHT) + BUFFER)
      setVisibleRange({ start, end })
    }
    updateRange()
    el.addEventListener('scroll', updateRange, { passive: true })
    return () => el.removeEventListener('scroll', updateRange)
  }, [activeDoc?.page_count, tab])

  useEffect(() => {
    if (!activeDoc || !sidebarOpen) return
    const loadThumbs = async () => {
      const start = Math.max(0, visibleRange.start)
      const end = Math.min(activeDoc.page_count, visibleRange.end)
      const pagesToLoad: number[] = []
      for (let i = start; i < end; i++) {
        if (!activeDoc.thumbnails.has(i)) pagesToLoad.push(i)
      }
      if (pagesToLoad.length === 0) return
      const batchSize = 4
      for (let i = 0; i < pagesToLoad.length; i += batchSize) {
        const batch = pagesToLoad.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (pageNum) => {
            try {
              const res = await fetch(`${API_BASE}/pdf/thumbnail/${activeDoc.doc_id}/${pageNum}`)
              if (res.ok) {
                const data = await res.json()
                addThumbnail(activeDoc.doc_id, pageNum, data.image_base64)
              }
            } catch (e) {
              console.error('Error loading thumbnail', e)
            }
          })
        )
      }
    }
    loadThumbs()
  }, [activeDoc, sidebarOpen, visibleRange.start, visibleRange.end])

  useEffect(() => {
    if (!scrollRef.current || !activeDoc) return
    const el = scrollRef.current.querySelector(`[data-page="${activeDoc.currentPage}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeDoc?.currentPage])

  const handleThumbClick = (pageNum: number, e: React.MouseEvent) => {
    if (!activeDoc) return
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) {
      setSelectedPages((prev) => {
        const next = new Set(prev)
        if (next.has(pageNum)) next.delete(pageNum)
        else next.add(pageNum)
        return next
      })
      setLastSelectedPage(pageNum)
    } else if (e.shiftKey && lastSelectedPage !== null) {
      const start = Math.min(lastSelectedPage, pageNum)
      const end = Math.max(lastSelectedPage, pageNum)
      setSelectedPages((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) next.add(i)
        return next
      })
      setLastSelectedPage(pageNum)
    } else {
      setSelectedPages(new Set([pageNum]))
      setLastSelectedPage(pageNum)
      setPage(activeDoc.doc_id, pageNum)
    }
  }

  const handleDeleteSelected = async () => {
    if (!activeDoc || selectedPages.size === 0) return
    if (!confirm(`Eliminar ${selectedPages.size} pagina(s)?`)) return
    const pages = Array.from(selectedPages).sort((a, b) => b - a)
    try {
      const res = await fetch(`${API_BASE}/pdf/delete-pages/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          updateDocPageCount(activeDoc.doc_id, Math.max(1, activeDoc.page_count - selectedPages.size))
          if (activeDoc.currentPage >= activeDoc.page_count - selectedPages.size) {
            setPage(activeDoc.doc_id, Math.max(0, activeDoc.page_count - selectedPages.size - 1))
          }
          setDocDirty(activeDoc.doc_id, true)
          store.invalidatePageCache(activeDoc.doc_id)
          store.invalidateThumbnails(activeDoc.doc_id)
          setSelectedPages(new Set())
          showToast(`${selectedPages.size} pagina(s) eliminada(s)`, 'success')
        }
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleRotateSelected = async (degrees: number) => {
    if (!activeDoc || selectedPages.size === 0) return
    const pages = Array.from(selectedPages)
    try {
      const res = await fetch(`${API_BASE}/pdf/rotate-pages/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages, degrees }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        store.invalidatePageCache(activeDoc.doc_id)
        store.invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast(`${pages.length} pagina(s) rotada(s) ${degrees}°`, 'success')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleExtractSelected = async () => {
    if (!activeDoc || selectedPages.size === 0) return
    const pages = Array.from(selectedPages).sort((a, b) => a - b)
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace('.pdf', '_extracto.pdf') })
    if (!outputPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/split/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      if (res.ok) {
        showToast(`${pages.length} pagina(s) extraida(s)`, 'success')
        setSelectedPages(new Set())
      } else {
        showToast('Error al extraer paginas', 'error')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const refreshAfterStructuralChange = (newCount: number) => {
    if (!activeDoc) return
    updateDocPageCount(activeDoc.doc_id, newCount)
    setDocDirty(activeDoc.doc_id, true)
    store.invalidatePageCache(activeDoc.doc_id)
    store.invalidateThumbnails(activeDoc.doc_id)
    incrementDocVersion(activeDoc.doc_id)
  }

  const handleDuplicate = async () => {
    if (!activeDoc || selectedPages.size === 0) return
    const page = Math.min(...Array.from(selectedPages))
    try {
      const res = await fetch(`${API_BASE}/pdf/duplicate-page/${activeDoc.doc_id}?page_num=${page}`, { method: 'POST' })
      if (res.ok) {
        refreshAfterStructuralChange(activeDoc.page_count + 1)
        setSelectedPages(new Set())
        showToast('Página duplicada', 'success')
      } else showToast('Error al duplicar', 'error')
    } catch (err: any) { showToast('Error: ' + err.message, 'error') }
  }

  const handleInsertBlank = async () => {
    if (!activeDoc) return
    const index = selectedPages.size > 0 ? Math.max(...Array.from(selectedPages)) + 1 : activeDoc.page_count
    try {
      const res = await fetch(`${API_BASE}/pdf/insert-blank/${activeDoc.doc_id}?index=${index}`, { method: 'POST' })
      if (res.ok) {
        refreshAfterStructuralChange(activeDoc.page_count + 1)
        setSelectedPages(new Set())
        showToast('Página en blanco insertada', 'success')
      } else showToast('Error al insertar página', 'error')
    } catch (err: any) { showToast('Error: ' + err.message, 'error') }
  }

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className={`w-8 border-r flex items-center justify-center transition-colors shrink-0 group ${tc('bg-slate-800 border-slate-700 hover:bg-slate-700', 'bg-white border-gray-300 hover:bg-gray-100')}`}
        title="Mostrar paginas"
      >
        <PanelLeftClose size={16} className={`rotate-180 ${tc('text-slate-500 group-hover:text-slate-300', 'text-gray-500 group-hover:text-gray-700')}`} />
      </button>
    )
  }

  if (!activeDoc) {
    return (
      <div className={`w-52 border-r flex flex-col shrink-0 ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
        <div className={`flex items-center justify-between px-3 py-2 border-b ${tc('border-slate-700', 'border-gray-300')}`}>
          <span className={`text-xs font-semibold uppercase tracking-wider ${tc('text-slate-400', 'text-gray-500')}`}>Paginas</span>
          <button onClick={toggleSidebar} className={`p-1 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-400', 'hover:bg-gray-100 text-gray-500')}`}>
            <PanelLeftClose size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className={`text-sm text-center px-4 ${tc('text-slate-500', 'text-gray-500')}`}>Abre un PDF</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-52 border-r flex flex-col shrink-0 ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${tc('border-slate-700', 'border-gray-300')}`}>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab('pages')} className={`p-1 rounded transition-colors ${tab === 'pages' ? 'text-blue-400' : tc('text-slate-500 hover:text-slate-300', 'text-gray-500 hover:text-gray-700')}`} title="Paginas"><FileText size={14} /></button>
          <button onClick={() => setTab('outline')} className={`p-1 rounded transition-colors ${tab === 'outline' ? 'text-blue-400' : tc('text-slate-500 hover:text-slate-300', 'text-gray-500 hover:text-gray-700')}`} title="Outline"><BookOpen size={14} /></button>
          <button onClick={() => setTab('bookmarks')} className={`p-1 rounded transition-colors ${tab === 'bookmarks' ? 'text-blue-400' : tc('text-slate-500 hover:text-slate-300', 'text-gray-500 hover:text-gray-700')}`} title="Marcadores"><Bookmark size={14} /></button>
          <button onClick={() => setTab('annotations')} className={`p-1 rounded transition-colors ${tab === 'annotations' ? 'text-blue-400' : tc('text-slate-500 hover:text-slate-300', 'text-gray-500 hover:text-gray-700')}`} title="Anotaciones"><MessageSquare size={14} /></button>
          <button onClick={() => setTab('search')} className={`p-1 rounded transition-colors relative ${tab === 'search' ? 'text-blue-400' : tc('text-slate-500 hover:text-slate-300', 'text-gray-500 hover:text-gray-700')}`} title="Resultados de búsqueda"><Search size={14} />{activeDoc.searchResults.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400" />}</button>
        </div>
        <button onClick={toggleSidebar} className={`p-1 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-400', 'hover:bg-gray-100 text-gray-500')}`}>
          <PanelLeftClose size={14} />
        </button>
      </div>

      {tab === 'pages' && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 relative">
          {Array.from({ length: activeDoc.page_count }, (_, i) => {
            const isSelected = selectedPages.has(i)
            const isVisible = i >= visibleRange.start && i < visibleRange.end
            return (
              <div key={i}>
                {dragOverIndex === i && dragIndex !== i && (
                  <div className="h-0.5 bg-blue-500 rounded mb-1" />
                )}
                <div
                  data-page={i}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setDragOverIndex(i) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setDragOverIndex(null); return }
                    const newOrder = Array.from({ length: activeDoc.page_count }, (_, idx) => idx)
                    const [removed] = newOrder.splice(dragIndex, 1)
                    newOrder.splice(i, 0, removed)
                    fetch(`${API_BASE}/pdf/reorder/${activeDoc.doc_id}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ new_order: newOrder }),
                    }).then((res) => {
                      if (res.ok) {
                        reorderPages(activeDoc.doc_id, newOrder)
                        setDocDirty(activeDoc.doc_id, true)
                        incrementDocVersion(activeDoc.doc_id)
                        showToast('Paginas reordenadas', 'success')
                      } else {
                        showToast('Error al reordenar paginas', 'error')
                      }
                    })
                    setDragIndex(null); setDragOverIndex(null)
                  }}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                  onClick={(e) => handleThumbClick(i, e)}
                  className={`w-full rounded border transition-all cursor-pointer relative ${
                    activeDoc.currentPage === i
                      ? isSelected ? 'border-green-500 bg-green-500/10' : 'border-blue-500 bg-blue-500/10'
                      : isSelected ? 'border-green-500 bg-green-500/10' : tc('border-slate-700 hover:border-slate-500 bg-slate-900/50', 'border-gray-300 hover:border-gray-400 bg-gray-50')
                  } ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                  {isVisible && activeDoc.thumbnails.has(i) ? (
                    <img src={activeDoc.thumbnails.get(i)} alt={`Pagina ${i + 1}`} className="w-full h-auto rounded pointer-events-none" />
                  ) : (
                    <div className={`w-full aspect-[3/4] flex items-center justify-center rounded ${tc('bg-slate-900', 'bg-gray-100')}`}>
                      <span className={`text-xs ${tc('text-slate-600', 'text-gray-400')}`}>{i + 1}</span>
                    </div>
                  )}
                  {activeDoc.currentPage === i && viewerScroll.scrollWidth > 0 && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded">
                      <div className="absolute border-2 border-blue-400 bg-blue-400/20" style={{
                        left: `${Math.max(0, Math.min(100, (viewerScroll.left / viewerScroll.scrollWidth) * 100))}%`,
                        top: `${Math.max(0, Math.min(100, (viewerScroll.top / viewerScroll.scrollHeight) * 100))}%`,
                        width: `${Math.max(0, Math.min(100, (viewerScroll.clientWidth / viewerScroll.scrollWidth) * 100))}%`,
                        height: `${Math.max(0, Math.min(100, (viewerScroll.clientHeight / viewerScroll.scrollHeight) * 100))}%`,
                      }} />
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className={`text-center text-[10px] py-1 ${tc('text-slate-400', 'text-gray-500')}`}>{i + 1}</div>
                </div>
              </div>
            )
          })}
          {selectedPages.size > 0 && (
            <div className={`sticky bottom-2 mx-1 p-2 rounded-lg border shadow-lg flex flex-wrap gap-1.5 justify-center ${tc('bg-slate-800 border-slate-600', 'bg-white border-gray-300')}`}>
              <span className={`text-[10px] w-full text-center mb-1 ${tc('text-slate-400', 'text-gray-500')}`}>{selectedPages.size} seleccionada(s)</span>
              <button onClick={() => handleRotateSelected(90)} className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white" title="Rotar CW"><RotateCw size={14} /></button>
              <button onClick={() => handleRotateSelected(-90)} className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white" title="Rotar CCW"><RotateCcw size={14} /></button>
              <button onClick={handleDuplicate} className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white" title="Duplicar página"><Copy size={14} /></button>
              <button onClick={handleInsertBlank} className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white" title="Insertar página en blanco después"><FilePlus2 size={14} /></button>
              <button onClick={handleExtractSelected} className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white" title="Extraer"><Scissors size={14} /></button>
              <button onClick={handleDeleteSelected} className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white" title="Eliminar"><Trash2 size={14} /></button>
              <button onClick={() => setSelectedPages(new Set())} className={`p-1.5 rounded ${tc('bg-slate-700 hover:bg-slate-600', 'bg-gray-200 hover:bg-gray-300')}`} title="Limpiar"><X size={14} /></button>
            </div>
          )}
        </div>
      )}
      {tab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-2">
          {activeDoc.outline.length > 0 ? (
            <OutlineTree items={activeDoc.outline} onJump={(page) => setPage(activeDoc.doc_id, page)} tc={tc} />
          ) : (
            <p className={`text-xs text-center mt-4 ${tc('text-slate-500', 'text-gray-500')}`}>Este PDF no tiene outline</p>
          )}
        </div>
      )}
      {tab === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {bookmarks.filter((b) => b.docId === activeDoc.doc_id).length > 0 ? (
            bookmarks.filter((b) => b.docId === activeDoc.doc_id).map((b) => (
              <div key={b.id} className="flex items-center gap-1 group">
                <button onClick={() => setPage(activeDoc.doc_id, b.page)} className={`flex-1 text-left text-xs rounded px-2 py-1 transition-colors truncate ${tc('text-slate-300 hover:text-white hover:bg-slate-700', 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`}>{b.label}</button>
                <button onClick={() => removeBookmark(b.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-opacity" aria-label="Eliminar marcador"><Trash2 size={12} /></button>
              </div>
            ))
          ) : (
            <p className={`text-xs text-center mt-4 ${tc('text-slate-500', 'text-gray-500')}`}>Sin marcadores</p>
          )}
        </div>
      )}
      {tab === 'search' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeDoc.searchResults.length > 0 ? (
            <>
              <div className={`text-[10px] px-1 pb-1 ${tc('text-slate-500', 'text-gray-500')}`}>
                {activeDoc.searchResults.length} resultado(s) para "{activeDoc.searchQuery}"
              </div>
              {activeDoc.searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => goToSearchResult(activeDoc.doc_id, i)}
                  className={`w-full text-left text-xs rounded px-2 py-1.5 transition-colors ${
                    i === activeDoc.searchIndex
                      ? 'bg-blue-500/20 border border-blue-500'
                      : tc('hover:bg-slate-700 border border-transparent', 'hover:bg-gray-100 border border-transparent')
                  }`}
                  title={r.snippet || ''}
                >
                  <span className={`block text-[10px] mb-0.5 ${tc('text-slate-500', 'text-gray-500')}`}>Pág. {r.page + 1}</span>
                  <span className={`block truncate ${tc('text-slate-300', 'text-gray-700')}`}>{r.snippet || '(sin texto)'}</span>
                </button>
              ))}
            </>
          ) : (
            <p className={`text-xs text-center mt-4 ${tc('text-slate-500', 'text-gray-500')}`}>Sin resultados de búsqueda</p>
          )}
        </div>
      )}
      {tab === 'annotations' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeDoc.annotations.length > 0 ? (
            activeDoc.annotations.map((ann) => (
              <div key={ann.id} className="flex items-center gap-1 group">
                <button onClick={() => { setPage(activeDoc.doc_id, ann.page); store.selectAnnotation(activeDoc.doc_id, ann.id) }} className={`flex-1 text-left text-xs rounded px-2 py-1 transition-colors truncate ${tc('text-slate-300 hover:text-white hover:bg-slate-700', 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`} title={ann.text || ann.type}>
                  <span className="capitalize text-slate-500 mr-1">{ann.type}</span>
                  <span className="truncate">{ann.text || `Pag. ${ann.page + 1}`}</span>
                </button>
                <button onClick={() => store.deleteAnnotation(activeDoc.doc_id, ann.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-opacity" aria-label="Eliminar anotacion"><Trash2 size={12} /></button>
              </div>
            ))
          ) : (
            <p className={`text-xs text-center mt-4 ${tc('text-slate-500', 'text-gray-500')}`}>Sin anotaciones</p>
          )}
        </div>
      )}
    </div>
  )
}
