import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
  Search, AlignVerticalJustifyCenter,
  X, ChevronDown, ChevronUp, ChevronRight, Merge,
  BookOpen, Printer,
  FileDown, GitCompare, RefreshCw, Scissors, Stamp, FileText, Presentation, ScrollText,
  Volume2, VolumeX, ScanText,
  Highlighter, Underline, Strikethrough, MessageSquare, PenTool, Signature,
  Type, Image as ImageIcon, Images, Square, Circle, ArrowRight as ArrowRightTool, Ruler, Pencil,
  MoveDiagonal, LandPlot, MousePointer2, TextSelect, Copy, Crop, Lock, Shield,
  FileSpreadsheet, FileImage, Sparkles, MessageCircleQuestion, ListTree,
  FileType, Code2, LockOpen, FilePlus2, Tally5,
  Check as CheckIcon, Star, Cloud as CloudIcon, Hexagon, Pin, PinOff,
  Minus, MessageSquareQuote, Spline, Triangle, Diamond, LayoutGrid,
  TextCursorInput, CircleDot, List, MoreHorizontal, Eraser,
} from 'lucide-react'
import { usePdfStore, type CountSymbol } from '../store/usePdfStore'
import { correrCola } from '../lib/batchQueue'
import { TOOL_LABELS, TOOL_SHORTCUTS } from '../lib/tools'
import {
  DRAW_BASIC_IDS, DRAW_SHAPE_IDS, MEASURE_FAMILY_IDS, MORE_TOOL_IDS,
  isDrawFamily, isDrawShape, isMeasureFamily, isMoreTool,
} from '../lib/commentRibbon'
import { registerCommands } from '../lib/commands'
import RibbonTabs from './ribbon/RibbonTabs'
import PrintDialog from './PrintDialog'
import PropertiesBar from './PropertiesBar'
import { useFormModal } from './FormModal'
import { usePdfActions } from '../hooks/usePdfActions'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import Tooltip from './Tooltip'

import { apiFetch } from '../lib/api'
import { leerEnVozAlta, detenerLectura } from '../lib/speech'
import { redactMatchesUndoable, replaceTextUndoable } from '../lib/pageUndo'

