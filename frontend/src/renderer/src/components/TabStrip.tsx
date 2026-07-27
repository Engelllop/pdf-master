import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, ChevronsUpDown, ChevronLeft, ChevronRight, FileText, FolderOpen, X, Trash2, Plus, Columns2 } from 'lucide-react'
import Tooltip from './Tooltip'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { requestCloseDoc } from '../lib/closeDocument'

// Tira de pestañas de documentos + desplegable "ir a pestaña" + menú contextual.
// Las pestañas se reordenan arrastrándolas (estilo navegador).
export default function TabStrip() {
  const { docs, activeDocId, loadingDocId, setActiveDoc, moveDoc, showToast, setCompareDoc, compareMode, toggleCompareMode } = useStoreSlice(
    'docs', 'activeDocId', 'loadingDocId', 'setActiveDoc', 'moveDoc', 'showToast', 'setCompareDoc', 'compareMode', 'toggleCompareMode',
  )
  const [tabMenu, setTabMenu] = useState<{ docId: string; path: string; x: number; y: number } | null>(null)
  const [tabListOpen, setTabListOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const tabStripRef = useRef<HTMLDivElement>(null)

  // Recalcula si la tira se desborda por izquierda/derecha (para mostrar las flechas).
  const updateOverflow = useCallback(() => {
    const el = tabStripRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    updateOverflow()
    const el = tabStripRef.current
    if (!el) return
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    el.addEventListener('scroll', updateOverflow, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', updateOverflow) }
  }, [updateOverflow, docs.length])

  // Rueda del ratón = desplazamiento horizontal (trackpads/ratones sin eje X).
  const onWheel = (e: React.WheelEvent) => {
    const el = tabStripRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
  }

  const scrollByStep = (dir: 1 | -1) =>
    tabStripRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })

  // Keep the active tab visible when switching via keyboard / tab list.
  useEffect(() => {
    if (!activeDocId || !tabStripRef.current) return
    tabStripRef.current.querySelector(`[data-tab-id="${activeDocId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeDocId])

  const compareWith = (docId: string) => {
    setCompareDoc(docId)
    if (!compareMode) toggleCompareMode()
  }

  return (
    <>
      <div className="flex-1 flex items-center min-w-0">
        {overflow.left && (
          <button onClick={() => scrollByStep(-1)} aria-label="Desplazar pestañas a la izquierda"
            className="app-no-drag shrink-0 p-1 h-full text-muted hover:text-fg hover:bg-hover transition-colors">
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar px-1 min-w-0" ref={tabStripRef} onWheel={onWheel}>
          {docs.map((doc, i) => (
            <div key={doc.doc_id} data-tab-id={doc.doc_id} onClick={() => setActiveDoc(doc.doc_id)}
              draggable
              onDragStart={(e) => { setDragId(doc.doc_id); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== doc.doc_id) moveDoc(dragId, i)
              }}
              onContextMenu={(e) => { e.preventDefault(); setTabMenu({ docId: doc.doc_id, path: doc.file_path, x: e.clientX, y: e.clientY }) }}
              title={doc.file_path}
              className={`app-no-drag group relative flex items-center gap-2 pl-3 pr-1.5 my-1 h-[calc(100%-8px)] rounded-md cursor-pointer text-[13px] shrink min-w-[92px] max-w-[220px] transition-colors ${
                dragId === doc.doc_id ? 'opacity-50' : ''
              } ${
                doc.doc_id === activeDocId
                  ? 'bg-surface text-fg font-medium border border-border shadow-sm'
                  : 'text-muted border border-transparent hover:bg-hover hover:text-fg'
              }`}>
              {loadingDocId === doc.doc_id
                ? <Loader2 size={13} className="animate-spin text-accent shrink-0" />
                : <FileText size={13} className={`shrink-0 ${doc.dirty ? 'text-amber-600 dark:text-amber-400' : doc.doc_id === activeDocId ? 'text-accent' : 'text-muted'}`} />}
              <span className="truncate flex-1">{doc.file_name}</span>
              {doc.dirty && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400" title="Cambios sin guardar" />}
              <button onClick={(e) => { e.stopPropagation(); requestCloseDoc(doc.doc_id) }} aria-label="Cerrar pestaña"
                className={`shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:bg-hover`}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {overflow.right && (
          <button onClick={() => scrollByStep(1)} aria-label="Desplazar pestañas a la derecha"
            className="app-no-drag shrink-0 p-1 h-full text-muted hover:text-fg hover:bg-hover transition-colors">
            <ChevronRight size={16} />
          </button>
        )}
        <Tooltip content="Abrir PDF" shortcut="Ctrl+O">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-open'))} aria-label="Abrir PDF"
            className={`app-no-drag p-1.5 mx-1 rounded transition-colors shrink-0 text-muted hover:text-fg hover:bg-hover`}>
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>

      {docs.length > 1 && (
        <div className="app-no-drag relative h-full flex items-center">
          <Tooltip content="Ir a pestaña…">
            <button onClick={() => setTabListOpen((o) => !o)} aria-label="Lista de pestañas"
              className={`p-2 h-full transition-colors ${tabListOpen ? 'text-accent' : 'text-muted'} hover:bg-hover`}>
              <ChevronsUpDown size={16} />
            </button>
          </Tooltip>
          {tabListOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setTabListOpen(false)} />
              <div className={`menu-pop absolute right-0 top-full z-[61] mt-0 w-72 max-h-[60vh] overflow-y-auto py-1 rounded-b-md border shadow-xl text-sm bg-panel border-border text-fg`}>
                {docs.map((doc) => (
                  <button key={doc.doc_id}
                    onClick={() => { setActiveDoc(doc.doc_id); setTabListOpen(false) }}
                    title={doc.file_path}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${doc.doc_id === activeDocId ? 'bg-hover' : ''} hover:bg-hover`}>
                    {loadingDocId === doc.doc_id
                      ? <Loader2 size={13} className="animate-spin text-accent shrink-0" />
                      : <FileText size={13} className={`shrink-0 ${doc.dirty ? 'text-amber-400' : 'text-muted'}`} />}
                    <span className="truncate flex-1">{doc.file_name}</span>
                    {doc.doc_id === activeDocId && <span className="text-[10px] text-accent shrink-0">activo</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tabMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setTabMenu(null)} onContextMenu={(e) => { e.preventDefault(); setTabMenu(null) }} />
          <div className={`menu-pop fixed z-[61] min-w-[200px] py-1 rounded-md border shadow-xl text-sm bg-panel border-border text-fg`}
            style={{ left: Math.min(tabMenu.x, window.innerWidth - 220), top: Math.min(tabMenu.y, window.innerHeight - 120) }}>
            {docs.length >= 2 && tabMenu.docId !== activeDocId && (
              <>
                <button onClick={() => { compareWith(tabMenu.docId); setTabMenu(null) }}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-hover`}>
                  <Columns2 size={14} className={'text-muted'} /> Ver lado a lado con el activo
                </button>
                <div className={`h-px my-1 bg-border`} />
              </>
            )}
            <button onClick={() => { window.api.showInFolder(tabMenu.path); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-hover`}>
              <FolderOpen size={14} className={'text-muted'} /> Abrir ubicación del archivo
            </button>
            <button onClick={() => { navigator.clipboard.writeText(tabMenu.path).catch(() => {}); showToast('Ruta copiada', 'success'); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-hover`}>
              <FileText size={14} className={'text-muted'} /> Copiar ruta
            </button>
            <div className={`h-px my-1 bg-border`} />
            <button onClick={() => { requestCloseDoc(tabMenu.docId); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-hover`}>
              <X size={14} className={'text-muted'} /> Cerrar pestaña
            </button>
            <button disabled={docs.length < 2} onClick={() => { docs.filter((d) => d.doc_id !== tabMenu.docId).forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 disabled:opacity-30 hover:bg-hover`}>
              <X size={14} className={'text-muted'} /> Cerrar las demás
            </button>
            <button onClick={() => { const i = docs.findIndex((d) => d.doc_id === tabMenu.docId); docs.slice(i + 1).forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-hover`}>
              <X size={14} className={'text-muted'} /> Cerrar a la derecha
            </button>
            <button onClick={() => { docs.forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-red-400 hover:bg-hover`}>
              <Trash2 size={14} /> Cerrar todas
            </button>
          </div>
        </>
      )}
    </>
  )
}
