import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { PanelLeftClose, FileText, BookOpen, Bookmark, Trash2, MessageSquare } from 'lucide-react'
import type { OutlineItem } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'

function OutlineTree({ items, depth = 0, onJump }: { items: OutlineItem[]; depth?: number; onJump: (page: number) => void }) {
  return (
    <>
      {items.map((item, idx) => (
        <div key={idx}>
          <button
            onClick={() => onJump(item.page)}
            className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded px-2 py-1 transition-colors truncate"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={item.title}
          >
            {item.title}
          </button>
          {item.children && item.children.length > 0 && (
            <OutlineTree items={item.children} depth={depth + 1} onJump={onJump} />
          )}
        </div>
      ))}
    </>
  )
}

export default function ThumbnailPanel() {
  const store = usePdfStore()
  const { docs, activeDocId, sidebarOpen, toggleSidebar, setPage, addThumbnail, bookmarks, removeBookmark } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'pages' | 'outline' | 'bookmarks' | 'annotations'>('pages')

  useEffect(() => {
    if (!activeDoc || !sidebarOpen) return
    const loadThumbs = async () => {
      const start = Math.max(0, activeDoc.currentPage - 3)
      const end = Math.min(activeDoc.page_count, activeDoc.currentPage + 8)
      for (let i = start; i < end; i++) {
        if (activeDoc.thumbnails.has(i)) continue
        try {
          const res = await fetch(`${API_BASE}/pdf/thumbnail/${activeDoc.doc_id}/${i}`)
          if (res.ok) {
            const data = await res.json()
            addThumbnail(activeDoc.doc_id, i, data.image_base64)
          }
        } catch (e) {
          console.error('Error loading thumbnail', e)
        }
      }
    }
    loadThumbs()
  }, [activeDoc, sidebarOpen, activeDoc?.currentPage])

  useEffect(() => {
    if (!scrollRef.current || !activeDoc) return
    const el = scrollRef.current.querySelector(`[data-page="${activeDoc.currentPage}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeDoc?.currentPage])

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="w-8 bg-slate-800 border-r border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors shrink-0 group"
        title="Mostrar páginas"
      >
        <PanelLeftClose size={16} className="text-slate-500 rotate-180 group-hover:text-slate-300" />
      </button>
    )
  }

  if (!activeDoc) {
    return (
      <div className="w-52 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Páginas</span>
          <button onClick={toggleSidebar} className="p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors">
            <PanelLeftClose size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-sm text-center px-4">Abre un PDF</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-52 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('pages')}
            className={`p-1 rounded transition-colors ${tab === 'pages' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Páginas"
          >
            <FileText size={14} />
          </button>
          <button
            onClick={() => setTab('outline')}
            className={`p-1 rounded transition-colors ${tab === 'outline' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Outline"
          >
            <BookOpen size={14} />
          </button>
          <button
            onClick={() => setTab('bookmarks')}
            className={`p-1 rounded transition-colors ${tab === 'bookmarks' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Marcadores"
          >
            <Bookmark size={14} />
          </button>
          <button
            onClick={() => setTab('annotations')}
            className={`p-1 rounded transition-colors ${tab === 'annotations' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Anotaciones"
          >
            <MessageSquare size={14} />
          </button>
        </div>
        <button onClick={toggleSidebar} className="p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors">
          <PanelLeftClose size={14} />
        </button>
      </div>

      {tab === 'pages' && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
          {Array.from({ length: activeDoc.page_count }, (_, i) => (
            <button
              key={i}
              data-page={i}
              onClick={() => setPage(activeDoc.doc_id, i)}
              className={`w-full rounded border transition-all ${
                activeDoc.currentPage === i
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'
              }`}
            >
              {activeDoc.thumbnails.has(i) ? (
                <img
                  src={activeDoc.thumbnails.get(i)}
                  alt={`Página ${i + 1}`}
                  className="w-full h-auto rounded"
                  draggable={false}
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-slate-900 flex items-center justify-center rounded">
                  <span className="text-xs text-slate-600">{i + 1}</span>
                </div>
              )}
              <div className="text-center text-[10px] text-slate-400 py-1">{i + 1}</div>
            </button>
          ))}
        </div>
      )}
      {tab === 'outline' && (
        <div className="flex-1 overflow-y-auto p-2">
          {activeDoc.outline.length > 0 ? (
            <OutlineTree items={activeDoc.outline} onJump={(page) => setPage(activeDoc.doc_id, page)} />
          ) : (
            <p className="text-slate-500 text-xs text-center mt-4">Este PDF no tiene outline</p>
          )}
        </div>
      )}
      {tab === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {bookmarks.filter((b) => b.docId === activeDoc.doc_id).length > 0 ? (
            bookmarks.filter((b) => b.docId === activeDoc.doc_id).map((b) => (
              <div key={b.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => setPage(activeDoc.doc_id, b.page)}
                  className="flex-1 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded px-2 py-1 transition-colors truncate"
                >
                  {b.label}
                </button>
                <button
                  onClick={() => removeBookmark(b.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-opacity"
                  aria-label="Eliminar marcador"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-xs text-center mt-4">Sin marcadores</p>
          )}
        </div>
      )}
      {tab === 'annotations' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeDoc.annotations.length > 0 ? (
            activeDoc.annotations.map((ann) => (
              <div key={ann.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => {
                    setPage(activeDoc.doc_id, ann.page)
                    store.selectAnnotation(activeDoc.doc_id, ann.id)
                  }}
                  className="flex-1 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded px-2 py-1 transition-colors truncate"
                  title={ann.text || ann.type}
                >
                  <span className="capitalize text-slate-500 mr-1">{ann.type}</span>
                  <span className="truncate">{ann.text || `Pág. ${ann.page + 1}`}</span>
                </button>
                <button
                  onClick={() => store.deleteAnnotation(activeDoc.doc_id, ann.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/50 text-red-400 transition-opacity"
                  aria-label="Eliminar anotación"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-xs text-center mt-4">Sin anotaciones</p>
          )}
        </div>
      )}
    </div>
  )
}
