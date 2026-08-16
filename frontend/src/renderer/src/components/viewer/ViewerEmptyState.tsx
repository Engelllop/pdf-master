import { useState } from 'react'
import { FolderOpen, FileText, Folder, History, Highlighter, Ruler, GitCompare, Pin } from 'lucide-react'
import { openDocument } from '../../lib/openDocument'
import { loadRecents, frequentFolders, type RecentEntry } from '../../lib/recents'
import { loadLastSession, reopenLastSession } from '../../lib/session'
import { formatWhen } from '../../lib/format'
import { usePdfStore } from '../../store/usePdfStore'

/** Portada del visor cuando no hay documento abierto: zona de arrastre, acciones de
 * apertura, recientes con miniatura y progreso, carpetas frecuentes y un recordatorio
 * de las funciones que de otro modo nadie descubre. */
export default function ViewerEmptyState({ containerRef, onDragOver, onDrop }: {
  containerRef: React.RefObject<HTMLDivElement | null>
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [recents] = useState<RecentEntry[]>(() => loadRecents())
  const [folders] = useState(() => frequentFolders())
  const [lastSession] = useState(() => loadLastSession())

  const handleOpen = async () => {
    const paths = await window.api.openFiles()
    if (!paths?.length) return
    let lastId: string | null = null
    for (const p of paths) lastId = (await openDocument(p, { activate: false })) ?? lastId
    if (lastId) usePdfStore.getState().setActiveDoc(lastId)
  }

  const handleOpenRecent = async (entry: RecentEntry) => {
    const id = await openDocument(entry.path)
    if (id && entry.lastPage && entry.lastPage > 0) usePdfStore.getState().setPage(id, entry.lastPage)
  }

  const handleOpenFolder = async (dir: string) => {
    const paths = await window.api.openFiles(undefined, dir)
    if (!paths?.length) return
    let lastId: string | null = null
    for (const p of paths) lastId = (await openDocument(p, { activate: false })) ?? lastId
    if (lastId) usePdfStore.getState().setActiveDoc(lastId)
  }

  const visibleRecents = recents.slice(0, 6)

  const CAPABILITIES: Array<{ icon: typeof Ruler; title: string; text: string }> = [
    { icon: Highlighter, title: 'Marcá sin entregar', text: 'Resaltá, anotá y dibujá. El archivo en disco no cambia hasta Ctrl+S.' },
    { icon: Ruler, title: 'Medí y contá', text: 'Calibrá la escala, medí distancias y agrupá símbolos.' },
    { icon: GitCompare, title: 'Compará revisiones', text: 'Dos versiones lado a lado, con las diferencias de texto.' },
  ]

  return (
    <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center overflow-auto bg-surface p-6"
      onDragOver={onDragOver} onDrop={onDrop}>
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border border-dashed border-border bg-active">
            <FileText size={28} className="text-muted" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-fg">PDF Master</h2>
            <p className="mt-1 text-base text-muted">Arrastrá un PDF acá para abrirlo</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button onClick={handleOpen}
              className="flex items-center gap-2 px-4 py-2 text-base rounded-lg bg-fg text-toolbar hover:opacity-90 transition-opacity">
              <FolderOpen size={15} /> Abrir PDF
            </button>
            {lastSession && (
              <button onClick={() => { reopenLastSession() }}
                className="flex items-center gap-2 px-4 py-2 text-base rounded-lg border border-border text-fg hover:bg-hover transition-colors">
                <History size={15} /> Reabrir última sesión ({lastSession.docs.length})
              </button>
            )}
          </div>
          <p className="text-mini text-muted">Ctrl+O abrir · Ctrl+rueda zoom · F1 atajos</p>
          <p className="text-mini text-fg">Nunca se guarda solo. Ctrl+S escribe el PDF.</p>
        </div>

        {visibleRecents.length > 0 && (
          <div>
            <p className="text-mini font-medium text-fg mb-2">Recientes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleRecents.map((entry) => {
                const name = entry.path.split(/[\\/]/).pop()
                const progress = entry.lastPage != null && entry.pageCount && entry.lastPage > 0
                  ? `pág. ${entry.lastPage + 1}/${entry.pageCount}`
                  : entry.pageCount ? `${entry.pageCount} pág.` : null
                return (
                  <button key={entry.path} onClick={() => handleOpenRecent(entry)} title={entry.path}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-panel hover:bg-hover transition-colors text-left">
                    <div className="w-9 h-11 shrink-0 rounded border border-border bg-white overflow-hidden flex items-center justify-center">
                      {entry.thumb
                        ? <img src={entry.thumb} alt="" className="w-full h-full object-cover object-top" draggable={false} />
                        : <FileText size={15} className="text-muted" strokeWidth={1.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-ui text-fg truncate leading-tight">{name}</div>
                      <div className="text-micro text-muted truncate mt-0.5">
                        {formatWhen(entry.lastOpened)}
                        {progress && <> · <span className="text-fg">{progress}</span></>}
                      </div>
                    </div>
                    {entry.pinned && <Pin size={11} className="text-fg shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {folders.length > 0 && (
          <div>
            <p className="text-mini font-medium text-fg mb-2">Carpetas frecuentes</p>
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <button key={f.dir} onClick={() => handleOpenFolder(f.dir)} title={f.dir}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-mini text-fg hover:bg-hover transition-colors">
                  <Folder size={13} className="text-muted" />
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  <span className="text-muted">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border">
          {CAPABILITIES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-2.5 p-2">
              <Icon size={15} className="text-muted shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <div className="text-mini font-medium text-fg">{title}</div>
                <div className="text-micro text-muted leading-snug mt-0.5">{text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
