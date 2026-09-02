import { useState, useRef, useEffect } from 'react'
import {
  FolderOpen, Save, SaveAll, FilePlus, Mail, MonitorPlay, X, ChevronDown,
  Printer, Pin, PinOff, Trash2, FileText, Merge, History, Search, Folder,
} from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { usePdfStore } from '../store/usePdfStore'
import { openDocument } from '../lib/openDocument'
import { requestCloseDoc } from '../lib/closeDocument'
import {
  loadRecents, setRecentPinned, removeRecent, clearUnpinnedRecents,
  frequentFolders, type RecentEntry, type FrequentFolder,
} from '../lib/recents'
import { loadLastSession, reopenLastSession, type SessionSnapshot } from '../lib/session'
import { formatWhen } from '../lib/format'
import { contieneSinTildes } from '../lib/texto'
import { apiFetch } from '../lib/api'
import { saveDocument } from '../lib/saveDocument'

// Menú "Archivo": acciones a la izquierda + recientes con miniatura, búsqueda y
// carpetas frecuentes a la derecha. Se abre desde su propio botón o desde el logo
// del TopBar (evento 'app:file-menu'). También registra el handler global de Ctrl+S.
export default function FileMenu() {
  const { docs, activeDocId, addDoc, showToast, setSaveStatus } = useStoreSlice(
    'docs', 'activeDocId', 'addDoc', 'showToast', 'setSaveStatus',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [open, setOpen] = useState(false)
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [folders, setFolders] = useState<FrequentFolder[]>([])
  const [lastSession, setLastSession] = useState<SessionSnapshot | null>(null)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setRecents(loadRecents())
    setFolders(frequentFolders())
    setLastSession(loadLastSession())
    setQuery('')
    setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onToggle = () => setOpen((o) => !o)
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('app:file-menu', onToggle)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('app:file-menu', onToggle)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (searchRef.current && searchRef.current.contains(e.target as Node)) return
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])]
      if (items.length === 0) return
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      e.preventDefault()
      if (i === -1) {
        items[e.key === 'ArrowUp' ? items.length - 1 : 0].focus()
        return
      }
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      items[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const toastActionError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    window.api.logError(`[filemenu] ${err instanceof Error ? err.stack || msg : msg}`).catch(() => {})
    showToast('Error: ' + msg, 'error')
  }

  const openMany = async (paths: string[]) => {
    let lastId: string | null = null
    for (const p of paths) lastId = (await openDocument(p, { activate: false })) ?? lastId
    if (lastId) usePdfStore.getState().setActiveDoc(lastId)
  }

  const handleOpen = async () => {
    const paths = await window.api.openFiles()
    if (paths?.length) await openMany(paths)
  }

  const handleOpenFromFolder = async (dir: string) => {
    setOpen(false)
    const paths = await window.api.openFiles(undefined, dir)
    if (paths?.length) await openMany(paths)
  }

  const handleReopenSession = async () => {
    const opened = await reopenLastSession()
    showToast(opened > 0 ? `Sesión restaurada (${opened} documento${opened === 1 ? '' : 's'})` : 'No se pudo restaurar la sesión', opened > 0 ? 'success' : 'error')
  }

  const handleOpenRecent = async (entry: RecentEntry) => {
    setOpen(false)
    const id = await openDocument(entry.path)
    if (id && entry.lastPage && entry.lastPage > 0) usePdfStore.getState().setPage(id, entry.lastPage)
  }

  const handleSave = async () => {
    const { docs, activeDocId } = usePdfStore.getState()
    const doc = docs.find((d) => d.doc_id === activeDocId)
    if (!doc) return
    // Las imágenes SÍ se incrustan desde 28ce2e2 (`embed_annotations` tiene rama
    // `image`); el aviso que pedía confirmación aquí llevaba tiempo mintiendo.
    setSaveStatus('saving')
    try {
      if (await saveDocument(doc.doc_id)) {
        setSaveStatus('saved')
        showToast('Guardado con anotaciones en PDF', 'success')
      } else {
        setSaveStatus('idle')
        showToast('Error al guardar', 'error')
      }
    } catch (err) {
      setSaveStatus('idle')
      toastActionError(err)
    }
  }

  const handleSaveAs = async () => {
    if (!activeDoc) return
    const newPath = await window.api.saveFile()
    if (!newPath) return
    setSaveStatus('saving')
    try {
      const ok = await saveDocument(activeDoc.doc_id, newPath)
      setSaveStatus(ok ? 'saved' : 'idle')
      showToast(ok ? 'Guardado como ' + newPath.split(/[\\/]/).pop() : 'Error al guardar', ok ? 'success' : 'error')
    } catch (err) { setSaveStatus('idle'); toastActionError(err) }
  }

  const handleNewBlank = async () => {
    const outputPath = await window.api.saveFile({ defaultPath: 'nuevo.pdf' })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/create-blank`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_path: outputPath }),
      })
      if (res.ok) { addDoc(await res.json()); showToast('PDF en blanco creado', 'success') }
      else showToast('Error al crear PDF', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleShareEmail = () => {
    if (!activeDoc) return
    window.open(`mailto:?subject=${encodeURIComponent(`PDF: ${activeDoc.file_name}`)}&body=${encodeURIComponent(`Adjunto: ${activeDoc.file_path}`)}`)
    showToast('Se abrió el email con la ruta. El PDF no se adjunta.', 'info')
  }

  // Ctrl+S / botón Guardar de la cinta llegan por este evento global.
  useEffect(() => {
    const onSave = () => handleSave()
    const onOpen = () => handleOpen()
    window.addEventListener('app:shortcut-save', onSave)
    window.addEventListener('app:shortcut-open', onOpen)
    return () => {
      window.removeEventListener('app:shortcut-save', onSave)
      window.removeEventListener('app:shortcut-open', onOpen)
    }
  }, [])

  const Item = ({ icon: Icon, label, shortcut, onClick, disabled = false }: {
    icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
    label: string
    shortcut?: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <button role="menuitem" onClick={() => { onClick(); setOpen(false) }} disabled={disabled}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-ui text-left rounded-token text-fg transition-colors duration-fast ease-token hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
      <Icon size={16} className="text-muted shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <kbd className="shrink-0 px-1.5 py-0.5 rounded-token-sm border border-border bg-active text-micro text-muted tabular">{shortcut}</kbd>
      )}
    </button>
  )

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-2 pt-3 pb-1 text-micro font-semibold uppercase tracking-wider text-muted">{children}</div>
  )

  const RecentRow = ({ entry }: { entry: RecentEntry }) => {
    const name = entry.path.split(/[\\/]/).pop()
    const dirName = entry.path.replace(/[\\/][^\\/]*$/, '').split(/[\\/]/).pop()
    const pageBadge = entry.lastPage != null && entry.pageCount && entry.lastPage > 0
      ? `pág. ${entry.lastPage + 1}/${entry.pageCount}`
      : entry.pageCount ? `${entry.pageCount} pág.` : null
    return (
      <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-token hover:bg-hover cursor-pointer"
        title={entry.path}
        onClick={() => handleOpenRecent(entry)}>
        <div className="w-9 h-11 shrink-0 rounded-token-sm ring-1 ring-border shadow-token-sm bg-paper overflow-hidden flex items-center justify-center">
          {entry.thumb
            ? <img src={entry.thumb} alt="" className="w-full h-full object-cover object-top" draggable={false} />
            : <FileText size={16} className="text-muted icon-thin" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-ui text-fg truncate leading-tight">{name}</div>
          <div className="text-micro text-muted truncate mt-0.5">
            {dirName} · {formatWhen(entry.lastOpened)}
            {pageBadge && <> · <span className="text-fg">{pageBadge}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-fast ease-token">
          <button title={entry.pinned ? 'Desfijar' : 'Fijar'}
            onClick={(e) => { e.stopPropagation(); setRecentPinned(entry.path, !entry.pinned); setRecents(loadRecents()) }}
            className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover">
            {entry.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button title="Abrir ubicación"
            onClick={(e) => { e.stopPropagation(); window.api.showInFolder(entry.path) }}
            className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover">
            <FolderOpen size={12} />
          </button>
          <button title="Quitar de recientes"
            onClick={(e) => { e.stopPropagation(); removeRecent(entry.path); setRecents(loadRecents()); setFolders(frequentFolders()) }}
            className="p-1 rounded-token-sm text-muted hover:text-danger hover:bg-hover">
            <X size={12} />
          </button>
        </div>
        {entry.pinned && <Pin size={12} className="text-fg shrink-0 group-hover:hidden" />}
      </div>
    )
  }

  const FolderRow = ({ folder }: { folder: FrequentFolder }) => (
    <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-token hover:bg-hover cursor-pointer"
      title={`${folder.dir}\nClic: abrir un PDF de esta carpeta`}
      onClick={() => handleOpenFromFolder(folder.dir)}>
      <div className="w-9 h-8 shrink-0 rounded-token-sm bg-hover flex items-center justify-center">
        <Folder size={16} className="text-muted" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-ui text-fg truncate leading-tight">{folder.name}</div>
        <div className="text-micro text-muted truncate mt-0.5">{folder.count} PDF{folder.count === 1 ? '' : 's'} abiertos desde aquí</div>
      </div>
      <button title="Abrir en el Explorador"
        onClick={(e) => { e.stopPropagation(); window.api.openFolder(folder.dir) }}
        className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-fast ease-token">
        <FolderOpen size={12} />
      </button>
    </div>
  )

  const q = query.trim()
  const matches = (e: RecentEntry) => !q || contieneSinTildes(e.path, q)
  const pinned = recents.filter((r) => r.pinned && matches(r))
  const unpinned = recents.filter((r) => !r.pinned && matches(r))
  const visibleFolders = folders.filter((f) => !q || contieneSinTildes(f.dir, q))
  const nothingFound = q && pinned.length === 0 && unpinned.length === 0 && visibleFolders.length === 0

  return (
    <div className="relative h-full" ref={menuRef}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className={`flex items-center gap-1 px-3 h-full text-ui font-medium transition-colors ${open ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover'}`}>
        Archivo <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="menu-pop absolute top-full left-0 z-dropdown flex w-[640px] max-w-[92vw] border border-border rounded-token shadow-token-lg bg-panel overflow-hidden">
          <div role="menu" aria-label="Archivo" className="w-56 shrink-0 p-1.5 border-r border-border">
            <Item icon={FolderOpen} label="Abrir…" shortcut="Ctrl+O" onClick={handleOpen} />
            <Item icon={History} label={lastSession ? `Reabrir última sesión (${lastSession.docs.length})` : 'Reabrir última sesión'}
              onClick={handleReopenSession} disabled={!lastSession} />
            <Item icon={FilePlus} label="Nuevo PDF en blanco" onClick={handleNewBlank} />
            <div className="h-px my-1 bg-border" />
            <Item icon={Save} label="Guardar" shortcut="Ctrl+S" onClick={handleSave} disabled={!activeDoc} />
            <Item icon={SaveAll} label="Guardar como…" onClick={handleSaveAs} disabled={!activeDoc} />
            <Item icon={Printer} label="Imprimir…" shortcut="Ctrl+P" onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-print'))} disabled={!activeDoc} />
            <div className="h-px my-1 bg-border" />
            <Item icon={Merge} label="Combinar PDFs…" onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-merge'))} disabled={!activeDoc} />
            <Item icon={Mail} label="Enviar ruta por email" onClick={handleShareEmail} disabled={!activeDoc} />
            <div className="h-px my-1 bg-border" />
            <Item icon={MonitorPlay} label="Nueva ventana" onClick={() => window.api.newWindow()} />
            <Item icon={X} label="Cerrar documento" shortcut="Ctrl+W" onClick={() => activeDoc && requestCloseDoc(activeDoc.doc_id)} disabled={!activeDoc} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col max-h-[480px]">
            <div className="p-2 pb-1 shrink-0">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-token bg-hover border border-transparent focus-within:border-border">
                <Search size={14} className="text-muted shrink-0" />
                <input ref={searchRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar en recientes…"
                  className="flex-1 min-w-0 bg-transparent text-mini text-fg placeholder:text-muted focus:outline-none" />
                {query && (
                  <button onClick={() => setQuery('')} className="text-muted hover:text-fg shrink-0"><X size={12} /></button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 pb-1.5">
              {pinned.length > 0 && (
                <>
                  <SectionLabel>Fijados</SectionLabel>
                  {pinned.map((r) => <RecentRow key={r.path} entry={r} />)}
                </>
              )}
              <div className="flex items-baseline justify-between">
                <SectionLabel>Recientes</SectionLabel>
                {unpinned.length > 0 && !q && (
                  <button onClick={() => { clearUnpinnedRecents(); setRecents(loadRecents()); setFolders(frequentFolders()) }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-token-sm text-micro text-muted transition-colors duration-fast ease-token hover:text-danger hover:bg-danger/10">
                    <Trash2 size={12} /> Limpiar
                  </button>
                )}
              </div>
              {recents.length === 0 && (
                <div className="px-2 py-6 text-center text-mini text-muted">
                  Aún no hay archivos recientes.<br />También puedes arrastrar PDFs a la ventana.
                </div>
              )}
              {nothingFound && (
                <div className="px-2 py-6 text-center text-mini text-muted">Sin resultados para “{query}”.</div>
              )}
              {unpinned.map((r) => <RecentRow key={r.path} entry={r} />)}
              {visibleFolders.length > 0 && (
                <>
                  <SectionLabel>Carpetas frecuentes</SectionLabel>
                  {visibleFolders.map((f) => <FolderRow key={f.dir} folder={f} />)}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
