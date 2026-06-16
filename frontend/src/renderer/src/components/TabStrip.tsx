import { useState, useRef, useEffect } from 'react'
import { Loader2, ChevronsUpDown, FileText, FolderOpen, X, Trash2 } from 'lucide-react'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { requestCloseDoc } from '../lib/closeDocument'

// Tira de pestañas de documentos + desplegable "ir a pestaña" + menú contextual.
export default function TabStrip() {
  const tc = useThemeClasses()
  const { docs, activeDocId, loadingDocId, setActiveDoc, showToast } = useStoreSlice(
    'docs', 'activeDocId', 'loadingDocId', 'setActiveDoc', 'showToast',
  )
  const [tabMenu, setTabMenu] = useState<{ docId: string; path: string; x: number; y: number } | null>(null)
  const [tabListOpen, setTabListOpen] = useState(false)
  const tabStripRef = useRef<HTMLDivElement>(null)

  // Keep the active tab visible when switching via keyboard / tab list.
  useEffect(() => {
    if (!activeDocId || !tabStripRef.current) return
    tabStripRef.current.querySelector(`[data-tab-id="${activeDocId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeDocId])

  return (
    <>
      <div className="flex-1 flex items-center overflow-x-auto no-scrollbar" ref={tabStripRef}>
        {docs.map((doc) => (
          <div key={doc.doc_id} data-tab-id={doc.doc_id} onClick={() => setActiveDoc(doc.doc_id)}
            onContextMenu={(e) => { e.preventDefault(); setTabMenu({ docId: doc.doc_id, path: doc.file_path, x: e.clientX, y: e.clientY }) }}
            title={doc.file_path}
            className={`group flex items-center gap-2 px-4 h-full border-r cursor-pointer text-sm min-w-fit transition-colors ${
              doc.doc_id === activeDocId
                ? tc('bg-slate-800 text-slate-100 border-t-2 border-t-blue-500 border-slate-700', 'bg-gray-100 text-gray-900 border-t-2 border-t-blue-500 border-gray-300')
                : tc('bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border-slate-700', 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-gray-300')
            }`}>
            {loadingDocId === doc.doc_id && <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />}
            {doc.dirty && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Cambios sin guardar" />}
            <span className="truncate max-w-[140px]">{doc.file_name}</span>
            <button onClick={(e) => { e.stopPropagation(); requestCloseDoc(doc.doc_id) }}
              className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity ${tc('hover:bg-slate-600', 'hover:bg-gray-200')}`}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {docs.length > 1 && (
        <div className="relative h-full flex items-center">
          <Tooltip content="Ir a pestaña…">
            <button onClick={() => setTabListOpen((o) => !o)} aria-label="Lista de pestañas"
              className={`p-2 h-full transition-colors ${tabListOpen ? 'text-blue-400' : tc('text-slate-400', 'text-gray-500')} ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <ChevronsUpDown size={16} />
            </button>
          </Tooltip>
          {tabListOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setTabListOpen(false)} />
              <div className={`menu-pop absolute right-0 top-full z-[61] mt-0 w-72 max-h-[60vh] overflow-y-auto py-1 rounded-b-md border shadow-xl text-sm ${tc('bg-slate-800 border-slate-700 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}>
                {docs.map((doc) => (
                  <button key={doc.doc_id}
                    onClick={() => { setActiveDoc(doc.doc_id); setTabListOpen(false) }}
                    title={doc.file_path}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${doc.doc_id === activeDocId ? tc('bg-slate-700', 'bg-gray-100') : ''} ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
                    {loadingDocId === doc.doc_id
                      ? <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
                      : <FileText size={13} className={`shrink-0 ${doc.dirty ? 'text-amber-400' : tc('text-slate-500', 'text-gray-400')}`} />}
                    <span className="truncate flex-1">{doc.file_name}</span>
                    {doc.doc_id === activeDocId && <span className="text-[10px] text-blue-400 shrink-0">activo</span>}
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
          <div className={`menu-pop fixed z-[61] min-w-[200px] py-1 rounded-md border shadow-xl text-sm ${tc('bg-slate-800 border-slate-700 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
            style={{ left: Math.min(tabMenu.x, window.innerWidth - 220), top: Math.min(tabMenu.y, window.innerHeight - 120) }}>
            <button onClick={() => { window.api.showInFolder(tabMenu.path); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <FolderOpen size={14} className={tc('text-slate-400', 'text-gray-500')} /> Abrir ubicación del archivo
            </button>
            <button onClick={() => { navigator.clipboard.writeText(tabMenu.path).catch(() => {}); showToast('Ruta copiada', 'success'); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <FileText size={14} className={tc('text-slate-400', 'text-gray-500')} /> Copiar ruta
            </button>
            <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
            <button onClick={() => { requestCloseDoc(tabMenu.docId); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <X size={14} className={tc('text-slate-400', 'text-gray-500')} /> Cerrar pestaña
            </button>
            <button disabled={docs.length < 2} onClick={() => { docs.filter((d) => d.doc_id !== tabMenu.docId).forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 disabled:opacity-30 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <X size={14} className={tc('text-slate-400', 'text-gray-500')} /> Cerrar las demás
            </button>
            <button onClick={() => { const i = docs.findIndex((d) => d.doc_id === tabMenu.docId); docs.slice(i + 1).forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <X size={14} className={tc('text-slate-400', 'text-gray-500')} /> Cerrar a la derecha
            </button>
            <button onClick={() => { docs.forEach((d) => requestCloseDoc(d.doc_id)); setTabMenu(null) }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-red-400 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <Trash2 size={14} /> Cerrar todas
            </button>
          </div>
        </>
      )}
    </>
  )
}
