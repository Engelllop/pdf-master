import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  Save, FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
  Search, Maximize2, AlignVerticalJustifyCenter,
  X, ChevronDown, ChevronUp, Merge,
  BookOpen, Printer,
  FileDown, GitCompare, RefreshCw, Scissors, Stamp, FileText, Presentation, ScrollText,
  Volume2, VolumeX, ScanText,
  Highlighter, Underline, Strikethrough, MessageSquare, PenTool, Signature,
  Type, Image as ImageIcon, Images, Square, Circle, ArrowRight as ArrowRightTool, Ruler, Pencil,
  MoveDiagonal, LandPlot, MousePointer2, TextSelect, Copy, Crop, Lock, Shield,
  FileSpreadsheet, FileImage, Sparkles, MessageCircleQuestion, ListTree, MoveVertical,
  ZoomIn, ZoomOut, FileType, Code2, LockOpen, FilePlus2, Tally5,
} from 'lucide-react'
import RibbonTabs from './ribbon/RibbonTabs'
import PrintDialog from './PrintDialog'
import PropertiesBar from './PropertiesBar'
import { useFormModal } from './FormModal'
import { usePdfActions } from '../hooks/usePdfActions'
import { useState, useRef, useEffect } from 'react'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'

import { apiFetch } from '../lib/api'

