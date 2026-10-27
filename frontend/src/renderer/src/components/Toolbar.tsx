import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
  Search, AlignVerticalJustifyCenter,
  X, ChevronUp, ChevronDown, Merge,
  BookOpen,
  FileDown, GitCompare, RefreshCw, Scissors, Stamp, FileText, Presentation, ScrollText,
  Volume2, VolumeX, ScanText, ScanSearch, SearchX,
  Highlighter, Underline, Strikethrough, MessageSquare, PenTool, Signature,
  Type, Image as ImageIcon, Images, Square, Circle, ArrowRight as ArrowRightTool, Ruler, Pencil,
  MoveDiagonal, LandPlot, MousePointer2, TextSelect, Copy, Crop, Lock, Shield,
  FileSpreadsheet, FileImage, Sparkles, MessageCircleQuestion, ListTree,
  FileType, Code2, LockOpen, FilePlus2, Tally5,
  Check as CheckIcon, Star, Cloud as CloudIcon, Hexagon, Pin, PinOff,
  Minus, MessageSquareQuote, Spline, Triangle, Diamond, LayoutGrid,
  TextCursorInput, CircleDot, List, Eraser, SquareCheck as CheckSquare,
  Maximize2, MoveHorizontal, Rows3, ClipboardList, ArrowLeftRight, Droplets, ListOrdered, Info,
  type LucideIcon,
} from 'lucide-react'
import { usePdfStore, type CountSymbol } from '../store/usePdfStore'
import { correrLote } from '../lib/lote'
import { TOOL_LABELS, TOOL_SHORTCUTS } from '../lib/tools'
import { ribbonForTool } from '../lib/commentRibbon'
import { registerCommands } from '../lib/commands'
import RibbonTabs from './ribbon/RibbonTabs'
import { RibbonSep } from './ribbon/RibbonOverflow'
import {
  RibbonButton, RibbonGallery, RibbonGroup, RibbonMenuButton, RibbonMenuItem, RibbonMenuSep, RibbonSmallButton,
} from './ribbon/RibbonControls'
import PrintDialog from './PrintDialog'
import SellosDialog from './SellosDialog'
import type { CapaSello } from '../lib/sellos'
import PropertiesBar from './PropertiesBar'
import { useFormModal } from './FormModal'
import { usePdfActions } from '../hooks/usePdfActions'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from './Tooltip'

import { apiFetch } from '../lib/api'
import { leerEnVozAlta, detenerLectura } from '../lib/speech'
import { redactMatchesUndoable, replaceTextUndoable } from '../lib/pageUndo'

type ToolIcon = LucideIcon
type ToolDescriptor = { id: string; icon: ToolIcon; label: string }
type TextResponse = { text?: string; blocks?: Array<{ text?: string }> }

// `label` es el rótulo corto; el nombre completo y el atajo van en el tooltip
// (TOOL_LABELS/TOOL_SHORTCUTS son la fuente única, compartida con los atajos globales
// y la barra de estado). Estos catálogos alimentan la paleta de comandos.
const COUNT_SYMBOL_ICONS: Array<{ id: CountSymbol; icon: ToolIcon; label: string }> = [
  { id: 'circle', icon: Circle, label: 'círculo' },
  { id: 'square', icon: Square, label: 'cuadrado' },
  { id: 'triangle', icon: Triangle, label: 'triángulo' },
  { id: 'diamond', icon: Diamond, label: 'rombo' },
  { id: 'cross', icon: X, label: 'cruz' },
  { id: 'star', icon: Star, label: 'estrella' },
]

