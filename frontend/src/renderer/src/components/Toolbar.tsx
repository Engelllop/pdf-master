import { usePdfStore } from '../store/usePdfStore'
import {
  FolderOpen, Save, FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw as ResetZoom,
  Search, PanelLeft, PanelRight, Maximize2, AlignVerticalJustifyCenter,
  X, ChevronDown, ChevronUp, Merge, Undo2, Redo2,
  Sun, Moon, BookOpen, ArrowLeft, ArrowRight, Printer,
  Mail, FileDown, Clock, GitCompare,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import Tooltip from './Tooltip'

const API_BASE = 'http://localhost:8745'

export default function Toolbar() {
  const store = usePdfStore()
  const {
    docs, activeDocId, sidebarOpen, toolsPanelOpen,
    toggleSidebar, toggleToolsPanel, addDoc, closeDoc,
    setActiveDoc, setPage, nextPage, prevPage, setZoom,
    setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    setAnnotations, setOutline, updateDocPageCount, updateDocPageSizes, showToast,
    setDocDirty, undo, redo, invalidatePageCache, invalidateThumbnails, setSaveStatus, viewMode, setViewMode,
    theme, setTheme, readingMode, toggleReadingMode, goBack, goForward, navHistoryIndex, navHistory,
    toggleCompareMode, setCompareDoc, compareMode, compareDocId,
  } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [searchInput, setSearchInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus()
  }, [showSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Global shortcuts from App.tsx
  useEffect(() => {
    const onSave = () => handleSave()
    const onOpen = () => handleOpen()
    const onSearch = () => setShowSearch(true)
    window.addEventListener('app:shortcut-save', onSave)
    window.addEventListener('app:shortcut-open', onOpen)
    window.addEventListener('app:shortcut-search', onSearch)
    return () => {
      window.removeEventListener('app:shortcut-save', onSave)
      window.removeEventListener('app:shortcut-open', onOpen)
      window.removeEventListener('app:shortcut-search', onSearch)
    }
  }, [activeDoc])

  const openPath = async (filePath: string, password?: string) => {
    try {
      const res = await fetch(`${API_BASE}/pdf/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath, password }),
      })
      if (res.status === 401) {
        const pwd = prompt('Este PDF está protegido con contraseña. Ingrésala:')
        if (pwd) {
          await openPath(filePath, pwd)
        } else {
          showToast('Se requiere contraseña para abrir el PDF', 'error')
        }
        return
      }
      if (!res.ok) throw new Error('Error abriendo PDF')
      const data = await res.json()
      const docId = addDoc(data)
      // Load annotations
      const annRes = await fetch(`${API_BASE}/pdf/annotations/${docId}`)
      if (annRes.ok) {
        const annData = await annRes.json()
        setAnnotations(docId, annData.annotations || [])
      }
      // Load outline
      const outlineRes = await fetch(`${API_BASE}/pdf/outline/${docId}`)
      if (outlineRes.ok) {
        const outlineData = await outlineRes.json()
        setOutline(docId, outlineData || [])
      }
      // Save to recent files
      try {
        const recents = JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[]
        const updated = [filePath, ...recents.filter((p) => p !== filePath)].slice(0, 10)
        localStorage.setItem('pdfmaster_recent', JSON.stringify(updated))
      } catch {}
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleOpen = async () => {
    const filePath = await window.api.openFile()
    if (filePath) await openPath(filePath)
  }

  const handleSave = async () => {
    if (!activeDoc) return
    setSaveStatus('saving')
    try {
      // First embed annotations into the PDF itself
      const embedRes = await fetch(`${API_BASE}/pdf/embed/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (!embedRes.ok) throw new Error('Error al embeber anotaciones')
      
      const res = await fetch(`${API_BASE}/pdf/save/${activeDoc.doc_id}`, { method: 'POST' })
      if (res.ok) {
        // Save sidecar annotations too
        await fetch(`${API_BASE}/pdf/annotations/${activeDoc.doc_id}`, {
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
    } catch (err: any) {
      setSaveStatus('idle')
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleSaveAs = async () => {
    if (!activeDoc) return
    const newPath = await window.api.saveFile()
    if (!newPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/save/${activeDoc.doc_id}?output_path=${encodeURIComponent(newPath)}`, { method: 'POST' })
      if (res.ok) {
        showToast('Guardado como ' + newPath.split(/[\\/]/).pop(), 'success')
      } else {
        showToast('Error al guardar', 'error')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleExportWord = async () => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/export-word/${activeDoc.doc_id}`)
      if (res.ok) {
        const data = await res.json()
        const link = document.createElement('a')
        link.download = data.filename || `${activeDoc.file_name.replace('.pdf', '')}.docx`
        link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${data.data_base64}`
        link.click()
        showToast('Exportado a Word', 'success')
      } else {
        showToast('Error al exportar a Word', 'error')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleShareEmail = async () => {
    if (!activeDoc) return
    const subject = encodeURIComponent(`PDF: ${activeDoc.file_name}`)
    const body = encodeURIComponent(`Adjunto: ${activeDoc.file_path}`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
    showToast('Cliente de email abierto', 'info')
  }

  const recentFiles = (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[] }
    catch { return [] }
  })()

  const handleSaveWithPassword = async () => {
    if (!activeDoc) return
    const userPw = prompt('Contraseña de usuario (deja vacío para solo owner):')
    if (userPw === null) return
    const ownerPw = prompt('Contraseña de owner (opcional, Enter para usar la misma):')
    if (ownerPw === null) return
    setSaveStatus('saving')
    try {
      const embedRes = await fetch(`${API_BASE}/pdf/embed/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (!embedRes.ok) throw new Error('Error al embeber anotaciones')
      const res = await fetch(`${API_BASE}/pdf/save-password/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_password: userPw || undefined, owner_password: ownerPw || undefined }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, false)
        setSaveStatus('saved')
        showToast('PDF protegido con contraseña guardado', 'success')
      } else {
        setSaveStatus('idle')
        showToast('Error al guardar con contraseña', 'error')
      }
    } catch (err: any) {
      setSaveStatus('idle')
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleMerge = async () => {
    if (!activeDoc) return
    const sourcePath = await window.api.openFile()
    if (!sourcePath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/merge/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          // Reload doc info
          const infoRes = await fetch(`${API_BASE}/pdf/open`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: activeDoc.file_path }),
          })
          const info = await infoRes.json()
          updateDocPageCount(activeDoc.doc_id, info.page_count)
          updateDocPageSizes(activeDoc.doc_id, info.page_sizes)
          invalidatePageCache(activeDoc.doc_id)
          invalidateThumbnails(activeDoc.doc_id)
          showToast('PDFs combinados', 'success')
        }
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleCompress = async () => {
    if (!activeDoc) return
    const outputPath = activeDoc.file_path.replace('.pdf', '_compressed.pdf')
    try {
      const res = await fetch(`${API_BASE}/pdf/compress/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      if (res.ok) {
        showToast('Comprimido: ' + outputPath.split(/[\\/]/).pop(), 'success')
      } else {
        showToast('Error al comprimir', 'error')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleCompare = async () => {
    if (compareMode) {
      toggleCompareMode()
      return
    }
    // If compare doc already selected, just enter compare mode
    if (compareDocId && docs.find((d) => d.doc_id === compareDocId)) {
      toggleCompareMode()
      return
    }
    // Otherwise open a file dialog for the second PDF
    const filePath = await window.api.openFile()
    if (!filePath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
      })
      if (!res.ok) throw new Error('Error abriendo PDF')
      const data = await res.json()
      const docId = addDoc(data)
      setCompareDoc(docId)
      toggleCompareMode()
      showToast('Modo comparación activado', 'success')
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleRotate = async (degrees: number) => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/rotate/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: activeDoc.currentPage, degrees }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        showToast(`Página rotada ${degrees}°`, 'success')
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleDeletePage = async () => {
    if (!activeDoc) return
    if (!confirm(`¿Eliminar página ${activeDoc.currentPage + 1}?`)) return
    try {
      const res = await fetch(`${API_BASE}/pdf/delete-pages/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [activeDoc.currentPage] }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          updateDocPageCount(activeDoc.doc_id, Math.max(1, activeDoc.page_count - 1))
          if (activeDoc.currentPage >= activeDoc.page_count - 1) {
            setPage(activeDoc.doc_id, Math.max(0, activeDoc.page_count - 2))
          }
          setDocDirty(activeDoc.doc_id, true)
          invalidatePageCache(activeDoc.doc_id)
          invalidateThumbnails(activeDoc.doc_id)
          showToast('Página eliminada', 'success')
        }
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  const handleFit = (mode: 'fit-width' | 'fit-page') => {
    if (!activeDoc) return
    setFitMode(activeDoc.doc_id, mode)
    const z = computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, mode, viewerWidth, viewerHeight)
    setZoom(activeDoc.doc_id, z)
  }

  const handleSearch = async () => {
    if (!activeDoc || !searchInput.trim()) return
    setSearchQuery(activeDoc.doc_id, searchInput)
    try {
      const res = await fetch(`${API_BASE}/pdf/search/${activeDoc.doc_id}?query=${encodeURIComponent(searchInput)}&limit=500`)
      if (res.ok) {
        const results = await res.json()
        setSearchResults(activeDoc.doc_id, results)
        if (results.length > 0) setPage(activeDoc.doc_id, results[0].page)
      }
    } catch (e) { console.error(e) }
  }

  const handleSearchKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }
  const handleCloseSearch = () => { setShowSearch(false); if (activeDoc) setSearchQuery(activeDoc.doc_id, '') }

  const MenuItem = ({ icon: Icon, label, onClick, disabled = false, color = '' }: any) => (
    <button onClick={() => { onClick(); setMenuOpen(null) }} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700 text-slate-200'}`}>
      {Icon && <Icon size={14} className={color || 'text-slate-400'} />} <span>{label}</span>
    </button>
  )

  return (
    <div className="flex flex-col shrink-0 select-none">
      {/* Barra de pestañas */}
      <div className="h-10 bg-slate-900 border-b border-slate-700 flex items-center">
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(menuOpen === 'file' ? null : 'file')}
            className="flex items-center gap-1.5 px-3 h-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shrink-0">
            <FolderOpen size={15} /> <span>Archivo</span>
          </button>
          {menuOpen === 'file' && (
            <div className="absolute top-full left-0 z-50 w-56 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 max-h-[80vh] overflow-y-auto">
              <MenuItem icon={FolderOpen} label="Abrir..." onClick={handleOpen} />
              <div className="h-px bg-slate-700 my-1" />
              <MenuItem icon={Save} label="Guardar" onClick={handleSave} disabled={!activeDoc} />
              <MenuItem icon={FilePlus} label="Guardar como..." onClick={handleSaveAs} disabled={!activeDoc} />
              <MenuItem icon={Save} label="Guardar con contraseña..." onClick={handleSaveWithPassword} disabled={!activeDoc} color="text-amber-400" />
              <MenuItem icon={FileDown} label="Exportar a Word" onClick={handleExportWord} disabled={!activeDoc} />
              <MenuItem icon={Mail} label="Compartir por email" onClick={handleShareEmail} disabled={!activeDoc} />
              <div className="h-px bg-slate-700 my-1" />
              <MenuItem icon={Merge} label="Combinar PDF..." onClick={handleMerge} disabled={!activeDoc} />
              <MenuItem icon={Minimize2} label="Comprimir PDF" onClick={handleCompress} disabled={!activeDoc} />
              <div className="h-px bg-slate-700 my-1" />
              <MenuItem icon={X} label="Cerrar documento" onClick={() => activeDoc && closeDoc(activeDoc.doc_id)} disabled={!activeDoc} />
              {recentFiles.length > 0 && (
                <>
                  <div className="h-px bg-slate-700 my-1" />
                  <div className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wider">Recientes</div>
                  {recentFiles.slice(0, 10).map((path, i) => (
                    <button key={i}
                      onClick={() => { openPath(path); setMenuOpen(null) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white truncate"
                      title={path}>
                      <Clock size={12} className="inline mr-1 text-slate-500" />
                      {path.split(/[\\/]/).pop()}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center overflow-x-auto no-scrollbar">
          {docs.map((doc) => (
            <div key={doc.doc_id} onClick={() => setActiveDoc(doc.doc_id)}
              className={`group flex items-center gap-2 px-4 h-full border-r border-slate-700 cursor-pointer text-sm min-w-fit transition-colors ${
                doc.doc_id === activeDocId ? 'bg-slate-800 text-slate-100 border-t-2 border-t-blue-500' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}>
              <span className="truncate max-w-[140px]">{doc.dirty ? '● ' : ''}{doc.file_name}</span>
              <button onClick={(e) => { e.stopPropagation(); closeDoc(doc.doc_id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-600 transition-opacity">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center h-full">
          <Tooltip content={sidebarOpen ? 'Ocultar páginas (Ctrl+Shift+L)' : 'Mostrar páginas (Ctrl+Shift+L)'}>
            <button onClick={toggleSidebar} aria-label={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'}
              className={`p-2 h-full hover:bg-slate-700 transition-colors ${sidebarOpen ? 'text-blue-400' : 'text-slate-400'}`}>
              <PanelLeft size={16} />
            </button>
          </Tooltip>
          <Tooltip content={toolsPanelOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}>
            <button onClick={toggleToolsPanel} aria-label={toolsPanelOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}
              className={`p-2 h-full hover:bg-slate-700 transition-colors ${toolsPanelOpen ? 'text-blue-400' : 'text-slate-400'}`}>
              <PanelRight size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Barra de herramientas del documento activo */}
      {activeDoc && (
        <div className="h-11 bg-slate-800 border-b border-slate-700 flex items-center px-3 gap-2">
          <div className="flex items-center gap-1">
            <Tooltip content="Ajustar al ancho">
              <button onClick={() => handleFit('fit-width')} aria-label="Ajustar al ancho"
                className={`p-1.5 rounded transition-colors ${activeDoc.fitMode === 'fit-width' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
                <AlignVerticalJustifyCenter size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Ajustar a la página">
              <button onClick={() => handleFit('fit-page')} aria-label="Ajustar a la página"
                className={`p-1.5 rounded transition-colors ${activeDoc.fitMode === 'fit-page' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
                <Maximize2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content={viewMode === 'single' ? 'Vista doble' : 'Vista simple'}>
              <button onClick={() => setViewMode(viewMode === 'single' ? 'double' : 'single')} aria-label={viewMode === 'single' ? 'Vista doble' : 'Vista simple'}
                className={`p-1.5 rounded transition-colors ${viewMode === 'double' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
                {viewMode === 'single' ? <AlignVerticalJustifyCenter size={16} /> : <Maximize2 size={16} />}
              </button>
            </Tooltip>
            <Tooltip content="Comparar PDFs">
              <button
                onClick={handleCompare}
                className={`p-1.5 rounded transition-colors ${compareMode ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}
                aria-label="Comparar PDFs"
              >
                <GitCompare size={16} />
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <Tooltip content="Alejar (-)">
              <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} aria-label="Alejar" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <ZoomOut size={16} />
              </button>
            </Tooltip>
            <span className="text-xs text-slate-300 w-12 text-center font-mono">{Math.round(activeDoc.zoom * 100)}%</span>
            <Tooltip content="Acercar (+)">
              <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} aria-label="Acercar" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <ZoomIn size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Zoom 100% (Ctrl+0)">
              <button onClick={() => { setZoom(activeDoc.doc_id, 1); setFitMode(activeDoc.doc_id, 'custom') }} aria-label="Zoom 100%" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <ResetZoom size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <div className="flex items-center gap-1">
            <Tooltip content="Página anterior">
              <button onClick={() => prevPage(activeDoc.doc_id)} disabled={activeDoc.currentPage === 0} aria-label="Página anterior"
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
            </Tooltip>
            <div className="flex items-center gap-1 text-xs">
              <input type="number" min={1} max={activeDoc.page_count} value={activeDoc.currentPage + 1}
                onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= activeDoc.page_count) setPage(activeDoc.doc_id, v - 1) }}
                className="w-10 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 focus:outline-none focus:border-blue-500" />
              <span className="text-slate-400">/ {activeDoc.page_count}</span>
            </div>
            <Tooltip content="Página siguiente">
              <button onClick={() => nextPage(activeDoc.doc_id)} disabled={activeDoc.currentPage >= activeDoc.page_count - 1} aria-label="Página siguiente"
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <div className="flex items-center gap-1">
            <Tooltip content="Deshacer (Ctrl+Z)">
              <button onClick={undo} aria-label="Deshacer" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <Undo2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Rehacer (Ctrl+Y)">
              <button onClick={redo} aria-label="Rehacer" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <Redo2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Atrás">
              <button onClick={() => activeDoc && goBack(activeDoc.doc_id)} disabled={navHistoryIndex <= 0}
                aria-label="Atrás" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors">
                <ArrowLeft size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Adelante">
              <button onClick={() => activeDoc && goForward(activeDoc.doc_id)} disabled={navHistoryIndex >= navHistory.length - 1}
                aria-label="Adelante" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors">
                <ArrowRight size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <div className="flex items-center gap-1">
            <Tooltip content="Rotar 90° CCW">
              <button onClick={() => handleRotate(-90)} aria-label="Rotar 90° en sentido antihorario" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <RotateCcw size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Rotar 90° CW">
              <button onClick={() => handleRotate(90)} aria-label="Rotar 90° en sentido horario" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <RotateCw size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Eliminar página">
              <button onClick={handleDeletePage} aria-label="Eliminar página" className="p-1.5 rounded hover:bg-red-900/50 text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Tooltip content="Imprimir">
              <button onClick={() => window.print()} aria-label="Imprimir" className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                <Printer size={16} />
              </button>
            </Tooltip>
            <Tooltip content={readingMode ? 'Salir de modo lectura' : 'Modo lectura'}>
              <button onClick={toggleReadingMode} aria-label={readingMode ? 'Salir de modo lectura' : 'Modo lectura'} className={`p-1.5 rounded transition-colors ${readingMode ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>
                <BookOpen size={16} />
              </button>
            </Tooltip>
            <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <div className="flex items-center gap-2">
            {showSearch ? (
              <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-600 px-2 py-1">
                <Search size={14} className="text-slate-400" />
                <input ref={searchRef} type="text" placeholder="Buscar..." value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleSearchKey}
                  className="bg-transparent text-sm text-slate-200 focus:outline-none w-32" />
                {activeDoc.searchResults.length > 0 && (
                  <span className="text-xs text-slate-400">{activeDoc.searchIndex + 1}/{activeDoc.searchResults.length}</span>
                )}
                <button onClick={() => prevSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronUp size={14} /></button>
                <button onClick={() => nextSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronDown size={14} /></button>
                <button onClick={handleCloseSearch} className="text-slate-400 hover:text-slate-200 ml-1"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors" title="Buscar">
                <Search size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