export default function Toolbar() {
  const {
    docs, activeDocId, setPage,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    showToast,
    readingMode, toggleReadingMode, togglePresentationMode, toggleContinuousMode,
    compareMode, activeRibbon, activeTool,
    countCategory, setCountCategory, countSymbol, setCountSymbol,
    stickyTools, setStickyTools, setActiveRibbon,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'showToast',
    'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'toggleContinuousMode',
    'compareMode', 'activeRibbon', 'activeTool',
    'countCategory', 'setCountCategory', 'countSymbol', 'setCountSymbol',
    'stickyTools', 'setStickyTools', 'setActiveRibbon',
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
  const [showReplace, setShowReplace] = useState(false)
  const [replaceInput, setReplaceInput] = useState('')
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false)
  const [replaceAllPages, setReplaceAllPages] = useState(true)
  const [searchAllDocs, setSearchAllDocs] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [commentMenu, setCommentMenu] = useState<string | null>(null)
  const [drawFormasOpen, setDrawFormasOpen] = useState(false)
  const [lastDrawTool, setLastDrawTool] = useState('draw')
  const [lastMeasureTool, setLastMeasureTool] = useState('measure_distance')
  const searchRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showSearch) return
    if (showReplace) replaceRef.current?.focus()
    else searchRef.current?.focus()
  }, [showSearch, showReplace])

  useEffect(() => { setCommentMenu(null); setDrawFormasOpen(false) }, [activeRibbon])
  useEffect(() => { if (commentMenu !== 'draw') setDrawFormasOpen(false) }, [commentMenu])

  // Esc cerraba la herramienta pero dejaba el desplegable de formas abierto: se cierra
  // primero el menú (en captura, para que el atajo global no suelte además la
  // herramienta que el usuario estaba por elegir).
  useEffect(() => {
    if (!commentMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeCommentMenu()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [commentMenu])

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
      { id: 'markup.xfdf', group: 'Marcas', label: 'Exportar marcas', disabled: !hasDoc, run: handleExportXfdf },
      { id: 'markup.xfdf.import', group: 'Marcas', label: 'Importar marcas', disabled: !hasDoc, run: handleImportXfdf },

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
      { id: 'edit.numbers', group: 'Editar', label: 'Numerar páginas', disabled: !hasDoc, run: handleAddPageNumbers },
      { id: 'edit.metadata', group: 'Editar', label: 'Editar metadatos', disabled: !hasDoc, run: handleEditMetadata },
      { id: 'edit.formtext', group: 'Formulario', label: 'Campo de texto', disabled: !hasDoc, run: () => { setActiveRibbon('edit'); handleToolClick('formtext') } },
      { id: 'edit.formcheck', group: 'Formulario', label: 'Casilla', disabled: !hasDoc, run: () => { setActiveRibbon('edit'); handleToolClick('formcheck') } },
      { id: 'edit.formradio', group: 'Formulario', label: 'Botón de opción', disabled: !hasDoc, run: () => { setActiveRibbon('edit'); handleToolClick('formradio') } },
      { id: 'edit.formcombo', group: 'Formulario', label: 'Lista desplegable', disabled: !hasDoc, run: () => { setActiveRibbon('edit'); handleToolClick('formcombo') } },

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
      // La vista previa se pide con limit=500. Si se llega al tope, el motor redacta
      // igualmente TODAS las coincidencias, así que el mensaje no puede prometer 500.
      `Se tacharán ${matches.length >= 500 ? 'todas las coincidencias' : `${matches.length} coincidencia(s)`} de "${query}"`
      + ` en ${pages.length} página(s)${matches.length >= 500 ? ' o más' : ''}: ${pageList}.`
      + `\n\n${preview}${matches.length > 5 ? '\n  …' : ''}`
      + '\n\nEl contenido se elimina del PDF. Ctrl+Z restaura el documento anterior.',
      'Redactar',
    )
    if (!ok) return
    try {
      const n = await redactMatchesUndoable(activeDoc.doc_id, query)
      showToast(`${n} ocurrencia(s) redactada(s). Ctrl+Z deshace.`, 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleReadAloud = async () => {
    if (!activeDoc) return
    if (isSpeaking) { detenerLectura(); setIsSpeaking(false); return }
    try {
      const res = await apiFetch(`/pdf/text/${activeDoc.doc_id}/${activeDoc.currentPage}`)
      const data = await res.json()
      const text: string = (data.blocks ? data.blocks.map((b: any) => b.text).join(' ') : data.text) || ''
      if (!text.trim()) { showToast('No hay texto en esta página', 'info'); return }
      leerEnVozAlta(text, () => setIsSpeaking(false))
      setIsSpeaking(true)
    } catch { showToast('Error al leer la página', 'error') }
  }

  // La voz seguía leyendo la página anterior al cambiar de página o de pestaña, y
  // seguía sonando con la app cerrada de vista.
  useEffect(() => {
    detenerLectura()
    setIsSpeaking(false)
  }, [activeDoc?.doc_id, activeDoc?.currentPage])

  useEffect(() => () => { detenerLectura() }, [])

  // --- Por lotes: aplica una operación a TODOS los documentos abiertos ---
  const handleSearch = async () => {
    if (!activeDoc || !searchInput.trim()) return
    const { startProgress, updateProgress, endProgress, isCancelRequested } = usePdfStore.getState()
    if (searchAllDocs) {
      // Secuencial a propósito: el motor tiene un solo worker de fitz. Buscar en 60
      // planos abiertos son minutos, y no había ni progreso ni forma de cancelar: la
      // app se veía colgada. Se reusa la barra de las operaciones por lotes.
      startProgress(`Buscar «${searchInput}»`, docs.length)
      let total = 0
      let resultado
      try {
        resultado = await correrCola(docs, async (d) => {
          setSearchQuery(d.doc_id, searchInput)
          try {
            const res = await apiFetch(`/pdf/search/${d.doc_id}?query=${encodeURIComponent(searchInput)}&limit=500`)
            if (!res.ok) return false
            const results = await res.json()
            setSearchResults(d.doc_id, results)
            total += results.length
            if (d.doc_id === activeDoc.doc_id && results.length > 0) setPage(d.doc_id, results[0].page)
            return true
          } catch { return false }
        }, {
          avanzar: (n, d) => updateProgress(n, d.file_name),
          cancelado: isCancelRequested,
        })
      } finally {
        endProgress()
      }
      const { ok, hechos, cancelado } = resultado
      if (ok === 0 && hechos > 0) showToast('No se pudo buscar', 'error')
      else if (cancelado) showToast(`Cancelado: ${total} resultado(s) en ${hechos} de ${docs.length} documento(s)`, 'info')
      else showToast(`${total} resultado(s) en ${docs.length} documento(s)`, total > 0 ? 'success' : 'info')
      return
    }
    setSearchQuery(activeDoc.doc_id, searchInput)
    // Un plano de 300 páginas también tarda: el motor recorre el documento entero
    // cuando el texto no aparece. Progreso indeterminado, sin cancelar (es una sola
    // llamada al motor y cortarla del lado del cliente no lo detiene).
    startProgress(`Buscar «${searchInput}»`, 0, false)
    try {
      const res = await apiFetch(`/pdf/search/${activeDoc.doc_id}?query=${encodeURIComponent(searchInput)}&limit=500`)
      if (res.ok) {
        const results = await res.json()
        setSearchResults(activeDoc.doc_id, results)
        if (results.length > 0) setPage(activeDoc.doc_id, results[0].page)
      } else {
        showToast('No se pudo buscar', 'error')
      }
    } catch { showToast('No se pudo buscar', 'error') } finally {
      endProgress()
    }
  }

  const handleSearchKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }
  const handleCloseSearch = () => {
    setShowSearch(false)
    setShowReplace(false)
    setSearchInput('')
    setReplaceInput('')
    if (activeDoc) setSearchQuery(activeDoc.doc_id, '')
  }

  const handleReplace = async () => {
    if (!activeDoc || !searchInput.trim()) return
    try {
      const n = await replaceTextUndoable(activeDoc.doc_id, {
        query: searchInput,
        replace: replaceInput,
        page: replaceAllPages ? undefined : activeDoc.currentPage,
        caseSensitive: replaceCaseSensitive,
        replaceAll: false,
      })
      if (n > 0) {
        showToast(`${n} reemplazo(s). Ctrl+Z deshace.`, 'success')
        handleSearch()
      } else {
        showToast('Texto no encontrado', 'info')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleReplaceAll = async () => {
    if (!activeDoc || !searchInput.trim()) return
    if (!(await askConfirm('Reemplazar todo', `Se reemplazarán todas las ocurrencias de "${searchInput}" por "${replaceInput}". Ctrl+Z deshace.`, 'Reemplazar todo'))) return
    try {
      const n = await replaceTextUndoable(activeDoc.doc_id, {
        query: searchInput,
        replace: replaceInput,
        page: replaceAllPages ? undefined : activeDoc.currentPage,
        caseSensitive: replaceCaseSensitive,
        replaceAll: true,
      })
      if (n > 0) {
        showToast(`${n} reemplazo(s). Ctrl+Z deshace.`, 'success')
        handleSearch()
      } else {
        showToast('Texto no encontrado', 'info')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  // `active` sin valor por defecto a propósito: solo los botones que SON un
  // interruptor (herramienta, lectura, presentación, comparar) lo pasan, y solo esos
  // llevan aria-pressed — en los de acción suelta anunciaría un estado que no existe.
  const TBtn = ({ icon: Icon, label, tip, shortcut, onClick, active, disabled = false }: any) => (
    <Tooltip content={tip || label} shortcut={shortcut}>
      <button onClick={onClick} disabled={disabled} aria-label={tip || label} aria-pressed={active}
        className={`flex items-center justify-center gap-1.5 px-2.5 h-8 text-ui rounded-token whitespace-nowrap transition-colors duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed ${
          active ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover active:bg-active'
        }`}>
        <Icon size={16} strokeWidth={1.75} />
        <span>{label}</span>
      </button>
    </Tooltip>
  )
  const Sep = () => <div className="w-px h-4 mx-1 bg-border shrink-0" />
  const closeCommentMenu = () => { setCommentMenu(null); setDrawFormasOpen(false) }
  const MenuItem = ({ id, icon: Icon, label }: { id: string; icon: any; label: string }) => (
    <button role="menuitem" onClick={() => {
      if (isDrawFamily(id)) setLastDrawTool(id)
      if (isMeasureFamily(id)) setLastMeasureTool(id)
      handleToolClick(id)
      closeCommentMenu()
    }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-mini text-left transition-colors ${
        activeTool === id ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover'
      }`}>
      <Icon size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="flex-1">{TOOL_LABELS[id] || label}</span>
      {TOOL_SHORTCUTS[id] && (
        <kbd className="text-micro text-muted">{TOOL_SHORTCUTS[id]}</kbd>
      )}
    </button>
  )
  const SplitTool = ({
    family, icon: Icon, label, tip, shortcut, active, onActivate, children,
  }: {
    family: 'draw' | 'measure'
    icon: any
    label: string
    tip: string
    shortcut?: string
    active: boolean
    onActivate: () => void
    children: ReactNode
  }) => {
    const open = commentMenu === family
    return (
      <div className="relative flex items-stretch shrink-0">
        <Tooltip content={tip} shortcut={shortcut}>
          <button onClick={() => { onActivate(); closeCommentMenu() }} aria-label={tip}
            className={`flex items-center gap-1.5 pl-2.5 pr-1.5 h-8 text-ui rounded-l-token whitespace-nowrap transition-colors ${
              active ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover'
            }`}>
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        </Tooltip>
        <button type="button" aria-label={`${label}: más opciones`} aria-expanded={open} aria-haspopup="menu"
          onClick={() => setCommentMenu(open ? null : family)}
          className={`px-1 h-8 rounded-r-token border-l transition-colors ${
            active || open
              ? 'bg-accent text-on-accent border-toolbar/20'
              : 'text-muted hover:text-fg hover:bg-hover border-border'
          }`}>
          <ChevronDown size={12} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-sticky" onClick={closeCommentMenu} />
            <div role="menu" className="menu-pop absolute top-full left-0 z-dropdown mt-1 min-w-[220px] border border-border rounded-token shadow-token-md py-1 bg-panel">
              {children}
            </div>
          </>
        )}
      </div>
    )
  }
  const OverflowMenu = ({
    id, icon: Icon, label, active, children,
  }: {
    id: string
    icon: any
    label: string
    active?: boolean
    children: ReactNode
  }) => {
    const open = commentMenu === id
    return (
      <div className="relative shrink-0">
        <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu"
          onClick={() => setCommentMenu(open ? null : id)}
          className={`flex items-center gap-1.5 px-2.5 h-8 text-ui rounded-token whitespace-nowrap transition-colors ${
            active || open ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover'
          }`}>
          <Icon size={16} strokeWidth={1.75} />
          <span>{label}</span>
          <ChevronDown size={12} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-sticky" onClick={closeCommentMenu} />
            <div role="menu" className="menu-pop absolute top-full right-0 z-dropdown mt-1 min-w-[220px] border border-border rounded-token shadow-token-md py-1 bg-panel">
              {children}
            </div>
          </>
        )}
      </div>
    )
  }

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
    { id: 'eraser', icon: Eraser, label: 'Borrador' },
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
            <TBtn icon={BookOpen} label="Lectura" tip="Modo lectura" onClick={toggleReadingMode} active={readingMode} disabled={compareMode} />
            <TBtn icon={Presentation} label="Presentación" tip="Modo presentación" onClick={() => togglePresentationMode()} disabled={compareMode} />
            <TBtn icon={GitCompare} label="Comparar" tip="Comparar PDFs" onClick={handleCompare} active={compareMode} />
            <Sep />
            <TBtn icon={Highlighter} label="Resaltar" tip={TOOL_LABELS.highlight}
              shortcut={TOOL_SHORTCUTS.highlight}
              onClick={() => { setActiveRibbon('comment'); handleToolClick('highlight') }}
              active={activeTool === 'highlight'} disabled={compareMode} />
            <TBtn icon={MessageSquare} label="Nota" tip={TOOL_LABELS.note}
              shortcut={TOOL_SHORTCUTS.note}
              onClick={() => { setActiveRibbon('comment'); handleToolClick('note') }}
              active={activeTool === 'note'} disabled={compareMode} />
            <Sep />
            <TBtn icon={isSpeaking ? VolumeX : Volume2} label="Leer" tip={isSpeaking ? 'Detener' : 'Leer en voz alta'} onClick={handleReadAloud} active={isSpeaking} />
            <TBtn icon={Printer} label="Imprimir" tip="Imprimir" onClick={() => setShowPrint(true)} />
          </>
        )
      case 'comment': {
        const allTools = [...COMMENT_TOOLS, ...SHAPE_TOOLS]
        const byId = (id: string) => allTools.find((t) => t.id === id)
        const drawId = isDrawFamily(activeTool) ? activeTool! : lastDrawTool
        const measureId = isMeasureFamily(activeTool) ? activeTool! : lastMeasureTool
        const drawDef = byId(drawId) || byId('draw')!
        const measureDef = byId(measureId) || byId('measure_distance')!
        const moreActive = isMoreTool(activeTool)
        return (
          <>
            <Tooltip content={stickyTools
              ? 'Herramienta fija: se queda activa hasta pulsar Esc'
              : 'Herramienta de un solo uso: se suelta tras cada marca'}>
              <button onClick={() => setStickyTools(!stickyTools)} aria-label="Fijar herramienta"
                className={`p-2 rounded-token transition-colors ${stickyTools ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg hover:bg-hover'}`}>
                {stickyTools ? <Pin size={16} strokeWidth={1.75} /> : <PinOff size={16} strokeWidth={1.75} />}
              </button>
            </Tooltip>
            <Sep />
            <TBtn icon={MousePointer2} label="Seleccionar" tip={TOOL_LABELS.select}
              shortcut={TOOL_SHORTCUTS.select}
              onClick={() => handleToolClick('select')} active={activeTool === 'select'} />
            <TBtn icon={Eraser} label="Borrador" tip="Borrador: pasá sobre un dibujo y lo corta, como el borrador de un lápiz"
              shortcut={TOOL_SHORTCUTS.eraser}
              onClick={() => handleToolClick('eraser')} active={activeTool === 'eraser'} />
            <TBtn icon={Highlighter} label="Resaltar" tip={TOOL_LABELS.highlight}
              shortcut={TOOL_SHORTCUTS.highlight}
              onClick={() => handleToolClick('highlight')} active={activeTool === 'highlight'} />
            <TBtn icon={MessageSquare} label="Nota" tip={TOOL_LABELS.note}
              shortcut={TOOL_SHORTCUTS.note}
              onClick={() => handleToolClick('note')} active={activeTool === 'note'} />
            <TBtn icon={Tally5} label="Conteo" tip={TOOL_LABELS.count}
              shortcut={TOOL_SHORTCUTS.count}
              onClick={() => handleToolClick('count')} active={activeTool === 'count'} />
            <SplitTool
              family="draw"
              icon={drawDef.icon}
              label={isDrawFamily(activeTool) ? (TOOL_LABELS[drawId] || drawDef.label) : 'Dibujar'}
              tip={TOOL_LABELS[drawId] || 'Dibujar'}
              shortcut={TOOL_SHORTCUTS[drawId]}
              active={isDrawFamily(activeTool)}
              onActivate={() => { setLastDrawTool(drawId); handleToolClick(drawId) }}
            >
              {DRAW_BASIC_IDS.map((id) => {
                const t = byId(id)
                return t ? <MenuItem key={id} id={id} icon={t.icon} label={t.label} /> : null
              })}
              <div className="relative">
                <button type="button" role="menuitem"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDrawFormasOpen((o) => !o) }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-mini text-left transition-colors ${
                    isDrawShape(activeTool) || drawFormasOpen ? 'bg-accent text-on-accent' : 'text-fg hover:bg-hover'
                  }`}>
                  <Hexagon size={14} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1">Formas</span>
                  <ChevronRight size={12} />
                </button>
                {drawFormasOpen && (
                  <div role="menu" className="menu-pop absolute left-full top-0 z-dropdown ml-1 min-w-[200px] border border-border rounded-token shadow-token-md py-1 bg-panel">
                    {DRAW_SHAPE_IDS.map((id) => {
                      const t = byId(id)
                      return t ? <MenuItem key={id} id={id} icon={t.icon} label={t.label} /> : null
                    })}
                  </div>
                )}
              </div>
            </SplitTool>
            <SplitTool
              family="measure"
              icon={measureDef.icon}
              label={isMeasureFamily(activeTool) ? (TOOL_LABELS[measureId] || measureDef.label) : 'Medir'}
              tip={TOOL_LABELS[measureId] || 'Medir'}
              shortcut={TOOL_SHORTCUTS[measureId]}
              active={isMeasureFamily(activeTool)}
              onActivate={() => { setLastMeasureTool(measureId); handleToolClick(measureId) }}
            >
              {MEASURE_FAMILY_IDS.map((id) => {
                const t = byId(id)
                return t ? <MenuItem key={id} id={id} icon={t.icon} label={t.label} /> : null
              })}
            </SplitTool>
            <Sep />
            <OverflowMenu id="more" icon={MoreHorizontal} label="Más" active={moreActive}>
              {MORE_TOOL_IDS.map((id) => {
                const t = byId(id)
                return t ? <MenuItem key={id} id={id} icon={t.icon} label={t.label} /> : null
              })}
            </OverflowMenu>
            <OverflowMenu id="export" icon={FileDown} label="Exportar">
              <button role="menuitem" onClick={() => { handleMarkupSummary(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileDown size={14} /> Resumen de marcas
              </button>
              <button role="menuitem" onClick={() => { handleExportMeasurements(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileSpreadsheet size={14} /> Mediciones y conteos
              </button>
              <button role="menuitem" onClick={() => { handleExportXfdf(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileType size={14} /> Exportar marcas
              </button>
              <button role="menuitem" onClick={() => { handleImportXfdf(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FilePlus2 size={14} /> Importar marcas
              </button>
            </OverflowMenu>
            {activeTool === 'count' && (
              <>
                <Sep />
                <input type="text" value={countCategory} onChange={(e) => setCountCategory(e.target.value)}
                  placeholder="Categoría" title="Categoría del conteo" aria-label="Categoría del conteo"
                  className="w-28 px-2 py-1 text-mini rounded-token-sm border border-border bg-surface text-fg shrink-0" />
                <div className="flex items-center gap-0.5 shrink-0">
                  {COUNT_SYMBOL_ICONS.map(({ id, icon: Icon }) => (
                    <button key={id} onClick={() => setCountSymbol(id)} title={`Símbolo: ${id}`} aria-label={`Símbolo ${id}`}
                      className={`p-1 rounded-token-sm transition-colors ${countSymbol === id ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
                <span className="text-mini text-muted shrink-0 tabular" title="Marcas de esta categoría en el documento">
                  = {activeDoc.annotations.filter((a) => a.type === 'count' && (a.text || 'General') === (countCategory || 'General')).length}
                </span>
              </>
            )}
          </>
        )
      }
      case 'edit': {
        const contentOn = ['edittext', 'text', 'image', 'editimage'].includes(activeTool || '')
        const formOn = ['formtext', 'formcheck', 'formradio', 'formcombo'].includes(activeTool || '')
        const itemCls = (id: string) =>
          `w-full flex items-center gap-2 px-3 py-1.5 text-mini text-left hover:bg-hover ${activeTool === id ? 'bg-accent text-on-accent' : 'text-fg'}`
        return (
          <>
            <OverflowMenu id="edit-content" icon={Type} label="Contenido" active={contentOn}>
              <button role="menuitem" onClick={() => { handleToolClick('edittext'); closeCommentMenu() }} className={itemCls('edittext')}>
                <Pencil size={14} /> Editar texto
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('text'); closeCommentMenu() }} className={itemCls('text')}>
                <Type size={14} /> Texto
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('image'); closeCommentMenu() }} className={itemCls('image')}>
                <ImageIcon size={14} /> Imagen
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('editimage'); closeCommentMenu() }} className={itemCls('editimage')}>
                <Images size={14} /> Editar imagen
              </button>
            </OverflowMenu>
            <OverflowMenu id="edit-form" icon={TextCursorInput} label="Formulario" active={formOn}>
              <button role="menuitem" onClick={() => { handleToolClick('formtext'); closeCommentMenu() }} className={itemCls('formtext')}>
                <TextCursorInput size={14} /> Campo de texto
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('formcheck'); closeCommentMenu() }} className={itemCls('formcheck')}>
                <CheckIcon size={14} /> Casilla
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('formradio'); closeCommentMenu() }} className={itemCls('formradio')}>
                <CircleDot size={14} /> Opción
              </button>
              <button role="menuitem" onClick={() => { handleToolClick('formcombo'); closeCommentMenu() }} className={itemCls('formcombo')}>
                <List size={14} /> Lista
              </button>
            </OverflowMenu>
            <OverflowMenu id="edit-doc" icon={FileText} label="Documento">
              <button role="menuitem" onClick={() => { handleHeaderFooter(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <AlignVerticalJustifyCenter size={14} /> Encabezado y pie
              </button>
              <button role="menuitem" onClick={() => { handleWatermark(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Stamp size={14} /> Marca de agua
              </button>
              <button role="menuitem" onClick={() => { handleAddPageNumbers(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileText size={14} /> Numerar páginas
              </button>
              <button role="menuitem" onClick={() => { handleEditMetadata(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileText size={14} /> Metadatos
              </button>
            </OverflowMenu>
          </>
        )
      }
      case 'page':
        return (
          <>
            <OverflowMenu id="page-rotate" icon={RotateCw} label="Rotar">
              <button role="menuitem" onClick={() => { handleRotate(-90); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <RotateCcw size={14} /> Rotar a la izquierda
              </button>
              <button role="menuitem" onClick={() => { handleRotate(90); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <RotateCw size={14} /> Rotar a la derecha
              </button>
              <button role="menuitem" onClick={() => { handleRotateAll(90); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <RefreshCw size={14} /> Rotar todo el documento
              </button>
            </OverflowMenu>
            <OverflowMenu id="page-pages" icon={FilePlus} label="Páginas">
              <button role="menuitem" onClick={() => { handleInsertBlank(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FilePlus size={14} /> Insertar en blanco
              </button>
              <button role="menuitem" onClick={() => { handleDuplicatePage(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Copy size={14} /> Duplicar
              </button>
              <button role="menuitem" onClick={() => { handleDeletePage(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Trash2 size={14} /> Eliminar
              </button>
              <button role="menuitem" onClick={() => { window.dispatchEvent(new CustomEvent('app:page-organizer')); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <LayoutGrid size={14} /> Organizar
              </button>
            </OverflowMenu>
            <OverflowMenu id="page-extract" icon={Scissors} label="Extraer">
              <button role="menuitem" onClick={() => { handleMerge(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Merge size={14} /> Combinar otro PDF
              </button>
              <div className="h-px my-1 bg-border" />
              {([['even', 'Dividir páginas pares'], ['odd', 'Dividir páginas impares'], ['range', 'Dividir rango…'], ['from-current', 'Dividir desde la actual']] as const).map(([m, lbl]) => (
                <button key={m} role="menuitem" onClick={() => { handleSplit(m); closeCommentMenu() }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                  <Scissors size={14} /> {lbl}
                </button>
              ))}
              <div className="h-px my-1 bg-border" />
              <button role="menuitem" onClick={() => { handleCrop(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Crop size={14} /> Recortar
              </button>
            </OverflowMenu>
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
            <OverflowMenu id="cvt-office" icon={FileDown} label="Oficina">
              <button role="menuitem" onClick={() => { handleExportWord(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileDown size={14} /> Word
              </button>
              <button role="menuitem" onClick={() => { handleExportExcel(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button role="menuitem" onClick={() => { handleExportPptx(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Presentation size={14} /> PowerPoint
              </button>
            </OverflowMenu>
            <OverflowMenu id="cvt-text" icon={FileType} label="Texto">
              <button role="menuitem" onClick={() => { handleExportTxt(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileType size={14} /> TXT
              </button>
              <button role="menuitem" onClick={() => { handleExportHtml(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <Code2 size={14} /> HTML
              </button>
            </OverflowMenu>
            <OverflowMenu id="cvt-image" icon={FileImage} label="Imagen">
              <button role="menuitem" onClick={() => { handleSavePageAsImage(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FileImage size={14} /> Página como imagen
              </button>
              <button role="menuitem" onClick={() => { handleImagesToPdf(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <FilePlus2 size={14} /> Imágenes → PDF
              </button>
            </OverflowMenu>
            <OverflowMenu id="cvt-ocr" icon={ScanText} label="OCR">
              <button role="menuitem" onClick={() => { handleMakeSearchable(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <ScanText size={14} /> Hacer página buscable
              </button>
              <button role="menuitem" onClick={() => { handleOcr(); closeCommentMenu() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-mini text-fg hover:bg-hover text-left">
                <ScanText size={14} /> Extraer texto
              </button>
            </OverflowMenu>
            <Sep />
            <TBtn icon={Minimize2} label="Comprimir" tip="Comprimir PDF" onClick={handleCompress} />
            {docs.length > 1 && (
              <>
                <Sep />
                <span className="text-mini text-muted px-1 shrink-0 self-center tabular">Todos ({docs.length}):</span>
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
    <div className="flex flex-col shrink-0 select-none bg-toolbar text-fg border-b border-border-strong">
      <RibbonTabs />

      {/* Barra contextual del modo activo */}
      {activeDoc && (
        <div className="min-h-11 bg-toolbar flex items-center justify-between px-2 py-1 gap-2">
          <div className={`flex items-center justify-start gap-1 min-w-0 ${activeRibbon === 'comment' ? 'flex-nowrap' : 'flex-wrap'}`}>
            {renderRibbon()}
          </div>
          <div className="flex items-center gap-2 justify-end shrink-0">
            {showSearch ? (
              <div className="flex flex-col gap-1 rounded-token border border-border bg-panel px-2 py-1.5 shadow-token-md">
                <div className="flex items-center gap-1">
                  <Search size={14} className="text-muted" />
                  <input ref={searchRef} type="text" placeholder="Buscar…" value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleSearchKey}
                    aria-label="Buscar en el documento"
                    className="bg-transparent text-base focus:outline-none w-28 text-fg placeholder:text-muted" />
                  {/* Con cero resultados no se mostraba NADA: ni contador ni aviso, así
                      que no se sabía si la búsqueda había llegado a ejecutarse. El
                      aria-live hace que un lector de pantalla cante el resultado. */}
                  <span className="text-mini text-muted tabular" aria-live="polite">
                    {activeDoc.searchResults.length > 0
                      ? `${activeDoc.searchIndex + 1}/${activeDoc.searchResults.length}${activeDoc.searchResults.length >= 500 ? '+' : ''}`
                      : activeDoc.searchQuery ? 'Sin resultados' : ''}
                  </span>
                  <button onClick={() => prevSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="disabled:opacity-40 disabled:cursor-not-allowed text-muted hover:text-fg" aria-label="Resultado anterior"><ChevronUp size={14} /></button>
                  <button onClick={() => nextSearchResult(activeDoc.doc_id)} disabled={activeDoc.searchResults.length === 0} className="disabled:opacity-40 disabled:cursor-not-allowed text-muted hover:text-fg" aria-label="Resultado siguiente"><ChevronDown size={14} /></button>
                  <button onClick={() => setShowReplace((v) => !v)} aria-pressed={showReplace}
                    className={`text-micro px-2 py-0.5 rounded-token-sm border ${showReplace ? 'bg-accent text-on-accent border-transparent' : 'border-border text-fg hover:bg-hover'}`}>
                    Reemplazar
                  </button>
                  <button onClick={handleCloseSearch} className="ml-1 text-muted hover:text-fg" aria-label="Cerrar búsqueda"><X size={14} /></button>
                </div>
                {showReplace && (
                  <div className="flex items-center gap-2">
                    <input ref={replaceRef} type="text" placeholder="Reemplazar…" value={replaceInput}
                      onChange={(e) => setReplaceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReplace()}
                      aria-label="Reemplazar por"
                      className="bg-transparent text-base focus:outline-none w-28 text-fg placeholder:text-muted" />
                    <label className="flex items-center gap-1 text-micro cursor-pointer text-muted" title="Distinguir mayúsculas y minúsculas">
                      <input type="checkbox" checked={replaceCaseSensitive} onChange={(e) => setReplaceCaseSensitive(e.target.checked)}
                        aria-label="Distinguir mayúsculas y minúsculas" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                      Aa
                    </label>
                    <label className="flex items-center gap-1 text-micro cursor-pointer text-muted" title="Buscar en todos los documentos abiertos">
                      <input type="checkbox" checked={searchAllDocs} onChange={(e) => setSearchAllDocs(e.target.checked)}
                        aria-label="Buscar en todos los documentos abiertos" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                      Todos los docs
                    </label>
                    <label className="flex items-center gap-1 text-micro cursor-pointer text-muted">
                      <input type="checkbox" checked={replaceAllPages} onChange={(e) => setReplaceAllPages(e.target.checked)}
                        aria-label="Reemplazar en todo el documento" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                      Todo el doc
                    </label>
                    <button onClick={handleReplace} disabled={!searchInput.trim()}
                      className={`text-micro px-2 py-0.5 rounded-token-sm border ${searchInput.trim() ? 'border-border text-fg hover:bg-hover' : 'border-transparent opacity-40 bg-hover text-muted'}`}>Reemplazar</button>
                    <button onClick={handleReplaceAll} disabled={!searchInput.trim()}
                      className={`text-micro px-2 py-0.5 rounded-token-sm ${searchInput.trim() ? 'bg-accent text-on-accent hover:brightness-110 active:brightness-95' : 'opacity-40 bg-hover text-muted'}`}>Reemplazar todo</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="p-1.5 rounded-token-sm transition-colors text-muted hover:text-fg hover:bg-hover" title="Buscar (Ctrl+F)" aria-label="Buscar">
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
