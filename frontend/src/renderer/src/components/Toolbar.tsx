import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
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
  Check as CheckIcon, Star, Cloud as CloudIcon, Hexagon, Pin, PinOff,
  Minus, MessageSquareQuote, Spline, Triangle, Diamond, LayoutGrid,
} from 'lucide-react'
import { type CountSymbol } from '../store/usePdfStore'
import { TOOL_LABELS, TOOL_SHORTCUTS } from '../lib/tools'
import { registerCommands } from '../lib/commands'
import RibbonTabs from './ribbon/RibbonTabs'
import PrintDialog from './PrintDialog'
import PropertiesBar from './PropertiesBar'
import RotatePreview from './RotatePreview'
import { useFormModal } from './FormModal'
import { usePdfActions } from '../hooks/usePdfActions'
import { useState, useRef, useEffect } from 'react'
import Tooltip from './Tooltip'

import { apiFetch } from '../lib/api'

export default function Toolbar() {
  const {
    docs, activeDocId, setPage, setZoom,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    showToast, setDocDirty, invalidatePageCache, invalidateThumbnails, incrementDocVersion,
    readingMode, toggleReadingMode, togglePresentationMode, continuousMode, toggleContinuousMode,
    compareMode, activeRibbon, activeTool, annotationColor, setAnnotationColor,
    countCategory, setCountCategory, countSymbol, setCountSymbol,
    stickyTools, setStickyTools, setActiveRibbon, compareZoom, setCompareZoom,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'setZoom',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'showToast', 'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails', 'incrementDocVersion',
    'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'continuousMode', 'toggleContinuousMode',
    'compareMode', 'activeRibbon', 'activeTool', 'annotationColor', 'setAnnotationColor',
    'countCategory', 'setCountCategory', 'countSymbol', 'setCountSymbol',
    'stickyTools', 'setStickyTools', 'setActiveRibbon', 'compareZoom', 'setCompareZoom',
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
    handleExportMeasurements, handleExportXfdf, handleImportXfdf,
  } = usePdfActions(activeDoc, { askForm, askConfirm, toastActionError })

  const [searchInput, setSearchInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [replaceInput, setReplaceInput] = useState('')
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false)
  const [replaceAllPages, setReplaceAllPages] = useState(true)
  const [searchAllDocs, setSearchAllDocs] = useState(false)
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

  // Imprimir y combinar disparados desde el menú Archivo / acciones rápidas de la cinta.
  useEffect(() => {
    const onPrint = () => { if (activeDoc) setShowPrint(true) }
    const onMerge = () => { if (activeDoc) handleMerge() }
    const onSummary = () => { if (activeDoc) handleMarkupSummary() }
    window.addEventListener('app:shortcut-print', onPrint)
    window.addEventListener('app:shortcut-merge', onMerge)
    window.addEventListener('app:markup-summary', onSummary)
    return () => {
      window.removeEventListener('app:shortcut-print', onPrint)
      window.removeEventListener('app:shortcut-merge', onMerge)
      window.removeEventListener('app:markup-summary', onSummary)
    }
  }, [activeDoc, handleMerge, handleMarkupSummary])

  // Catálogo de comandos de la paleta (Ctrl+K). Se publica desde aquí porque es
  // donde viven los handlers; la paleta solo los consume.
  useEffect(() => {
    const hasDoc = !!activeDoc
    const tool = (id: string) => () => { setActiveRibbon('comment'); handleToolClick(id) }
    registerCommands([
      { id: 'file.open', group: 'Archivo', label: 'Abrir PDF…', shortcut: 'Ctrl+O', run: () => window.dispatchEvent(new CustomEvent('app:shortcut-open')) },
      { id: 'file.save', group: 'Archivo', label: 'Guardar', shortcut: 'Ctrl+S', disabled: !hasDoc, run: () => window.dispatchEvent(new CustomEvent('app:shortcut-save')) },
      { id: 'file.print', group: 'Archivo', label: 'Imprimir…', shortcut: 'Ctrl+P', disabled: !hasDoc, run: () => setShowPrint(true) },
      { id: 'file.merge', group: 'Archivo', label: 'Combinar otro PDF…', disabled: !hasDoc, run: handleMerge },
      { id: 'file.settings', group: 'Archivo', label: 'Ajustes', run: () => window.dispatchEvent(new CustomEvent('app:show-settings')) },
      { id: 'file.shortcuts', group: 'Archivo', label: 'Atajos de teclado', shortcut: 'F1', run: () => window.dispatchEvent(new CustomEvent('app:show-shortcuts')) },

      { id: 'view.search', group: 'Ver', label: 'Buscar en el documento', shortcut: 'Ctrl+F', disabled: !hasDoc, run: () => setShowSearch(true) },
      { id: 'view.fitpage', group: 'Ver', label: 'Ajustar página', disabled: !hasDoc, run: () => handleFit('fit-page') },
      { id: 'view.fitwidth', group: 'Ver', label: 'Ajustar al ancho', disabled: !hasDoc, run: () => handleFit('fit-width') },
      { id: 'view.continuous', group: 'Ver', label: 'Scroll continuo', disabled: !hasDoc, run: () => toggleContinuousMode() },
      { id: 'view.reading', group: 'Ver', label: 'Modo lectura', disabled: !hasDoc, run: toggleReadingMode },
      { id: 'view.presentation', group: 'Ver', label: 'Modo presentación', disabled: !hasDoc, run: () => togglePresentationMode() },
      { id: 'view.compare', group: 'Ver', label: 'Comparar dos PDFs', disabled: !hasDoc, run: handleCompare },
      { id: 'view.readaloud', group: 'Ver', label: 'Leer la página en voz alta', disabled: !hasDoc, run: handleReadAloud },

      ...[...COMMENT_TOOLS, ...SHAPE_TOOLS].map((t) => ({
        id: `tool.${t.id}`, group: 'Herramienta', label: TOOL_LABELS[t.id] || t.label,
        shortcut: TOOL_SHORTCUTS[t.id], disabled: !hasDoc, run: tool(t.id),
      })),

      { id: 'page.organizer', group: 'Página', label: 'Organizar páginas (pantalla completa)', disabled: !hasDoc, run: () => window.dispatchEvent(new CustomEvent('app:page-organizer')) },
      { id: 'markup.stamps', group: 'Marcas', label: 'Sellos y firmas…', run: () => window.dispatchEvent(new CustomEvent('app:show-stamps')) },
      { id: 'markup.summary', group: 'Marcas', label: 'Resumen de marcas (PDF)', disabled: !hasDoc, run: handleMarkupSummary },
      { id: 'markup.measurements', group: 'Marcas', label: 'Exportar mediciones y conteos', disabled: !hasDoc, run: handleExportMeasurements },
      { id: 'markup.xfdf', group: 'Marcas', label: 'Exportar anotaciones a XFDF', disabled: !hasDoc, run: handleExportXfdf },
      { id: 'markup.xfdf.import', group: 'Marcas', label: 'Importar anotaciones XFDF', disabled: !hasDoc, run: handleImportXfdf },

      { id: 'page.rotate.left', group: 'Página', label: 'Rotar a la izquierda', disabled: !hasDoc, run: () => handleRotate(-90) },
      { id: 'page.rotate.right', group: 'Página', label: 'Rotar a la derecha', disabled: !hasDoc, run: () => handleRotate(90) },
      { id: 'page.rotate.all', group: 'Página', label: 'Rotar todo el documento', disabled: !hasDoc, run: () => handleRotateAll(90) },
      { id: 'page.insert', group: 'Página', label: 'Insertar página en blanco', disabled: !hasDoc, run: handleInsertBlank },
      { id: 'page.duplicate', group: 'Página', label: 'Duplicar página', disabled: !hasDoc, run: handleDuplicatePage },
      { id: 'page.delete', group: 'Página', label: 'Eliminar página', disabled: !hasDoc, run: handleDeletePage },
      { id: 'page.split', group: 'Página', label: 'Dividir / extraer páginas…', disabled: !hasDoc, run: () => handleSplit('range') },
      { id: 'page.crop', group: 'Página', label: 'Recortar página', disabled: !hasDoc, run: handleCrop },

      { id: 'edit.header', group: 'Editar', label: 'Encabezado y pie', disabled: !hasDoc, run: handleHeaderFooter },
      { id: 'edit.watermark', group: 'Editar', label: 'Marca de agua', disabled: !hasDoc, run: handleWatermark },
      { id: 'edit.numbers', group: 'Editar', label: 'Numerar páginas / Bates', disabled: !hasDoc, run: handleAddPageNumbers },
      { id: 'edit.metadata', group: 'Editar', label: 'Editar metadatos', disabled: !hasDoc, run: handleEditMetadata },

      { id: 'protect.password', group: 'Proteger', label: 'Guardar con contraseña', disabled: !hasDoc, run: handleSaveWithPassword },
      { id: 'protect.nopassword', group: 'Proteger', label: 'Guardar copia sin contraseña', disabled: !hasDoc, run: handleRemovePassword },
      { id: 'protect.redact.area', group: 'Proteger', label: 'Redactar un área', disabled: !hasDoc, run: handleRedact },
      { id: 'protect.redact.text', group: 'Proteger', label: 'Buscar y redactar texto…', disabled: !hasDoc, run: () => handleRedactMatches() },

      { id: 'convert.word', group: 'Convertir', label: 'Exportar a Word', disabled: !hasDoc, run: handleExportWord },
      { id: 'convert.excel', group: 'Convertir', label: 'Exportar a Excel', disabled: !hasDoc, run: handleExportExcel },
      { id: 'convert.pptx', group: 'Convertir', label: 'Exportar a PowerPoint', disabled: !hasDoc, run: handleExportPptx },
      { id: 'convert.txt', group: 'Convertir', label: 'Exportar a texto plano', disabled: !hasDoc, run: handleExportTxt },
      { id: 'convert.html', group: 'Convertir', label: 'Exportar a HTML', disabled: !hasDoc, run: handleExportHtml },
      { id: 'convert.image', group: 'Convertir', label: 'Guardar página como imagen', disabled: !hasDoc, run: handleSavePageAsImage },
      { id: 'convert.imagestopdf', group: 'Convertir', label: 'Crear PDF a partir de imágenes', run: handleImagesToPdf },
      { id: 'convert.ocr', group: 'Convertir', label: 'OCR: hacer la página buscable', disabled: !hasDoc, run: handleMakeSearchable },
      { id: 'convert.ocr.text', group: 'Convertir', label: 'OCR: extraer texto de la página', disabled: !hasDoc, run: handleOcr },
      { id: 'convert.compress', group: 'Convertir', label: 'Comprimir PDF', disabled: !hasDoc, run: handleCompress },

      { id: 'ai.open', group: 'IA', label: 'Abrir asistente IA', run: () => window.dispatchEvent(new CustomEvent('app:ai-open')) },
      { id: 'ai.summary', group: 'IA', label: 'Resumir el documento', disabled: !hasDoc, run: () => window.dispatchEvent(new CustomEvent('app:ai-open', { detail: { preset: 'Resume este documento en puntos clave.' } })) },
    ])
  }, [activeDoc, activeTool])

  // Buscar y redactar: acción destructiva e irreversible, así que va en su propia
  // cinta (Proteger) y muestra SIEMPRE una vista previa de lo que va a tachar.
  const handleRedactMatches = async () => {
    if (!activeDoc) return
    const v = await askForm('Buscar y redactar', [
      { name: 'query', label: 'Texto a tachar permanentemente', type: 'text', defaultValue: searchInput, placeholder: 'Ej. número de cédula' },
    ], 'Buscar coincidencias')
    if (!v) return
    const query = String(v.query).trim()
    if (!query) return

    let matches: Array<{ page: number; snippet?: string }> = []
    try {
      const res = await apiFetch(`/pdf/search/${activeDoc.doc_id}?query=${encodeURIComponent(query)}&limit=500`)
      if (!res.ok) { showToast('Error al buscar coincidencias', 'error'); return }
      matches = await res.json()
    } catch (err) { toastActionError(err); return }

    if (matches.length === 0) { showToast(`Sin coincidencias para "${query}"`, 'info'); return }

    const pages = [...new Set(matches.map((m) => m.page + 1))].sort((a, b) => a - b)
    const pageList = pages.length > 12 ? `${pages.slice(0, 12).join(', ')}… (+${pages.length - 12})` : pages.join(', ')
    const preview = matches.slice(0, 5).map((m) => `  · pág. ${m.page + 1}: ${(m.snippet || '').trim().slice(0, 60)}`).join('\n')
    const ok = await askConfirm(
      'Redactar coincidencias',
      `Se tacharán ${matches.length} coincidencia(s) de "${query}" en ${pages.length} página(s): ${pageList}.\n\n${preview}${matches.length > 5 ? '\n  …' : ''}\n\nEl contenido se elimina del PDF de forma permanente. Esta acción no se puede deshacer.`,
      'Redactar',
    )
    if (!ok) return
    try {
      const res = await apiFetch(`/pdf/redact-matches/${activeDoc.doc_id}?query=${encodeURIComponent(query)}`, { method: 'POST' })
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
    if (searchAllDocs) {
      // Secuencial a propósito: el motor tiene un solo worker de fitz
      let total = 0
      for (const d of docs) {
        setSearchQuery(d.doc_id, searchInput)
        try {
          const res = await apiFetch(`/pdf/search/${d.doc_id}?query=${encodeURIComponent(searchInput)}&limit=500`)
          if (res.ok) {
            const results = await res.json()
            setSearchResults(d.doc_id, results)
            total += results.length
            if (d.doc_id === activeDoc.doc_id && results.length > 0) setPage(d.doc_id, results[0].page)
          }
        } catch (e) { console.error(e) }
      }
      showToast(`${total} resultado(s) en ${docs.length} documento(s)`, total > 0 ? 'success' : 'info')
      return
    }
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

  // Todas las cintas muestran icono + etiqueta: Comentar es justo donde más falta
  // hacen (14 herramientas), así que ahí se usa una densidad más compacta.
  const compact = activeRibbon === 'comment'
  const TBtn = ({ icon: Icon, label, tip, shortcut, onClick, active = false, disabled = false }: any) => (
    <Tooltip content={tip || label} shortcut={shortcut}>
      <button onClick={onClick} disabled={disabled} aria-label={tip || label}
        className={`flex items-center justify-center gap-1.5 rounded-token whitespace-nowrap transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          compact ? 'px-2 h-8 text-[12px]' : 'px-2.5 h-8 text-[13px]'
        } ${active ? 'bg-active text-accent' : 'text-fg hover:bg-hover'}`}>
        <Icon size={compact ? 15 : 16} strokeWidth={1.75} />
        <span>{label}</span>
      </button>
    </Tooltip>
  )
  const Sep = () => <div className="w-px h-5 mx-1 bg-border shrink-0" />

  // `label` es el rótulo corto del botón; el nombre completo y el atajo van en el
  // tooltip (TOOL_LABELS/TOOL_SHORTCUTS son la fuente única, compartida con los
  // atajos globales y la barra de estado).
  const COUNT_SYMBOL_ICONS: Array<{ id: CountSymbol; icon: any }> = [
    { id: 'circle', icon: Circle },
    { id: 'square', icon: Square },
    { id: 'triangle', icon: Triangle },
    { id: 'diamond', icon: Diamond },
    { id: 'cross', icon: X },
    { id: 'star', icon: Star },
  ]

  const COMMENT_TOOLS: Array<{ id: string; icon: any; label: string }> = [
    { id: 'select', icon: MousePointer2, label: 'Seleccionar' },
    { id: 'textselect', icon: TextSelect, label: 'Copiar texto' },
    { id: 'highlight', icon: Highlighter, label: 'Resaltar' },
    { id: 'underline', icon: Underline, label: 'Subrayar' },
    { id: 'strikethrough', icon: Strikethrough, label: 'Tachar' },
    { id: 'note', icon: MessageSquare, label: 'Nota' },
    { id: 'draw', icon: PenTool, label: 'Dibujar' },
    { id: 'signature', icon: Signature, label: 'Firma' },
    { id: 'text', icon: Type, label: 'Cuadro texto' },
    { id: 'stamp', icon: Stamp, label: 'Sello' },
    { id: 'count', icon: Tally5, label: 'Conteo' },
    { id: 'measure_calibrate', icon: Ruler, label: 'Calibrar' },
    { id: 'measure_distance', icon: MoveDiagonal, label: 'Distancia' },
    { id: 'measure_perimeter', icon: Spline, label: 'Perímetro' },
    { id: 'measure_area', icon: LandPlot, label: 'Área' },
  ]

  // Galería de formas (estilo Acrobat): las básicas + las nuevas configurables.
  const SHAPE_TOOLS: Array<{ id: string; icon: any; label: string }> = [
    { id: 'rect', icon: Square, label: 'Rectángulo' },
    { id: 'circle', icon: Circle, label: 'Círculo' },
    { id: 'line', icon: Minus, label: 'Línea' },
    { id: 'arrow', icon: ArrowRightTool, label: 'Flecha' },
    { id: 'callout', icon: MessageSquareQuote, label: 'Llamada' },
    { id: 'check', icon: CheckIcon, label: 'Check' },
    { id: 'cross', icon: X, label: 'Cruz' },
    { id: 'star', icon: Star, label: 'Estrella' },
    { id: 'cloud', icon: CloudIcon, label: 'Nube (revisión)' },
    { id: 'polygon', icon: Hexagon, label: 'Polígono (clic por vértice, doble clic cierra)' },
  ]

  const renderRibbon = () => {
    if (!activeDoc) return null
    switch (activeRibbon) {
      case 'read':
        return (
          <>
            {/* Comparando, estos botones mueven el zoom de la comparación: si siguieran
                tocando el zoom del visor oculto parecerían rotos (pasó en pruebas). */}
            <TBtn icon={ZoomOut} label="Alejar" tip="Alejar"
              onClick={() => compareMode ? setCompareZoom(compareZoom - 0.2) : setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} />
            <span className="font-mono text-xs text-fg w-10 text-center tabular-nums">
              {Math.round((compareMode ? compareZoom : activeDoc.zoom) * 100)}%
            </span>
            <TBtn icon={ZoomIn} label="Acercar" tip="Acercar"
              onClick={() => compareMode ? setCompareZoom(compareZoom + 0.2) : setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} />
            <Sep />
            <TBtn icon={Maximize2} label="Ajustar página"
              tip={compareMode ? 'Ajustar las láminas al panel' : 'Ajustar página'}
              onClick={() => compareMode ? setCompareZoom(1) : handleFit('fit-page')}
              active={compareMode ? Math.abs(compareZoom - 1) < 0.001 : activeDoc.fitMode === 'fit-page'} />
            <TBtn icon={MoveVertical} label="Ajustar ancho" tip="Ajustar al ancho" onClick={() => handleFit('fit-width')} active={activeDoc.fitMode === 'fit-width'} disabled={compareMode} />
            <Sep />
            <TBtn icon={ScrollText} label="Continuo" tip={continuousMode ? 'Vista de página única' : 'Scroll continuo'} onClick={() => toggleContinuousMode()} active={continuousMode} disabled={compareMode} />
            <TBtn icon={BookOpen} label="Lectura" tip="Modo lectura" onClick={toggleReadingMode} active={readingMode} disabled={compareMode} />
            <TBtn icon={Presentation} label="Presentación" tip="Modo presentación" onClick={() => togglePresentationMode()} disabled={compareMode} />
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
            <Tooltip content={stickyTools
              ? 'Herramienta fija: se queda activa hasta pulsar Esc'
              : 'Herramienta de un solo uso: se suelta tras cada marca'}>
              <button onClick={() => setStickyTools(!stickyTools)} aria-label="Fijar herramienta"
                className={`p-2 rounded-token transition-colors ${stickyTools ? 'bg-active text-accent' : 'text-muted hover:text-fg hover:bg-hover'}`}>
                {stickyTools ? <Pin size={15} strokeWidth={1.75} /> : <PinOff size={15} strokeWidth={1.75} />}
              </button>
            </Tooltip>
            <Sep />
            {COMMENT_TOOLS.map((t) => (
              <TBtn key={t.id} icon={t.icon} label={t.label} tip={TOOL_LABELS[t.id] || t.label}
                shortcut={TOOL_SHORTCUTS[t.id]}
                onClick={() => handleToolClick(t.id)} active={activeTool === t.id} />
            ))}
            {/* Las formas ya no son un menú aparte: al activar Dibujar aparecen todas
                en la barra de propiedades, junto al color, grosor y estilo. */}
            {activeTool === 'count' && (
              <>
                <Sep />
                <input type="text" value={countCategory} onChange={(e) => setCountCategory(e.target.value)}
                  placeholder="Categoría" title="Categoría del conteo"
                  className="w-28 px-2 py-1 text-xs rounded border border-border bg-surface text-fg shrink-0" />
                {/* Cada categoría se distingue por símbolo, no solo por color */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {COUNT_SYMBOL_ICONS.map(({ id, icon: Icon }) => (
                    <button key={id} onClick={() => setCountSymbol(id)} title={`Símbolo: ${id}`} aria-label={`Símbolo ${id}`}
                      className={`p-1 rounded transition-colors ${countSymbol === id ? 'bg-active text-accent' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted shrink-0 tabular-nums" title="Marcas de esta categoría en el documento">
                  = {activeDoc.annotations.filter((a) => a.type === 'count' && (a.text || 'General') === (countCategory || 'General')).length}
                </span>
              </>
            )}
            <Sep />
            <TBtn icon={FileDown} label="Resumen" tip="Resumen de marcas (PDF)" onClick={handleMarkupSummary} />
            <TBtn icon={FileSpreadsheet} label="Mediciones" tip="Exportar tabla de mediciones y conteos (Excel/CSV)" onClick={handleExportMeasurements} />
            <TBtn icon={FileType} label="XFDF" tip="Exportar anotaciones a XFDF (Acrobat/Bluebeam)" onClick={handleExportXfdf} />
            <TBtn icon={FilePlus2} label="Importar" tip="Importar anotaciones desde XFDF" onClick={handleImportXfdf} />
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
            <TBtn icon={FileText} label="Metadatos" tip="Editar metadatos" onClick={handleEditMetadata} />
          </>
        )
      case 'page':
        return (
          <>
            <RotatePreview degrees={-90}>
              <TBtn icon={RotateCcw} label="Rotar izq." tip="Rotar página a la izquierda" onClick={() => handleRotate(-90)} />
            </RotatePreview>
            <RotatePreview degrees={90}>
              <TBtn icon={RotateCw} label="Rotar der." tip="Rotar página a la derecha" onClick={() => handleRotate(90)} />
            </RotatePreview>
            <RotatePreview degrees={90} all>
              <TBtn icon={RefreshCw} label="Rotar todo" tip="Rotar todo el documento" onClick={() => handleRotateAll(90)} />
            </RotatePreview>
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
            <Sep />
            <TBtn icon={LayoutGrid} label="Organizar" tip="Organizar páginas a pantalla completa"
              onClick={() => window.dispatchEvent(new CustomEvent('app:page-organizer'))} />
          </>
        )
      case 'protect':
        return (
          <>
            <TBtn icon={Lock} label="Contraseña" tip="Guardar con contraseña (AES-256)" onClick={handleSaveWithPassword} />
            <TBtn icon={LockOpen} label="Quitar clave" tip="Guardar copia sin contraseña" onClick={handleRemovePassword} />
            <TBtn icon={Shield} label="Redactar" tip="Redactar área" onClick={handleRedact} />
            <TBtn icon={Search} label="Buscar y redactar" tip="Buscar un texto y tacharlo permanentemente (con vista previa)" onClick={handleRedactMatches} />
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
            <TBtn icon={ScanText} label="OCR extraer" tip="OCR página actual (extraer texto)" onClick={handleOcr} />
            <Sep />
            <TBtn icon={Minimize2} label="Comprimir" tip="Comprimir PDF" onClick={handleCompress} />
            {docs.length > 1 && (
              <>
                <Sep />
                <span className="text-xs text-muted px-1 shrink-0 self-center tabular-nums">Todos ({docs.length}):</span>
                <TBtn icon={Minimize2} label="Comprimir" tip="Comprimir todos los documentos abiertos" onClick={handleBatchCompress} />
                <TBtn icon={Stamp} label="Marca agua" tip="Marca de agua en todos los abiertos" onClick={handleBatchWatermark} />
                <TBtn icon={FileDown} label="A Word" tip="Exportar todos los abiertos a Word" onClick={handleBatchExportWord} />
              </>
            )}
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
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col shrink-0 select-none bg-toolbar text-fg">
      <RibbonTabs />

      {/* Barra contextual del modo activo */}
      {activeDoc && (
        <div className="min-h-11 border-b border-border bg-toolbar grid items-center px-3 py-1 gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div />
          <div className="flex items-center justify-center gap-1 flex-wrap min-w-0">
            {renderRibbon()}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {showSearch ? (
              <div className="flex flex-col gap-1 rounded-token border border-border bg-panel px-2 py-1.5 shadow-token">
                <div className="flex items-center gap-1">
                  <Search size={14} className="text-muted" />
                  <input ref={searchRef} type="text" placeholder="Buscar..." value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleSearchKey}
                    className="bg-transparent text-sm focus:outline-none w-28 text-fg placeholder:text-muted" />
                  <input ref={replaceRef} type="text" placeholder="Reemplazar..." value={replaceInput}
                    onChange={(e) => setReplaceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReplace()}
                    className="bg-transparent text-sm focus:outline-none w-28 text-fg placeholder:text-muted" />
                  {activeDoc.searchResults.length > 0 && (
                    <span className="text-xs text-muted tabular-nums">{activeDoc.searchIndex + 1}/{activeDoc.searchResults.length}</span>
                  )}
                  <button onClick={() => prevSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="disabled:opacity-30 text-muted hover:text-fg" aria-label="Resultado anterior"><ChevronUp size={14} /></button>
                  <button onClick={() => nextSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="disabled:opacity-30 text-muted hover:text-fg" aria-label="Resultado siguiente"><ChevronDown size={14} /></button>
                  <button onClick={handleCloseSearch} className="ml-1 text-muted hover:text-fg" aria-label="Cerrar búsqueda"><X size={14} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-muted" title="Distinguir mayúsculas y minúsculas">
                    <input type="checkbox" checked={replaceCaseSensitive} onChange={(e) => setReplaceCaseSensitive(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                    Aa
                  </label>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-muted" title="Buscar en todos los documentos abiertos">
                    <input type="checkbox" checked={searchAllDocs} onChange={(e) => setSearchAllDocs(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                    Todos los docs
                  </label>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer text-muted">
                    <input type="checkbox" checked={replaceAllPages} onChange={(e) => setReplaceAllPages(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                    Todo el doc
                  </label>
                  <button onClick={handleReplace} disabled={!searchInput.trim()}
                    className={`text-[11px] px-2 py-0.5 rounded border ${searchInput.trim() ? 'border-border text-fg hover:bg-hover' : 'border-transparent opacity-40 bg-hover text-muted'}`}>Reemplazar</button>
                  <button onClick={handleReplaceAll} disabled={!searchInput.trim()}
                    className={`text-[11px] px-2 py-0.5 rounded ${searchInput.trim() ? 'bg-fg text-toolbar hover:opacity-90' : 'opacity-40 bg-hover text-muted'}`}>Reemplazar todo</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="p-1.5 rounded transition-colors text-muted hover:text-fg hover:bg-hover" title="Buscar (Ctrl+F)">
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