export default function Toolbar() {
  const tc = useThemeClasses()
  const {
    docs, activeDocId, setPage, setZoom,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    showToast, setDocDirty, invalidatePageCache, invalidateThumbnails, incrementDocVersion,
    readingMode, toggleReadingMode, togglePresentationMode, continuousMode, toggleContinuousMode,
    compareMode, activeRibbon, activeTool, annotationColor, setAnnotationColor,
    countCategory, setCountCategory,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'setZoom',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'showToast', 'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails', 'incrementDocVersion',
    'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'continuousMode', 'toggleContinuousMode',
    'compareMode', 'activeRibbon', 'activeTool', 'annotationColor', 'setAnnotationColor',
    'countCategory', 'setCountCategory',
  )

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const { askForm, askConfirm, formModal } = useFormModal()

  // Único punto de error de los handlers: toast al usuario + traza a backend.log
  // (antes había ~25 catch idénticos que tragaban el stack).
  const toastActionError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    window.api.logError(`[toolbar] ${err instanceof Error ? err.stack || msg : msg}`).catch(() => {})
    showToast('Error: ' + msg, 'error')
  }

  const {
    handleExportWord, handleAddPageNumbers, handleMarkupSummary, handleMakeSearchable,
    handleSaveWithPassword, handleWatermark, handleRedact, handleCrop,
    handleExportExcel, handleExportPptx, handleOcr, handleSavePageAsImage,
    handleEditMetadata, handleHeaderFooter, handleMerge, handleCompress,
    handleBatchCompress, handleBatchWatermark, handleBatchExportWord,
    handleSplit, handleCompare, handleRotate, handleRotateAll, handleDeletePage,
    handleFit, handleInsertBlank, handleDuplicatePage, handleToolClick,
    handleExportTxt, handleExportHtml, handleRemovePassword, handleImagesToPdf,
    handleExportMeasurements,
  } = usePdfActions(activeDoc, { askForm, askConfirm, toastActionError })

  const [searchInput, setSearchInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [replaceInput, setReplaceInput] = useState('')
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false)
  const [replaceAllPages, setReplaceAllPages] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [splitSubmenuOpen, setSplitSubmenuOpen] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus()
  }, [showSearch])

  // Atajo de búsqueda (Ctrl+F) desde App.tsx
  useEffect(() => {
    const onSearch = () => setShowSearch(true)
    window.addEventListener('app:shortcut-search', onSearch)
    return () => window.removeEventListener('app:shortcut-search', onSearch)
  }, [])

  const handleRedactMatches = async () => {
    if (!activeDoc || !searchInput.trim()) return
    if (!(await askConfirm('Redactar coincidencias', `Se tacharán permanentemente todas las ocurrencias de "${searchInput}". Esta acción no se puede deshacer.`, 'Redactar'))) return
    try {
      const res = await apiFetch(`/pdf/redact-matches/${activeDoc.doc_id}?query=${encodeURIComponent(searchInput)}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast(`${data.redacted} ocurrencia(s) redactada(s)`, 'success')
      } else showToast('Error al redactar', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleReadAloud = async () => {
    if (!activeDoc) return
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return }
    try {
      const res = await apiFetch(`/pdf/text/${activeDoc.doc_id}/${activeDoc.currentPage}`)
      const data = await res.json()
      const text: string = (data.blocks ? data.blocks.map((b: any) => b.text).join(' ') : data.text) || ''
      if (!text.trim()) { showToast('No hay texto en esta página', 'info'); return }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'es-ES'
      u.onend = () => setIsSpeaking(false)
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
      setIsSpeaking(true)
    } catch { showToast('Error al leer la página', 'error') }
  }

  // --- Por lotes: aplica una operación a TODOS los documentos abiertos ---
  const handleSearch = async () => {
    if (!activeDoc || !searchInput.trim()) return
    setSearchQuery(activeDoc.doc_id, searchInput)
    try {
      const res = await apiFetch(`/pdf/search/${activeDoc.doc_id}?query=${encodeURIComponent(searchInput)}&limit=500`)
      if (res.ok) {
        const results = await res.json()
        setSearchResults(activeDoc.doc_id, results)
        if (results.length > 0) setPage(activeDoc.doc_id, results[0].page)
      }
    } catch (e) { console.error(e) }
  }

  const handleSearchKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }
  const handleCloseSearch = () => { setShowSearch(false); setSearchInput(''); setReplaceInput(''); if (activeDoc) setSearchQuery(activeDoc.doc_id, '') }

  const handleReplace = async () => {
    if (!activeDoc || !searchInput.trim()) return
    try {
      const res = await apiFetch(`/pdf/replace-text/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchInput,
          replace: replaceInput,
          page_num: replaceAllPages ? undefined : activeDoc.currentPage,
          case_sensitive: replaceCaseSensitive,
          replace_all: false,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.replaced > 0) {
          setDocDirty(activeDoc.doc_id, true)
          invalidatePageCache(activeDoc.doc_id)
          invalidateThumbnails(activeDoc.doc_id)
          incrementDocVersion(activeDoc.doc_id)
          showToast(`${data.replaced} reemplazo(s) realizado(s)`, 'success')
          handleSearch()
        } else {
          showToast('Texto no encontrado', 'info')
        }
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleReplaceAll = async () => {
    if (!activeDoc || !searchInput.trim()) return
    if (!(await askConfirm('Reemplazar todo', `Se reemplazarán todas las ocurrencias de "${searchInput}" por "${replaceInput}".`, 'Reemplazar todo'))) return
    try {
      const res = await apiFetch(`/pdf/replace-text/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchInput,
          replace: replaceInput,
          page_num: replaceAllPages ? undefined : activeDoc.currentPage,
          case_sensitive: replaceCaseSensitive,
          replace_all: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.replaced > 0) {
          setDocDirty(activeDoc.doc_id, true)
          invalidatePageCache(activeDoc.doc_id)
          invalidateThumbnails(activeDoc.doc_id)
          incrementDocVersion(activeDoc.doc_id)
          showToast(`${data.replaced} reemplazo(s) realizado(s)`, 'success')
          handleSearch()
        } else {
          showToast('Texto no encontrado', 'info')
        }
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  // Las barras de acción muestran icono + etiqueta (estilo SwifDoo); Leer y Comentar
  // van solo con iconos (muchas herramientas, como en SwifDoo).
  const withLabels = !['read', 'comment'].includes(activeRibbon)
  const TBtn = ({ icon: Icon, label, tip, onClick, active = false, disabled = false }: any) => (
    <Tooltip content={tip || label}>
      <button onClick={onClick} disabled={disabled} aria-label={tip || label}
        className={`flex items-center justify-center gap-1.5 rounded-token whitespace-nowrap transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          withLabels ? 'px-2.5 h-8 text-[13px]' : 'p-2'
        } ${active ? 'bg-active text-accent' : 'text-fg hover:bg-hover'}`}>
        <Icon size={withLabels ? 16 : 17} strokeWidth={1.75} />
        {withLabels && <span>{label}</span>}
      </button>
    </Tooltip>
  )
  const Sep = () => <div className="w-px h-5 mx-1 bg-border shrink-0" />

  const COMMENT_TOOLS: Array<{ id: string; icon: any; label: string }> = [
    { id: 'select', icon: MousePointer2, label: 'Sel.' },
    { id: 'textselect', icon: TextSelect, label: 'Texto' },
    { id: 'highlight', icon: Highlighter, label: 'Resaltar' },
    { id: 'underline', icon: Underline, label: 'Subrayar' },
    { id: 'strikethrough', icon: Strikethrough, label: 'Tachar' },
    { id: 'note', icon: MessageSquare, label: 'Nota' },
    { id: 'draw', icon: PenTool, label: 'Dibujar' },
    { id: 'signature', icon: Signature, label: 'Firma' },
    { id: 'text', icon: Type, label: 'Texto' },
    { id: 'rect', icon: Square, label: 'Rect.' },
    { id: 'circle', icon: Circle, label: 'Círculo' },
    { id: 'arrow', icon: ArrowRightTool, label: 'Flecha' },
    { id: 'stamp', icon: Stamp, label: 'Sello' },
    { id: 'count', icon: Tally5, label: 'Conteo' },
    { id: 'measure_calibrate', icon: Ruler, label: 'Calibrar' },
    { id: 'measure_distance', icon: MoveDiagonal, label: 'Distancia' },
    { id: 'measure_area', icon: LandPlot, label: 'Área' },
  ]

  const renderRibbon = () => {
    if (!activeDoc) return null
    switch (activeRibbon) {
      case 'read':
        return (
          <>
            <TBtn icon={ZoomOut} label="Alejar" tip="Alejar" onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} />
            <span className="font-mono text-xs text-fg w-10 text-center tabular-nums">{Math.round(activeDoc.zoom * 100)}%</span>
            <TBtn icon={ZoomIn} label="Acercar" tip="Acercar" onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} />
            <Sep />
            <TBtn icon={Maximize2} label="Ajustar" tip="Ajustar página" onClick={() => handleFit('fit-page')} active={activeDoc.fitMode === 'fit-page'} />
            <TBtn icon={MoveVertical} label="Ancho" tip="Ajustar al ancho" onClick={() => handleFit('fit-width')} active={activeDoc.fitMode === 'fit-width'} />
            <Sep />
            <TBtn icon={ScrollText} label="Continuo" tip={continuousMode ? 'Vista de página única' : 'Scroll continuo'} onClick={() => toggleContinuousMode()} active={continuousMode} />
            <TBtn icon={BookOpen} label="Lectura" tip="Modo lectura" onClick={toggleReadingMode} active={readingMode} />
            <TBtn icon={Presentation} label="Present." tip="Modo presentación" onClick={() => togglePresentationMode()} />
            <TBtn icon={GitCompare} label="Comparar" tip="Comparar PDFs" onClick={handleCompare} active={compareMode} />
            <Sep />
            <TBtn icon={isSpeaking ? VolumeX : Volume2} label="Leer" tip={isSpeaking ? 'Detener' : 'Leer en voz alta'} onClick={handleReadAloud} active={isSpeaking} />
            <TBtn icon={Printer} label="Imprimir" tip="Imprimir" onClick={() => setShowPrint(true)} />
          </>
        )
      case 'comment':
        return (
          <>
            <input type="color" value={annotationColor} onChange={(e) => setAnnotationColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border p-0 bg-transparent shrink-0" title="Color" />
            <Sep />
            {COMMENT_TOOLS.map((t) => (
              <TBtn key={t.id} icon={t.icon} label={t.label} tip={t.label}
                onClick={() => handleToolClick(t.id)} active={activeTool === t.id} />
            ))}
            {activeTool === 'count' && (
              <>
                <Sep />
                <input type="text" value={countCategory} onChange={(e) => setCountCategory(e.target.value)}
                  placeholder="Categoría" title="Categoría del conteo"
                  className="w-28 px-2 py-1 text-xs rounded border border-border bg-surface text-fg shrink-0" />
                <span className="text-xs text-muted shrink-0 tabular-nums" title="Marcas de esta categoría en el documento">
                  = {activeDoc.annotations.filter((a) => a.type === 'count' && (a.text || 'General') === (countCategory || 'General')).length}
                </span>
              </>
            )}
            <Sep />
            <TBtn icon={FileDown} label="Resumen" tip="Resumen de marcas (PDF)" onClick={handleMarkupSummary} />
            <TBtn icon={FileSpreadsheet} label="Mediciones" tip="Exportar tabla de mediciones y conteos (Excel/CSV)" onClick={handleExportMeasurements} />
          </>
        )
      case 'edit':
        return (
          <>
            <TBtn icon={Pencil} label="Editar texto" tip="Editar texto existente (clic sobre el texto)" onClick={() => handleToolClick('edittext')} active={activeTool === 'edittext'} />
            <TBtn icon={Type} label="Texto" tip="Insertar texto nuevo" onClick={() => handleToolClick('text')} active={activeTool === 'text'} />
            <TBtn icon={ImageIcon} label="Imagen" tip="Insertar imagen" onClick={() => handleToolClick('image')} active={activeTool === 'image'} />
            <TBtn icon={Images} label="Editar imagen" tip="Editar imágenes existentes (clic para seleccionar)" onClick={() => handleToolClick('editimage')} active={activeTool === 'editimage'} />
            <Sep />
            <TBtn icon={AlignVerticalJustifyCenter} label="Encab/Pie" tip="Encabezado y pie" onClick={handleHeaderFooter} />
            <TBtn icon={Stamp} label="Marca agua" tip="Marca de agua" onClick={handleWatermark} />
            <TBtn icon={FileText} label="Numerar" tip="Numerar páginas / Bates" onClick={handleAddPageNumbers} />
            <Sep />
            <TBtn icon={Crop} label="Recortar" tip="Recortar página" onClick={handleCrop} />
            <TBtn icon={Trash2} label="Redactar" tip="Redactar área" onClick={handleRedact} />
            <TBtn icon={FileText} label="Metadatos" tip="Editar metadatos" onClick={handleEditMetadata} />
          </>
        )
      case 'form':
        return (
          <>
            <TBtn icon={Save} label="Guardar" tip="Guardar formulario" onClick={() => window.dispatchEvent(new Event('app:shortcut-save'))} />
            <span className="text-xs text-muted px-3">Haz clic en los campos del documento para rellenarlos.</span>
          </>
        )
      case 'page':
        return (
          <>
            <TBtn icon={RotateCcw} label="Izq." tip="Rotar página a la izquierda" onClick={() => handleRotate(-90)} />
            <TBtn icon={RotateCw} label="Der." tip="Rotar página a la derecha" onClick={() => handleRotate(90)} />
            <TBtn icon={RefreshCw} label="Todo" tip="Rotar todo el documento" onClick={() => handleRotateAll(90)} />
            <Sep />
            <TBtn icon={FilePlus} label="Insertar" tip="Insertar página en blanco" onClick={handleInsertBlank} />
            <TBtn icon={Copy} label="Duplicar" tip="Duplicar página" onClick={handleDuplicatePage} />
            <TBtn icon={Trash2} label="Eliminar" tip="Eliminar página" onClick={handleDeletePage} />
            <Sep />
            <TBtn icon={Merge} label="Combinar" tip="Combinar otro PDF" onClick={handleMerge} />
            <div className="relative">
              <TBtn icon={Scissors} label="Dividir" tip="Dividir / extraer páginas" onClick={() => setSplitSubmenuOpen(!splitSubmenuOpen)} active={splitSubmenuOpen} />
              {splitSubmenuOpen && (
                <div className="menu-pop absolute top-full left-0 z-50 mt-1 w-44 border border-border rounded-token shadow-token py-1 bg-panel">
                  {([['even', 'Páginas pares'], ['odd', 'Páginas impares'], ['range', 'Rango personalizado...'], ['from-current', 'Desde página actual']] as const).map(([m, lbl]) => (
                    <button key={m} onClick={() => { handleSplit(m); setSplitSubmenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover">{lbl}</button>
                  ))}
                </div>
              )}
            </div>
            <TBtn icon={Crop} label="Recortar" tip="Recortar página" onClick={handleCrop} />
          </>
        )
      case 'protect':
        return (
          <>
            <TBtn icon={Lock} label="Contraseña" tip="Guardar con contraseña (AES-256)" onClick={handleSaveWithPassword} />
            <TBtn icon={LockOpen} label="Quitar clave" tip="Guardar copia sin contraseña" onClick={handleRemovePassword} />
            <TBtn icon={Shield} label="Redactar" tip="Redactar área" onClick={handleRedact} />
            <TBtn icon={Search} label="Buscar+Redactar" tip="Redactar coincidencias (usa el buscador)" onClick={() => setShowSearch(true)} />
          </>
        )
      case 'convert':
        return (
          <>
            <TBtn icon={FileDown} label="Word" tip="Exportar a Word" onClick={handleExportWord} />
            <TBtn icon={FileSpreadsheet} label="Excel" tip="Exportar a Excel" onClick={handleExportExcel} />
            <TBtn icon={Presentation} label="PowerPoint" tip="Exportar a PowerPoint" onClick={handleExportPptx} />
            <TBtn icon={FileType} label="TXT" tip="Exportar a texto plano" onClick={handleExportTxt} />
            <TBtn icon={Code2} label="HTML" tip="Exportar a HTML" onClick={handleExportHtml} />
            <TBtn icon={FileImage} label="Imagen" tip="Guardar página como imagen" onClick={handleSavePageAsImage} />
            <Sep />
            <TBtn icon={FilePlus2} label="Imágenes→PDF" tip="Crear PDF a partir de imágenes" onClick={handleImagesToPdf} />
            <TBtn icon={ScanText} label="OCR buscable" tip="Hacer página buscable (OCR)" onClick={handleMakeSearchable} />
          </>
        )
      case 'tools':
        return (
          <>
            <TBtn icon={Minimize2} label="Comprimir" tip="Comprimir PDF" onClick={handleCompress} />
            <TBtn icon={ScanText} label="OCR" tip="OCR página actual (extraer)" onClick={handleOcr} />
            <TBtn icon={GitCompare} label="Comparar" tip="Comparar PDFs" onClick={handleCompare} active={compareMode} />
            <Sep />
            <TBtn icon={FileDown} label="Resumen" tip="Resumen de marcas" onClick={handleMarkupSummary} />
            <TBtn icon={FileText} label="Metadatos" tip="Editar metadatos" onClick={handleEditMetadata} />
            <TBtn icon={AlignVerticalJustifyCenter} label="Encab/Pie" tip="Encabezado y pie" onClick={handleHeaderFooter} />
          </>
        )
      case 'ai': {
        const openAI = (preset?: string) => window.dispatchEvent(new CustomEvent('app:ai-open', { detail: preset ? { preset } : {} }))
        return (
          <>
            <TBtn icon={Sparkles} label="Asistente" tip="Abrir asistente IA (Claude)" onClick={() => openAI()} />
            <Sep />
            <TBtn icon={ScrollText} label="Resumir" tip="Resumir el documento" onClick={() => openAI('Resume este documento en puntos clave.')} />
            <TBtn icon={MessageCircleQuestion} label="Preguntar" tip="Preguntar sobre el PDF" onClick={() => openAI()} />
            <TBtn icon={ListTree} label="Extraer" tip="Extraer datos estructurados" onClick={() => openAI('Extrae los datos más relevantes de este documento en formato estructurado (listas o tabla).')} />
          </>
        )
      }
      case 'batch':
        return (
          <>
            <span className="text-xs text-muted px-2">{docs.length} doc(s) abiertos →</span>
            <TBtn icon={Minimize2} label="Comprimir" tip="Comprimir todos los documentos abiertos" onClick={handleBatchCompress} />
            <TBtn icon={Stamp} label="Marca agua" tip="Marca de agua en todos" onClick={handleBatchWatermark} />
            <TBtn icon={FileDown} label="A Word" tip="Exportar todos a Word" onClick={handleBatchExportWord} />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col shrink-0 select-none bg-toolbar text-fg">
      <RibbonTabs />

      {/* Barra contextual del modo activo */}
      {activeDoc && (
        <div className="h-11 border-b border-border bg-toolbar grid items-center px-3 gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div />
          <div className="flex items-center justify-center gap-1 flex-wrap min-w-0">
            {renderRibbon()}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {showSearch ? (
              <div className={`flex flex-col gap-1 rounded border px-2 py-1.5 ${tc('bg-slate-900 border-slate-600', 'bg-white border-gray-300')}`}>
                <div className="flex items-center gap-1">
                  <Search size={14} className={tc('text-slate-400', 'text-gray-500')} />
                  <input ref={searchRef} type="text" placeholder="Buscar..." value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleSearchKey}
                    className={`bg-transparent text-sm focus:outline-none w-28 ${tc('text-slate-200', 'text-gray-800')}`} />
                  <input ref={replaceRef} type="text" placeholder="Reemplazar..." value={replaceInput}
                    onChange={(e) => setReplaceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReplace()}
                    className={`bg-transparent text-sm focus:outline-none w-28 ${tc('text-slate-200', 'text-gray-800')}`} />
                  {activeDoc.searchResults.length > 0 && (
                    <span className={`text-xs ${tc('text-slate-400', 'text-gray-500')}`}>{activeDoc.searchIndex + 1}/{activeDoc.searchResults.length}</span>
                  )}
                  <button onClick={() => prevSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className={`disabled:opacity-30 ${tc('text-slate-400 hover:text-slate-200', 'text-gray-500 hover:text-gray-800')}`}><ChevronUp size={14} /></button>
                  <button onClick={() => nextSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className={`disabled:opacity-30 ${tc('text-slate-400 hover:text-slate-200', 'text-gray-500 hover:text-gray-800')}`}><ChevronDown size={14} /></button>
                  <button onClick={handleCloseSearch} className={`ml-1 ${tc('text-slate-400 hover:text-slate-200', 'text-gray-500 hover:text-gray-800')}`}><X size={14} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-1 text-[10px] cursor-pointer ${tc('text-slate-400', 'text-gray-500')}`}>
                    <input type="checkbox" checked={replaceCaseSensitive} onChange={(e) => setReplaceCaseSensitive(e.target.checked)} className="w-3 h-3" />
                    Aa
                  </label>
                  <label className={`flex items-center gap-1 text-[10px] cursor-pointer ${tc('text-slate-400', 'text-gray-500')}`}>
                    <input type="checkbox" checked={replaceAllPages} onChange={(e) => setReplaceAllPages(e.target.checked)} className="w-3 h-3" />
                    Todo el doc
                  </label>
                  <button onClick={handleReplace} disabled={!searchInput.trim()}
                    className={`text-[10px] px-2 py-0.5 rounded ${searchInput.trim() ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'opacity-40 bg-slate-700 text-slate-400'}`}>Reemplazar</button>
                  <button onClick={handleReplaceAll} disabled={!searchInput.trim()}
                    className={`text-[10px] px-2 py-0.5 rounded ${searchInput.trim() ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'opacity-40 bg-slate-700 text-slate-400'}`}>Reemplazar todo</button>
                  <button onClick={handleRedactMatches} disabled={!searchInput.trim()} title="Tachar permanentemente todas las coincidencias"
                    className={`text-[10px] px-2 py-0.5 rounded ${searchInput.trim() ? 'bg-red-600 hover:bg-red-500 text-white' : 'opacity-40 bg-slate-700 text-slate-400'}`}>Redactar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`} title="Buscar">
                <Search size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {activeDoc && <PropertiesBar />}
      {formModal}

      {showPrint && activeDoc && (
        <PrintDialog
          docId={activeDoc.doc_id}
          pageCount={activeDoc.page_count}
          currentPage={activeDoc.currentPage}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
