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

  const ATAJOS: Array<[string, string]> = [
    ['Ctrl+O', 'abrir'], ['Ctrl+rueda', 'zoom'], ['Ctrl+K', 'comandos'], ['F1', 'atajos'],
  ]

  const CAPABILITIES: Array<{ icon: typeof Ruler; title: string; text: string }> = [
    { icon: Highlighter, title: 'Marcá sin entregar', text: 'Resaltá, anotá y dibujá. El archivo en disco no cambia hasta Ctrl+S.' },
    { icon: Ruler, title: 'Medí y contá', text: 'Calibrá la escala, medí distancias y agrupá símbolos.' },
    { icon: GitCompare, title: 'Compará revisiones', text: 'Dos versiones lado a lado, con las diferencias de texto.' },
  ]

  return (
    <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center overflow-auto bg-surface p-6"
      onDragOver={onDragOver} onDrop={onDrop}>
      <div className="w-full max-w-3xl space-y-7">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-token-lg flex items-center justify-center bg-accent/10 text-accent">
            <FileText size={26} className="icon-thin" />
          </div>
          <h2 className="mt-4 text-display font-semibold text-fg tracking-tight">PDF Master</h2>
          <p className="mt-1 text-base text-muted">Arrastrá un PDF acá para abrirlo</p>

          <div className="mt-4 flex items-center justify-center gap-2">
            <button onClick={handleOpen}
              className="flex items-center gap-2 px-4 h-9 text-base rounded-token bg-accent text-on-accent shadow-token-sm hover:brightness-110 active:brightness-95 transition-[filter] duration-fast ease-token">
              <FolderOpen size={16} /> Abrir PDF
            </button>
            {lastSession && (
              <button onClick={() => { reopenLastSession() }}
                className="flex items-center gap-2 px-4 h-9 text-base rounded-token border border-border bg-panel text-fg shadow-token-sm hover:bg-hover transition-colors duration-fast ease-token">
                <History size={16} /> Reabrir última sesión ({lastSession.docs.length})
              </button>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-mini text-muted">
            {ATAJOS.map(([tecla, que]) => (
              <span key={tecla} className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded-token-sm border border-border bg-active text-micro text-fg">{tecla}</kbd>
                {que}
              </span>
            ))}
          </div>
          <p className="mt-3 text-mini text-fg">Nunca se guarda solo. Ctrl+S escribe el PDF.</p>
        </div>

        {visibleRecents.length > 0 && (
          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-muted mb-2">Recientes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleRecents.map((entry) => {
                const name = entry.path.split(/[\\/]/).pop()
                const progress = entry.lastPage != null && entry.pageCount && entry.lastPage > 0
                  ? `pág. ${entry.lastPage + 1}/${entry.pageCount}`
                  : entry.pageCount ? `${entry.pageCount} pág.` : null
                return (
                  <button key={entry.path} onClick={() => handleOpenRecent(entry)} title={entry.path}
                    className="flex items-center gap-2.5 p-2 rounded-token border border-border bg-panel shadow-token-sm hover:border-accent/50 hover:bg-hover transition-colors duration-fast ease-token text-left">
                    <div className="w-9 h-11 shrink-0 rounded-token-sm border border-border bg-paper overflow-hidden flex items-center justify-center">
                      {entry.thumb
                        ? <img src={entry.thumb} alt="" className="w-full h-full object-cover object-top" draggable={false} />
                        : <FileText size={16} className="text-muted icon-thin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-ui text-fg truncate leading-tight">{name}</div>
                      <div className="text-micro text-muted truncate mt-0.5">
                        {formatWhen(entry.lastOpened)}
                        {progress && <> · <span className="text-fg">{progress}</span></>}
                      </div>
                    </div>
                    {entry.pinned && <Pin size={12} className="text-fg shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {folders.length > 0 && (
          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-muted mb-2">Carpetas frecuentes</p>
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <button key={f.dir} onClick={() => handleOpenFolder(f.dir)} title={f.dir}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-token border border-border bg-panel text-mini text-fg hover:border-accent/50 hover:bg-hover transition-colors duration-fast ease-token">
                  <Folder size={14} className="text-muted" />
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  <span className="text-muted">{f.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-5 border-t border-border">
          {CAPABILITIES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-2.5 p-2">
              <Icon size={16} className="text-accent shrink-0 mt-0.5" strokeWidth={1.75} />
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