const COMMENT_TOOLS: ToolDescriptor[] = [
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

const SHAPE_TOOLS: ToolDescriptor[] = [
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

export default function Toolbar() {
  const {
    docs, activeDocId, setPage,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    showToast,
    readingMode, toggleReadingMode, togglePresentationMode, toggleContinuousMode,
    compareMode, continuousMode, activeRibbon, activeTool,
    countCategory, setCountCategory, countSymbol, setCountSymbol,
    stickyTools, setStickyTools, setActiveRibbon,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'showToast',
    'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'toggleContinuousMode',
    'compareMode', 'continuousMode', 'activeRibbon', 'activeTool',
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
  const [sellos, setSellos] = useState<CapaSello | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showSearch) return
    if (showReplace) replaceRef.current?.focus()
    else searchRef.current?.focus()
  }, [showSearch, showReplace])

  // Encabezado y pie, numeración y marca de agua: un solo diálogo, abierto en la
  // pestaña que pidió el botón (o la paleta de comandos).
  useEffect(() => {
    const onSellos = (e: Event) => setSellos(((e as CustomEvent).detail?.capa as CapaSello) || 'encabezado')
    window.addEventListener('app:sellos', onSellos)
    return () => window.removeEventListener('app:sellos', onSellos)
  }, [])

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
    const tool = (id: string) => () => { setActiveRibbon(ribbonForTool(id)); handleToolClick(id) }
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
      const data = await res.json() as TextResponse
      const text = (data.blocks ? data.blocks.map((b) => b.text || '').join(' ') : data.text) || ''
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

  const handleSearch = async () => {
    if (!activeDoc || !searchInput.trim()) return
    const { startProgress, endProgress } = usePdfStore.getState()
    if (searchAllDocs) {
      // Secuencial a propósito: el motor tiene un solo worker de fitz. Buscar en 60
      // planos abiertos son minutos, y no había ni progreso ni forma de cancelar: la
      // app se veía colgada. Se reusa `correrLote`, el mismo recorrido que las
      // operaciones por lotes (antes era una copia a mano que se desincronizó).
      let total = 0
      const { ok, hechos, cancelado } = await correrLote(
        `Buscar «${searchInput}»`, docs, (d) => d.file_name,
        async (d) => {
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
        },
      )
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

  const Sep = RibbonSep

  // Un clic en una herramienta del lápiz la activa sin cambiar de pestaña: saltar de
  // Inicio a Comentar al pulsar «Resaltar» movía toda la banda bajo el cursor.
  const toolBtn = (id: string, icon: ToolIcon, label: string, tip?: string) => (
    <RibbonButton key={id} icon={icon} label={label} tip={tip || TOOL_LABELS[id] || label}
      shortcut={TOOL_SHORTCUTS[id]} onClick={() => handleToolClick(id)} active={activeTool === id} />
  )
  const toolSmall = (id: string, icon: ToolIcon) => (
    <RibbonSmallButton key={id} icon={icon} label={TOOL_LABELS[id] || id}
      shortcut={TOOL_SHORTCUTS[id]} onClick={() => handleToolClick(id)} active={activeTool === id} />
  )
  const renderRibbon = () => {
    if (!activeDoc) return null
    switch (activeRibbon) {
      case 'read':
        return (
          <>
            <RibbonGroup label="Herramientas">
              {toolBtn('select', MousePointer2, 'Seleccionar')}
              {toolBtn('textselect', TextSelect, 'Copiar texto')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Vista">
              <RibbonButton icon={Maximize2} label="Página" tip="Ajustar página" onClick={() => handleFit('fit-page')} />
              <RibbonButton icon={MoveHorizontal} label="Ancho" tip="Ajustar al ancho" onClick={() => handleFit('fit-width')} />
              <RibbonButton icon={Rows3} label="Continuo" tip="Scroll continuo" onClick={() => toggleContinuousMode()}
                active={continuousMode} disabled={compareMode} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Modos">
              <RibbonButton icon={BookOpen} label="Lectura" tip="Modo lectura" onClick={toggleReadingMode} active={readingMode} disabled={compareMode} />
              <RibbonButton icon={Presentation} label="Presentar" tip="Modo presentación" onClick={() => togglePresentationMode()} disabled={compareMode} />
              <RibbonButton icon={GitCompare} label="Comparar" tip="Comparar dos PDFs" onClick={handleCompare} active={compareMode} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Revisión">
              {toolBtn('highlight', Highlighter, 'Resaltar')}
              {toolBtn('note', MessageSquare, 'Nota')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Voz">
              <RibbonButton icon={isSpeaking ? VolumeX : Volume2} label={isSpeaking ? 'Detener' : 'Leer'}
                tip={isSpeaking ? 'Detener la lectura' : 'Leer la página en voz alta'} onClick={handleReadAloud} active={isSpeaking} />
            </RibbonGroup>
          </>
        )
      case 'comment':
        return (
          <>
            <RibbonGroup label="Selección">
              {toolBtn('select', MousePointer2, 'Seleccionar')}
              {toolBtn('eraser', Eraser, 'Borrador', 'Borrador: pasá sobre un dibujo y lo corta, como el borrador de un lápiz')}
              <RibbonButton icon={stickyTools ? Pin : PinOff} label="Fijar"
                tip={stickyTools
                  ? 'Herramienta fija: se queda activa hasta pulsar Esc'
                  : 'Herramienta de un solo uso: se suelta tras cada marca'}
                onClick={() => setStickyTools(!stickyTools)} active={stickyTools} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Texto">
              {toolBtn('highlight', Highlighter, 'Resaltar')}
              {toolBtn('note', MessageSquare, 'Nota')}
              {toolBtn('text', Type, 'Cuadro')}
              <RibbonGallery>
                {toolSmall('underline', Underline)}
                {toolSmall('strikethrough', Strikethrough)}
                {toolSmall('callout', MessageSquareQuote)}
                {toolSmall('textselect', TextSelect)}
              </RibbonGallery>
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Dibujo">
              {toolBtn('draw', PenTool, 'Lápiz')}
              {toolBtn('cloud', CloudIcon, 'Nube')}
              <RibbonGallery>
                {toolSmall('line', Minus)}
                {toolSmall('arrow', ArrowRightTool)}
                {toolSmall('rect', Square)}
                {toolSmall('circle', Circle)}
                {toolSmall('polygon', Hexagon)}
                {toolSmall('star', Star)}
              </RibbonGallery>
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Sellos">
              {toolBtn('stamp', Stamp, 'Sello')}
              {toolBtn('signature', Signature, 'Firma')}
              <RibbonGallery>
                {toolSmall('check', CheckIcon)}
                {toolSmall('cross', X)}
              </RibbonGallery>
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Marcas">
              <RibbonButton icon={ClipboardList} label="Resumen" tip="Resumen de marcas (PDF)" onClick={handleMarkupSummary} />
              <RibbonMenuButton icon={ArrowLeftRight} label="XFDF" tip="Intercambiar marcas con Acrobat o Bluebeam">
                <RibbonMenuItem icon={FileDown} label="Exportar marcas" onClick={handleExportXfdf} />
                <RibbonMenuItem icon={FilePlus2} label="Importar marcas" onClick={handleImportXfdf} />
              </RibbonMenuButton>
            </RibbonGroup>
          </>
        )
      case 'measure': {
        const enCategoria = activeDoc.annotations.filter((a) => a.type === 'count' && (a.text || 'General') === (countCategory || 'General')).length
        return (
          <>
            <RibbonGroup label="Escala">
              {toolBtn('measure_calibrate', Ruler, 'Calibrar')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Medir">
              {toolBtn('measure_distance', MoveDiagonal, 'Distancia')}
              {toolBtn('measure_perimeter', Spline, 'Perímetro')}
              {toolBtn('measure_area', LandPlot, 'Área')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Conteo">
              {toolBtn('count', Tally5, 'Conteo')}
              {/* La categoría y el símbolo se eligen ANTES de marcar: van siempre a la
                  vista, no solo con la herramienta activa (antes aparecían y corrían
                  la fila al activarla). */}
              <div className="flex flex-col justify-center gap-1 px-1 self-center">
                <div className="flex items-center gap-1">
                  <input type="text" value={countCategory} onChange={(e) => setCountCategory(e.target.value)}
                    placeholder="Categoría" title="Categoría del conteo" aria-label="Categoría del conteo"
                    className="w-28 h-[22px] px-1.5 text-mini rounded-token-sm border border-border-control/60 bg-surface text-fg" />
                  <span className="text-mini text-muted tabular w-8" title="Marcas de esta categoría en el documento">= {enCategoria}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  {COUNT_SYMBOL_ICONS.map(({ id, icon: Icon, label }) => (
                    <Tooltip key={id} content={`Símbolo: ${label}`}>
                      <button type="button" onClick={() => setCountSymbol(id)} aria-label={`Símbolo ${label}`} aria-pressed={countSymbol === id}
                        className={`w-[22px] h-[20px] inline-flex items-center justify-center rounded-token-sm transition-colors ${countSymbol === id ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                        <Icon size={13} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Datos">
              <RibbonButton icon={FileSpreadsheet} label="Exportar" tip="Exportar mediciones y conteos a Excel" onClick={handleExportMeasurements} />
            </RibbonGroup>
          </>
        )
      }
      case 'edit':
        return (
          <>
            <RibbonGroup label="Contenido">
              {toolBtn('edittext', Pencil, 'Editar texto')}
              {toolBtn('text', Type, 'Agregar texto')}
              {toolBtn('image', ImageIcon, 'Imagen')}
              {toolBtn('editimage', Images, 'Editar imagen')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Formulario">
              {toolBtn('formtext', TextCursorInput, 'Texto')}
              {toolBtn('formcheck', CheckSquare, 'Casilla')}
              {toolBtn('formradio', CircleDot, 'Opción')}
              {toolBtn('formcombo', List, 'Lista')}
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Documento">
              <RibbonButton icon={AlignVerticalJustifyCenter} label="Encabezado" tip="Encabezado y pie de página" onClick={handleHeaderFooter} />
              <RibbonButton icon={Droplets} label="Marca de agua" tip="Marca de agua" onClick={handleWatermark} />
              <RibbonButton icon={ListOrdered} label="Numerar" tip="Numerar páginas" onClick={handleAddPageNumbers} />
              <RibbonButton icon={Info} label="Propiedades" tip="Editar metadatos del documento" onClick={handleEditMetadata} />
            </RibbonGroup>
          </>
        )
      case 'page':
        return (
          <>
            <RibbonGroup label="Rotar">
              <RibbonButton icon={RotateCcw} label="Izquierda" tip="Rotar a la izquierda" onClick={() => handleRotate(-90)} />
              <RibbonButton icon={RotateCw} label="Derecha" tip="Rotar a la derecha" onClick={() => handleRotate(90)} />
              <RibbonButton icon={RefreshCw} label="Todo" tip="Rotar todo el documento" onClick={() => handleRotateAll(90)} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Páginas">
              <RibbonButton icon={FilePlus} label="Insertar" tip="Insertar página en blanco" onClick={handleInsertBlank} />
              <RibbonButton icon={Copy} label="Duplicar" tip="Duplicar la página actual" onClick={handleDuplicatePage} />
              <RibbonButton icon={Trash2} label="Eliminar" tip="Eliminar la página actual" onClick={handleDeletePage} />
              <RibbonButton icon={LayoutGrid} label="Organizar" tip="Organizar páginas (pantalla completa)"
                onClick={() => window.dispatchEvent(new CustomEvent('app:page-organizer'))} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Documento">
              <RibbonButton icon={Merge} label="Combinar" tip="Combinar otro PDF" onClick={handleMerge} />
              <RibbonMenuButton icon={Scissors} label="Dividir" tip="Dividir o extraer páginas">
                <RibbonMenuItem icon={Scissors} label="Rango…" onClick={() => handleSplit('range')} />
                <RibbonMenuItem icon={Scissors} label="Desde la página actual" onClick={() => handleSplit('from-current')} />
                <RibbonMenuSep />
                <RibbonMenuItem icon={Scissors} label="Páginas pares" onClick={() => handleSplit('even')} />
                <RibbonMenuItem icon={Scissors} label="Páginas impares" onClick={() => handleSplit('odd')} />
              </RibbonMenuButton>
              <RibbonButton icon={Crop} label="Recortar" tip="Recortar página" onClick={handleCrop} />
            </RibbonGroup>
          </>
        )
      case 'protect':
        return (
          <>
            <RibbonGroup label="Contraseña">
              <RibbonButton icon={Lock} label="Proteger" tip="Guardar con contraseña (AES-256)" onClick={handleSaveWithPassword} />
              <RibbonButton icon={LockOpen} label="Quitar clave" tip="Guardar copia sin contraseña" onClick={handleRemovePassword} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Redacción">
              <RibbonButton icon={Shield} label="Redactar área" tip="Tachar permanentemente un área" onClick={handleRedact} />
              <RibbonButton icon={SearchX} label="Buscar y redactar" tip="Buscar un texto y tacharlo permanentemente (con vista previa)" onClick={handleRedactMatches} />
            </RibbonGroup>
          </>
        )
      case 'convert':
        return (
          <>
            <RibbonGroup label="Exportar">
              <RibbonButton icon={FileText} label="Word" tip="Exportar a Word" onClick={handleExportWord} />
              <RibbonButton icon={FileSpreadsheet} label="Excel" tip="Exportar a Excel" onClick={handleExportExcel} />
              <RibbonButton icon={Presentation} label="PowerPoint" tip="Exportar a PowerPoint" onClick={handleExportPptx} />
              <RibbonButton icon={FileImage} label="Imagen" tip="Guardar la página como imagen" onClick={handleSavePageAsImage} />
              <RibbonMenuButton icon={FileType} label="Texto" tip="Exportar a texto plano o HTML">
                <RibbonMenuItem icon={FileType} label="Texto plano (.txt)" onClick={handleExportTxt} />
                <RibbonMenuItem icon={Code2} label="Página web (.html)" onClick={handleExportHtml} />
              </RibbonMenuButton>
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Crear">
              <RibbonButton icon={FilePlus2} label="Desde imágenes" tip="Crear PDF a partir de imágenes" onClick={handleImagesToPdf} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="OCR">
              <RibbonButton icon={ScanText} label="Hacer buscable" tip="OCR: hacer la página buscable" onClick={handleMakeSearchable} />
              <RibbonButton icon={ScanSearch} label="Extraer texto" tip="OCR: extraer el texto de la página" onClick={handleOcr} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Optimizar">
              <RibbonButton icon={Minimize2} label="Comprimir" tip="Comprimir PDF" onClick={handleCompress} />
            </RibbonGroup>
            {docs.length > 1 && (
              <>
                <Sep />
                <RibbonGroup label={`Todos los abiertos (${docs.length})`}>
                  <RibbonButton icon={Minimize2} label="Comprimir" tip="Comprimir todos los documentos abiertos" onClick={handleBatchCompress} />
                  <RibbonButton icon={Droplets} label="Marca de agua" tip="Marca de agua en todos los abiertos" onClick={handleBatchWatermark} />
                  <RibbonButton icon={FileText} label="A Word" tip="Exportar todos los abiertos a Word" onClick={handleBatchExportWord} />
                </RibbonGroup>
              </>
            )}
          </>
        )
      case 'ai': {
        const openAI = (preset?: string) => window.dispatchEvent(new CustomEvent('app:ai-open', { detail: preset ? { preset } : {} }))
        return (
          <>
            <RibbonGroup label="Asistente">
              <RibbonButton icon={Sparkles} label="Asistente" tip="Abrir asistente IA (Claude)" onClick={() => openAI()} />
            </RibbonGroup>
            <Sep />
            <RibbonGroup label="Sobre el documento">
              <RibbonButton icon={ScrollText} label="Resumir" tip="Resumir el documento" onClick={() => openAI('Resume este documento en puntos clave.')} />
              <RibbonButton icon={MessageCircleQuestion} label="Preguntar" tip="Preguntar sobre el PDF" onClick={() => openAI()} />
              <RibbonButton icon={ListTree} label="Extraer datos" tip="Extraer datos estructurados"
                onClick={() => openAI('Extrae los datos más relevantes de este documento en formato estructurado (listas o tabla).')} />
            </RibbonGroup>
          </>
        )
      }
      default:
        return null
    }
  }

  // La búsqueda vive en la fila de la cinta, pero su caja FLOTA debajo: con
  // «Reemplazar» abierta mide dos alturas, y estirando la fila empujaba el
  // documento hacia abajo cada vez que se abría. El botón se queda visible
  // mientras la caja está abierta: es su ancla, y sin él la fila daba un salto.
  const buscador = activeDoc ? (
    <div className="relative shrink-0">
      {/* Parece un campo porque ES el sitio donde se busca: un icono suelto en la
          esquina no se lee como buscador. En una ventana estrecha queda solo la lupa. */}
      <button onClick={() => setShowSearch((v) => !v)} aria-label="Buscar" aria-expanded={showSearch}
        title="Buscar (Ctrl+F)"
        className={`rb-search h-7 inline-flex items-center gap-2 px-2 rounded-token-sm border text-mini transition-[background-color,color,border-color] duration-fast ease-token ${
          showSearch ? 'bg-panel border-accent text-fg' : 'bg-surface border-border text-muted hover:text-fg hover:border-border-strong'
        }`}>
        <Search size={14} className="shrink-0" />
        <span className="rb-search-text flex-1 text-left">Buscar en el documento</span>
        <kbd className="rb-search-text px-1 rounded-token-sm border border-border text-micro text-faint tabular">Ctrl+F</kbd>
      </button>
      {showSearch && (
        <div className="absolute right-0 top-full mt-2 z-dropdown menu-pop">
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
                className={`text-micro px-2 py-0.5 rounded-token-sm border ${showReplace ? 'bg-selected text-fg border-transparent' : 'border-border text-fg hover:bg-hover'}`}>
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
                    aria-label="Distinguir mayúsculas y minúsculas" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--fg))' }} />
                  Aa
                </label>
                <label className="flex items-center gap-1 text-micro cursor-pointer text-muted" title="Buscar en todos los documentos abiertos">
                  <input type="checkbox" checked={searchAllDocs} onChange={(e) => setSearchAllDocs(e.target.checked)}
                    aria-label="Buscar en todos los documentos abiertos" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--fg))' }} />
                  Todos los docs
                </label>
                <label className="flex items-center gap-1 text-micro cursor-pointer text-muted">
                  <input type="checkbox" checked={replaceAllPages} onChange={(e) => setReplaceAllPages(e.target.checked)}
                    aria-label="Reemplazar en todo el documento" className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--fg))' }} />
                  Todo el doc
                </label>
                <button onClick={handleReplace} disabled={!searchInput.trim()}
                  className={`text-micro px-2 py-0.5 rounded-token-sm border ${searchInput.trim() ? 'border-border text-fg hover:bg-hover' : 'border-transparent opacity-40 bg-hover text-muted'}`}>Reemplazar</button>
                <button onClick={handleReplaceAll} disabled={!searchInput.trim()}
                  className={`text-micro px-2 py-0.5 rounded-token-sm ${searchInput.trim() ? 'bg-fg text-panel hover:opacity-90 active:opacity-80' : 'opacity-40 bg-hover text-muted'}`}>Reemplazar todo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="relative z-dropdown flex flex-col shrink-0 select-none material border-b border-border-strong/70 text-fg">
      <RibbonTabs tools={renderRibbon()} trailing={buscador} />

      {activeDoc && <PropertiesBar />}
      {formModal}

      {/* Los diálogos van al body: la cinta es material (`backdrop-filter`), que hace
          de contenedor de los `fixed` de adentro, y un diálogo se centraba sobre la
          cinta —cortado por arriba— en vez de sobre la ventana. */}
      {sellos && activeDoc && createPortal(<SellosDialog capaInicial={sellos} onClose={() => setSellos(null)} />, document.body)}
      {showPrint && activeDoc && createPortal(
        <PrintDialog
          docId={activeDoc.doc_id}
          pageCount={activeDoc.page_count}
          currentPage={activeDoc.currentPage}
          onClose={() => setShowPrint(false)}
        />,
        document.body,
      )}
    </div>
  )
}
