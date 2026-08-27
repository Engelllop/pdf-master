import { useEffect, useRef, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { PanelLeftClose, FileText, BookOpen, Bookmark, Trash2, MessageSquare, RotateCw, RotateCcw, Scissors, X, Search, Copy, FilePlus2, Tally5, Pencil, Check } from 'lucide-react'
import type { OutlineItem } from '../store/usePdfStore'
import { useFormModal } from './FormModal'
import ReviewPanel from './ReviewPanel'
import CountPanel from './CountPanel'

import { apiFetch } from '../lib/api'
import { pushAnnotations } from '../lib/saveDocument'
import { borrarEnRuta, cuantasCuelgan, renombrarEnRuta, tituloEnRuta, type RutaIndice } from '../lib/outlineTree'
import { mismaRuta } from '../lib/rutas'
import { renderPdfThumbnail } from '../lib/pdfjs'
import {
  deletePagesUndoable,
  duplicatePageUndoable,
  insertBlankUndoable,
  reorderPagesUndoable,
  rotatePagesUndoable,
} from '../lib/pageUndo'

function OutlineTree({ items, depth = 0, ruta = [], onJump, onRenombrar, onBorrar }: {
  items: OutlineItem[]; depth?: number; ruta?: RutaIndice; onJump: (page: number) => void
  onRenombrar: (ruta: RutaIndice) => void; onBorrar: (ruta: RutaIndice) => void
}) {
  return (
    <>
      {items.map((item, idx) => {
        const rutaItem = [...ruta, idx]
        return (
        <div key={idx}>
          <div className="flex items-center gap-0.5 group">
            <button
              onClick={() => onJump(item.page)}
              className={`flex-1 min-w-0 text-left text-mini rounded-token-sm px-2 py-1 transition-colors truncate text-muted hover:text-fg hover:bg-hover`}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              title={item.title}
            >
              {item.title}
            </button>
            {/* Solo se podía AÑADIR: una entrada mal puesta (o el índice equivocado de
                un PDF ajeno) no había forma de quitarla desde la app. */}
            <button onClick={() => onRenombrar(rutaItem)} aria-label={`Renombrar ${item.title}`}
              className="p-1 rounded-token-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted hover:text-fg hover:bg-hover shrink-0">
              <Pencil size={12} />
            </button>
            <button onClick={() => onBorrar(rutaItem)} aria-label={`Borrar ${item.title}`}
              className="p-1 rounded-token-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-muted hover:text-danger hover:bg-hover shrink-0">
              <Trash2 size={12} />
            </button>
          </div>
          {item.children && item.children.length > 0 && (
            <OutlineTree items={item.children} depth={depth + 1} ruta={rutaItem}
              onJump={onJump} onRenombrar={onRenombrar} onBorrar={onBorrar} />
          )}
        </div>
        )
      })}
    </>
  )
}

export default function ThumbnailPanel() {
  const store = useStoreSlice(
    'docs', 'activeDocId', 'sidebarOpen', 'toggleSidebar', 'setPage', 'addThumbnail',
    'bookmarks', 'removeBookmark', 'showToast', 'setDocDirty',
    'viewerScroll', 'goToSearchResult',
    'deleteAnnotation', 'invalidatePageCache', 'invalidateThumbnails', 'selectAnnotation',
    'setActiveDoc', 'setOutline',
  )
  const { docs, activeDocId, sidebarOpen, toggleSidebar, setPage, addThumbnail, bookmarks, removeBookmark, showToast, setDocDirty, viewerScroll, goToSearchResult, setActiveDoc, setOutline } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const { askForm, askConfirm, formModal } = useFormModal()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'pages' | 'outline' | 'bookmarks' | 'annotations' | 'counts' | 'search'>('pages')

  // Jump to the search results tab automatically when a new search produces matches.
  useEffect(() => {
    if (activeDoc && activeDoc.searchResults.length > 0) setTab('search')
  }, [activeDoc?.doc_id, activeDoc?.searchResults.length])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())
  const [lastSelectedPage, setLastSelectedPage] = useState<number | null>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 })

  // Esc limpia la selección de páginas (no interfiere con el Esc global de herramientas).
  useEffect(() => {
    if (selectedPages.size === 0) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPages(new Set()) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPages.size])

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
              const { url } = await renderPdfThumbnail(activeDoc.doc_id, activeDoc.docVersion, pageNum)
              addThumbnail(activeDoc.doc_id, pageNum, url)
            } catch (e) {
              // AbortError = el documento se descartó (versión nueva): no es un fallo.
              if ((e as { name?: string })?.name !== 'AbortError') console.error('Error loading thumbnail', e)
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
    if (selectedPages.size >= activeDoc.page_count) {
      showToast('No se pueden eliminar todas las páginas', 'error')
      return
    }
    if (!(await askConfirm('Eliminar páginas', `¿Eliminar ${selectedPages.size} página(s) seleccionada(s)?`, 'Eliminar'))) return
    const pages = Array.from(selectedPages)
    try {
      await deletePagesUndoable(activeDoc.doc_id, pages)
      setSelectedPages(new Set())
      showToast(`${pages.length} página(s) eliminada(s). Ctrl+Z restaura.`, 'success')
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleRotateSelected = async (degrees: number) => {
    if (!activeDoc || selectedPages.size === 0) return
    const pages = Array.from(selectedPages)
    try {
      await rotatePagesUndoable(activeDoc.doc_id, pages, degrees)
      showToast(`${pages.length} página(s) rotada(s) ${degrees}°. Ctrl+Z deshace.`, 'success')
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  // El índice se escribe SIEMPRE completo por el mismo endpoint (`set_toc` reescribe el
  // TOC entero), así que añadir, renombrar y borrar comparten este único camino.
  const escribirIndice = async (siguiente: OutlineItem[], aviso: string): Promise<void> => {
    if (!activeDoc) return
    const res = await apiFetch(`/pdf/outline/${activeDoc.doc_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siguiente),
    })
    if (!res.ok) { showToast('No se pudo escribir el índice', 'error'); return }
    setOutline(activeDoc.doc_id, siguiente)
    setDocDirty(activeDoc.doc_id, true)
    showToast(aviso, 'success')
  }

  const renombrarIndice = async (ruta: RutaIndice): Promise<void> => {
    if (!activeDoc) return
    const actual = tituloEnRuta(activeDoc.outline, ruta)
    const v = await askForm('Renombrar entrada del índice', [
      { name: 'title', label: 'Título', type: 'text', defaultValue: actual },
    ], 'Renombrar')
    const titulo = String(v?.title ?? '').trim()
    if (!v || !titulo || titulo === actual) return
    await escribirIndice(renombrarEnRuta(activeDoc.outline, ruta, titulo), 'Entrada renombrada')
  }

  const borrarIndice = async (ruta: RutaIndice): Promise<void> => {
    if (!activeDoc) return
    const titulo = tituloEnRuta(activeDoc.outline, ruta)
    // Borrar un capítulo se lleva sus hijas: decir cuántas evita borrar veinte
    // entradas creyendo que se borra una línea.
    const cuantas = cuantasCuelgan(activeDoc.outline, ruta)
    const detalle = cuantas > 1 ? ` y sus ${cuantas - 1} subentrada(s)` : ''
    if (!(await askConfirm('Borrar del índice', `Se quita «${titulo}»${detalle} del índice del PDF.`, 'Borrar'))) return
    await escribirIndice(borrarEnRuta(activeDoc.outline, ruta), 'Entrada borrada del índice')
  }

  // Del archivo abierto, comparando rutas como Windows: el cuadro de abrir puede
  // devolver `C:\Planos\A.pdf` y la sesión guardada `c:/planos/a.pdf`.
  const marcadoresDelDoc = bookmarks.filter((b) => mismaRuta(b.filePath, activeDoc?.file_path))

  const handleExtractSelected = async () => {
    if (!activeDoc || selectedPages.size === 0) return
    const pages = Array.from(selectedPages).sort((a, b) => a - b)
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace('.pdf', '_extracto.pdf') })
    if (!outputPath) return
    try {
      // El extracto es un PDF que se manda a alguien: sin subir las marcas del store
      // salía con las páginas limpias, sin las marcas que se acaban de poner.
      await pushAnnotations(activeDoc.doc_id)
      const res = await apiFetch(`/pdf/split/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      if (res.ok) {
        showToast(`${pages.length} página(s) extraída(s)`, 'success')
        setSelectedPages(new Set())
      } else {
        showToast('Error al extraer páginas', 'error')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleDuplicate = async () => {
    if (!activeDoc || selectedPages.size === 0) return
    const page = Math.min(...Array.from(selectedPages))
    try {
      await duplicatePageUndoable(activeDoc.doc_id, page)
      setSelectedPages(new Set())
      showToast('Página duplicada. Ctrl+Z deshace.', 'success')
    } catch (err: any) { showToast('Error: ' + err.message, 'error') }
  }

  const handleInsertBlank = async () => {
    if (!activeDoc) return
    const index = selectedPages.size > 0 ? Math.max(...Array.from(selectedPages)) + 1 : activeDoc.page_count
    try {
      await insertBlankUndoable(activeDoc.doc_id, index)
      setSelectedPages(new Set())
      showToast('Página en blanco insertada. Ctrl+Z deshace.', 'success')
    } catch (err: any) { showToast('Error: ' + err.message, 'error') }
  }

  // Rail de iconos SIEMPRE visible (estilo SwifDoo/Acrobat): un clic abre el panel en
  // esa sección; clic en la sección ya activa lo colapsa.
  const railItems: Array<{ id: typeof tab; icon: typeof FileText; title: string }> = [
    { id: 'pages', icon: FileText, title: 'Páginas' },
    { id: 'outline', icon: BookOpen, title: 'Esquema' },
    { id: 'bookmarks', icon: Bookmark, title: 'Marcadores' },
    { id: 'annotations', icon: MessageSquare, title: 'Anotaciones' },
    { id: 'counts', icon: Tally5, title: 'Conteo' },
    { id: 'search', icon: Search, title: 'Búsqueda' },
  ]
  const sectionTitle: Record<typeof tab, string> = {
    pages: 'Páginas', outline: 'Esquema', bookmarks: 'Marcadores', annotations: 'Anotaciones', counts: 'Conteo', search: 'Búsqueda',
  }
  const onRail = (id: typeof tab) => {
    if (sidebarOpen && tab === id) { toggleSidebar(); return }
    setTab(id)
    if (!sidebarOpen) toggleSidebar()
  }
  const railEl = (
    <div className={`w-11 border-r flex flex-col items-center py-2 gap-1 shrink-0 bg-panel border-border-strong`}>
      {railItems.map(({ id, icon: Icon, title }) => {
        const on = sidebarOpen && tab === id
        return (
          <button key={id} onClick={() => onRail(id)} title={title}
            aria-label={id === 'search' && activeDoc && activeDoc.searchResults.length > 0
              ? `${title}, ${activeDoc.searchResults.length} resultados`
              : title}
            aria-pressed={on}
            className={`relative p-2 rounded-token transition-colors ${on ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg hover:bg-hover'}`}>
            {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-on-accent" />}
            <Icon size={18} />
            {id === 'search' && activeDoc && activeDoc.searchResults.length > 0 && (
              <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${on ? 'bg-on-accent' : 'bg-accent'}`} aria-hidden />
            )}
          </button>
        )
      })}
    </div>
  )

  if (!activeDoc) {
    return (
      <div className="flex shrink-0">
        {railEl}
        {sidebarOpen && (
          <div className={`w-56 border-r flex flex-col bg-panel border-border-strong`}>
            <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
              <span className={`text-micro font-semibold uppercase tracking-wider text-muted`}>{sectionTitle[tab]}</span>
              <button onClick={toggleSidebar} aria-label="Ocultar panel" className={`p-1 rounded-token-sm transition-colors hover:bg-hover text-muted`}>
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className={`text-base text-center px-4 text-muted`}>Abre un PDF</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex shrink-0">
      {railEl}
      {formModal}
      {sidebarOpen && (
      // El panel de revisión necesita más ancho que las miniaturas (filtros + hilos).
      <div className={`${tab === 'annotations' || tab === 'counts' ? 'w-80' : 'w-56'} border-r flex flex-col bg-panel border-border-strong`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b border-border`}>
        <span className={`text-micro font-semibold uppercase tracking-wider text-muted`}>{sectionTitle[tab]}</span>
        <button onClick={toggleSidebar} aria-label="Ocultar panel" className={`p-1 rounded-token-sm transition-colors hover:bg-hover text-muted`}>
          <PanelLeftClose size={14} />
        </button>
      </div>

      {tab === 'pages' && (
        <div ref={scrollRef} role="listbox" aria-label="Páginas del documento"
          className="flex-1 overflow-y-auto p-2 space-y-2 relative">
          {Array.from({ length: activeDoc.page_count }, (_, i) => {
            const isSelected = selectedPages.has(i)
            const isVisible = i >= visibleRange.start && i < visibleRange.end
            return (
              // presentation: el envoltorio (que solo aloja la guía de arrastre) sale del
              // árbol de accesibilidad para que la opción cuelgue del listbox.
              <div key={i} role="presentation">
                {dragOverIndex === i && dragIndex !== i && (
                  <div className="h-0.5 bg-accent rounded-token-sm mb-1" />
                )}
                <div
                  data-page={i}
                  role="option"
                  aria-selected={activeDoc.currentPage === i}
                  aria-label={`Página ${i + 1} de ${activeDoc.page_count}`}
                  tabIndex={activeDoc.currentPage === i ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPage(activeDoc.doc_id, i) }
                  }}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setDragOverIndex(i) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setDragOverIndex(null); return }
                    const newOrder = Array.from({ length: activeDoc.page_count }, (_, idx) => idx)
                    const [removed] = newOrder.splice(dragIndex, 1)
                    newOrder.splice(i, 0, removed)
                    void reorderPagesUndoable(activeDoc.doc_id, newOrder)
                      .then(() => showToast('Páginas reordenadas. Ctrl+Z deshace.', 'success'))
                      .catch((err: Error) => showToast('Error: ' + err.message, 'error'))
                    setDragIndex(null); setDragOverIndex(null)
                  }}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                  onClick={(e) => handleThumbClick(i, e)}
                  className={`w-full cursor-pointer group ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                  {/* La miniatura es una hoja de papel con su sombra, igual que la
                      pagina grande: el anillo de seleccion va FUERA del papel, asi el
                      recuadro no se come el filo del plano. */}
                  <div className={`relative rounded-token-sm overflow-hidden bg-white transition-shadow duration-fast ease-token ${
                    activeDoc.currentPage === i || isSelected
                      ? 'shadow-token-sm ring-2 ring-accent'
                      : 'shadow-token-sm ring-1 ring-border group-hover:ring-muted'
                  }`}>
                  {isVisible && activeDoc.thumbnails.has(i) ? (
                    <img src={activeDoc.thumbnails.get(i)} alt="" className="w-full h-auto block pointer-events-none" />
                  ) : (
                    <div className="skeleton w-full aspect-[3/4]" />
                  )}
                  {activeDoc.currentPage === i && viewerScroll.scrollWidth > 0 && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-token-sm">
                      <div className="absolute border-2 border-accent bg-accent/20" style={{
                        left: `${Math.max(0, Math.min(100, (viewerScroll.left / viewerScroll.scrollWidth) * 100))}%`,
                        top: `${Math.max(0, Math.min(100, (viewerScroll.top / viewerScroll.scrollHeight) * 100))}%`,
                        width: `${Math.max(0, Math.min(100, (viewerScroll.clientWidth / viewerScroll.scrollWidth) * 100))}%`,
                        height: `${Math.max(0, Math.min(100, (viewerScroll.clientHeight / viewerScroll.scrollHeight) * 100))}%`,
                      }} />
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-on-accent flex items-center justify-center shadow-token-sm">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  </div>
                  {/* Fuera del papel: es el rotulo de la hoja, no parte de ella. */}
                  <div className={`text-center text-micro pt-1 tabular ${
                    activeDoc.currentPage === i ? 'text-fg font-medium' : 'text-muted'
                  }`}>{i + 1}</div>
                </div>
              </div>
            )
          })}
          {selectedPages.size > 0 && (
            <div className={`sticky bottom-2 z-raised mx-1 rounded-token-lg border shadow-token-lg bg-panel/95 backdrop-blur-[2px] border-border`}>
              <div className={`flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b border-border`}>
                <span className={`text-micro font-medium text-muted`}>{selectedPages.size} seleccionada(s)</span>
                <button onClick={() => setSelectedPages(new Set())} title="Limpiar selección (Esc)" aria-label="Limpiar selección" className={`p-1 rounded-token-sm transition-colors text-muted hover:text-fg hover:bg-hover`}><X size={16} /></button>
              </div>
              {/* Seis rellenos negros seguidos no dicen cual es el peligroso. Las
                  acciones normales van neutras y solo eliminar se tine. */}
              <div className="flex flex-wrap gap-1 justify-center p-2">
                {([
                  [RotateCw, 'Rotar 90° derecha', () => handleRotateSelected(90)],
                  [RotateCcw, 'Rotar 90° izquierda', () => handleRotateSelected(-90)],
                  [Copy, 'Duplicar página', handleDuplicate],
                  [FilePlus2, 'Insertar página en blanco después', handleInsertBlank],
                  [Scissors, 'Extraer a nuevo PDF', handleExtractSelected],
                ] as Array<[typeof RotateCw, string, () => void]>).map(([Icon, titulo, accion]) => (
                  <button key={titulo} onClick={accion} title={titulo} aria-label={titulo}
                    className="p-2 rounded-token text-fg hover:bg-hover active:bg-active transition-colors duration-fast ease-token">
                    <Icon size={16} />
                  </button>
                ))}
                <button onClick={handleDeleteSelected} title="Eliminar página(s)" aria-label="Eliminar página(s)"
                  className="p-2 rounded-token text-danger hover:bg-danger/10 transition-colors duration-fast ease-token">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => escribirIndice([...activeDoc.outline, { title: `Página ${activeDoc.currentPage + 1}`, page: activeDoc.currentPage }], 'Entrada añadida al índice del PDF')}
            className="w-full mb-2 px-2 py-1 rounded-token-sm text-mini border border-border text-muted hover:text-fg hover:bg-hover"
          >
            Añadir página actual al índice
          </button>
          {activeDoc.outline.length > 0 ? (
            <OutlineTree items={activeDoc.outline} onJump={(page) => setPage(activeDoc.doc_id, page)}
              onRenombrar={renombrarIndice} onBorrar={borrarIndice} />
          ) : (
            <p className={`text-mini text-center mt-4 text-muted`}>Este PDF no tiene índice</p>
          )}
        </div>
      )}
      {tab === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {marcadoresDelDoc.length > 0 ? (
            marcadoresDelDoc.map((b) => (
              <div key={b.id} className="flex items-center gap-1 group">
                <button onClick={() => setPage(activeDoc.doc_id, b.page)} className={`flex-1 text-left text-mini rounded-token-sm px-2 py-1 transition-colors truncate text-muted hover:text-fg hover:bg-hover`}>{b.label}</button>
                <button onClick={() => removeBookmark(b.id)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-token-sm hover:bg-danger/10 text-danger transition-opacity" aria-label="Eliminar marcador"><Trash2 size={12} /></button>
              </div>
            ))
          ) : (
            <p className={`text-mini text-center mt-4 text-muted`}>Sin marcadores</p>
          )}
        </div>
      )}
      {tab === 'search' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeDoc.searchResults.length > 0 ? (
            <>
              <div className={`text-micro px-1 pb-1 text-muted`}>
                {activeDoc.searchResults.length} resultado(s) para &laquo;{activeDoc.searchQuery}&raquo;
              </div>
              {activeDoc.searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => goToSearchResult(activeDoc.doc_id, i)}
                  className={`w-full text-left text-mini rounded-token-sm px-2 py-1.5 transition-colors ${
                    i === activeDoc.searchIndex
                      ? 'bg-black/5 dark:bg-white/10 border border-accent'
                      : 'hover:bg-hover border border-transparent'
                  }`}
                  title={r.snippet || ''}
                >
                  <span className={`block text-micro mb-0.5 text-muted`}>Pág. {r.page + 1}</span>
                  <span className={`block truncate text-fg`}>{r.snippet || '(sin texto)'}</span>
                </button>
              ))}
            </>
          ) : (
            <p className={`text-mini text-center mt-4 text-muted`}>Sin resultados de búsqueda</p>
          )}
          {(() => {
            // Resultados de la misma búsqueda en los demás documentos abiertos
            const others = docs.filter((d) =>
              d.doc_id !== activeDoc.doc_id && d.searchQuery && d.searchQuery === activeDoc.searchQuery && d.searchResults.length > 0)
            if (others.length === 0) return null
            return (
              <>
                <div className={`text-micro px-1 pt-3 pb-1 border-t mt-2 text-muted border-border`}>
                  En otros documentos
                </div>
                {others.map((d) => (
                  <button key={d.doc_id} onClick={() => { setActiveDoc(d.doc_id); goToSearchResult(d.doc_id, 0) }}
                    className={`w-full text-left text-mini rounded-token-sm px-2 py-1.5 transition-colors hover:bg-hover`}
                    title={d.file_path}>
                    <span className={`block truncate font-medium text-fg`}>{d.file_name}</span>
                    <span className={`block text-micro text-muted`}>{d.searchResults.length} resultado(s)</span>
                  </button>
                ))}
              </>
            )
          })()}
        </div>
      )}
      {tab === 'annotations' && <ReviewPanel activeDoc={activeDoc} />}
      {tab === 'counts' && <CountPanel activeDoc={activeDoc} />}
      </div>
      )}
    </div>
  )
}
