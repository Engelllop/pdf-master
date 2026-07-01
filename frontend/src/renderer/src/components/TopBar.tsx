import { useState, useRef, useEffect } from 'react'
import {
  FolderOpen, Save, FilePlus, Mail, MonitorPlay, X, Clock,
  PanelLeft, Sun, Moon, HelpCircle, Undo2, Redo2,
} from 'lucide-react'
import Tooltip from './Tooltip'
import TabStrip from './TabStrip'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { openDocument } from '../lib/openDocument'
import { requestCloseDoc } from '../lib/closeDocument'

import { apiFetch } from '../lib/api'

export default function TopBar() {
  const {
    docs, activeDocId, sidebarOpen, toggleSidebar, addDoc,
    showToast, setDocDirty, setSaveStatus, undo, redo, theme, setTheme,
  } = useStoreSlice(
    'docs', 'activeDocId', 'sidebarOpen', 'toggleSidebar', 'addDoc',
    'showToast', 'setDocDirty', 'setSaveStatus', 'undo', 'redo', 'theme', 'setTheme',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const toastActionError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    window.api.logError(`[topbar] ${err instanceof Error ? err.stack || msg : msg}`).catch(() => {})
    showToast('Error: ' + msg, 'error')
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOpen = async () => {
    const filePath = await window.api.openFile()
    if (filePath) await openDocument(filePath)
  }

  const handleSave = async () => {
    if (!activeDoc) return
    setSaveStatus('saving')
    try {
      const embedRes = await apiFetch(`/pdf/embed/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (!embedRes.ok) throw new Error('Error al embeber anotaciones')
      const res = await apiFetch(`/pdf/save/${activeDoc.doc_id}`, { method: 'POST' })
      if (res.ok) {
        await apiFetch(`/pdf/annotations/${activeDoc.doc_id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations: activeDoc.annotations }),
        })
        setDocDirty(activeDoc.doc_id, false)
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
    try {
      const res = await apiFetch(`/pdf/save/${activeDoc.doc_id}?output_path=${encodeURIComponent(newPath)}`, { method: 'POST' })
      showToast(res.ok ? 'Guardado como ' + newPath.split(/[\\/]/).pop() : 'Error al guardar', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
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
    showToast('Cliente de email abierto', 'info')
  }

  const handleNewWindow = () => { window.api.newWindow() }

  const recentFiles = (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[] }
    catch { return [] }
  })()

  // Global shortcuts dispatched from App.tsx
  useEffect(() => {
    const onSave = () => handleSave()
    const onOpen = () => handleOpen()
    window.addEventListener('app:shortcut-save', onSave)
    window.addEventListener('app:shortcut-open', onOpen)
    return () => {
      window.removeEventListener('app:shortcut-save', onSave)
      window.removeEventListener('app:shortcut-open', onOpen)
    }
  }, [activeDoc])

  const MenuItem = ({ icon: Icon, label, onClick, disabled = false }: any) => (
    <button onClick={() => { onClick(); setMenuOpen(false) }} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'text-fg hover:bg-hover'}`}>
      {Icon && <Icon size={14} className="text-muted" strokeWidth={1.75} />} <span>{label}</span>
    </button>
  )

  const rightBtn = 'p-2 h-full transition-colors text-muted hover:text-fg hover:bg-hover disabled:opacity-30'

  return (
    <div className="app-drag h-10 border-b border-border flex items-center bg-toolbar shrink-0 select-none pr-[140px]">
      <div className="app-no-drag relative" ref={menuRef}>
        <button onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 h-10 bg-fg text-toolbar hover:opacity-90 text-sm font-medium transition-opacity shrink-0">
          <FolderOpen size={15} /> <span>Archivo</span>
        </button>
        {menuOpen && (
          <div className="menu-pop absolute top-full left-0 z-50 w-56 border border-border rounded-token shadow-token py-1 bg-panel">
            <MenuItem icon={FolderOpen} label="Abrir..." onClick={handleOpen} />
            <MenuItem icon={FilePlus} label="Nuevo PDF en blanco" onClick={handleNewBlank} />
            <div className="h-px my-1 bg-border" />
            <MenuItem icon={Save} label="Guardar" onClick={handleSave} disabled={!activeDoc} />
            <MenuItem icon={FilePlus} label="Guardar como..." onClick={handleSaveAs} disabled={!activeDoc} />
            <MenuItem icon={Mail} label="Compartir por email" onClick={handleShareEmail} disabled={!activeDoc} />
            <div className="h-px my-1 bg-border" />
            <MenuItem icon={MonitorPlay} label="Nueva ventana" onClick={handleNewWindow} />
            <MenuItem icon={X} label="Cerrar documento" onClick={() => activeDoc && requestCloseDoc(activeDoc.doc_id)} disabled={!activeDoc} />
            {recentFiles.length > 0 && (
              <>
                <div className="h-px my-1 bg-border" />
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted">Recientes</div>
                {recentFiles.slice(0, 10).map((path, i) => (
                  <button key={i} onClick={() => { openDocument(path); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs truncate text-fg hover:bg-hover" title={path}>
                    <Clock size={12} className="inline mr-1 text-muted" />
                    {path.split(/[\\/]/).pop()}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <TabStrip />

      <div className="app-no-drag flex items-center h-full">
        <Tooltip content="Deshacer" shortcut="Ctrl+Z">
          <button onClick={undo} aria-label="Deshacer" className={rightBtn}><Undo2 size={16} /></button>
        </Tooltip>
        <Tooltip content="Rehacer" shortcut="Ctrl+Y">
          <button onClick={redo} aria-label="Rehacer" className={rightBtn}><Redo2 size={16} /></button>
        </Tooltip>
        <div className="w-px h-5 mx-1 bg-border" />
        <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambiar tema" className={rightBtn}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
        <Tooltip content="Atajos de teclado" shortcut="F1">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-shortcuts'))} aria-label="Atajos" className={rightBtn}><HelpCircle size={16} /></button>
        </Tooltip>
        <Tooltip content={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'} shortcut="Ctrl+Shift+L">
          <button onClick={toggleSidebar} aria-label="Panel de páginas"
            className={`p-2 h-full transition-colors hover:bg-hover ${sidebarOpen ? 'text-accent' : 'text-muted'}`}>
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
