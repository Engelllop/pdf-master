import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  FolderOpen, Save, FilePlus, Minimize2, Trash2, RotateCw, RotateCcw,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw as ResetZoom,
  Search, PanelLeft, PanelRight, Maximize2, AlignVerticalJustifyCenter,
  X, ChevronDown, ChevronUp, Merge, Undo2, Redo2,
  Sun, Moon, BookOpen, ArrowLeft, ArrowRight, Printer,
  Mail, FileDown, Clock, GitCompare, RefreshCw, Scissors, Stamp, FileText, Presentation, ScrollText,
  Volume2, VolumeX, ScanText, MonitorPlay, HelpCircle,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import Tooltip from './Tooltip'
import TabStrip from './TabStrip'
import { useThemeClasses } from '../hooks/useThemeClasses'
import { openDocument } from '../lib/openDocument'
import { requestCloseDoc } from '../lib/closeDocument'

const API_BASE = 'http://localhost:8745'

export default function Toolbar() {
  const tc = useThemeClasses()
  const {
    docs, activeDocId, sidebarOpen, toolsPanelOpen,
    toggleSidebar, toggleToolsPanel, addDoc,
    setPage, nextPage, prevPage, setZoom,
    setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    updateDocPageCount, updateDocPageSizes, showToast,
    setDocDirty, undo, redo, invalidatePageCache, invalidateThumbnails, setSaveStatus,
    theme, setTheme, readingMode, toggleReadingMode, togglePresentationMode, continuousMode, toggleContinuousMode, goBack, goForward, navHistoryIndex, navHistory,
    toggleCompareMode, setCompareDoc, compareMode, compareDocId, incrementDocVersion,
  } = useStoreSlice(
    'docs', 'activeDocId', 'sidebarOpen', 'toolsPanelOpen',
    'toggleSidebar', 'toggleToolsPanel', 'addDoc',
    'setPage', 'nextPage', 'prevPage', 'setZoom',
    'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'updateDocPageCount', 'updateDocPageSizes', 'showToast',
    'setDocDirty', 'undo', 'redo', 'invalidatePageCache', 'invalidateThumbnails', 'setSaveStatus',
    'theme', 'setTheme', 'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'continuousMode', 'toggleContinuousMode', 'goBack', 'goForward', 'navHistoryIndex', 'navHistory',
    'toggleCompareMode', 'setCompareDoc', 'compareMode', 'compareDocId', 'incrementDocVersion',
  )

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  // Único punto de error de los handlers: toast al usuario + traza a backend.log
  // (antes había ~25 catch idénticos que tragaban el stack).
  const toastActionError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    window.api.logError(`[toolbar] ${err instanceof Error ? err.stack || msg : msg}`).catch(() => {})
    showToast('Error: ' + msg, 'error')
  }

  const [searchInput, setSearchInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [replaceInput, setReplaceInput] = useState('')
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false)
  const [replaceAllPages, setReplaceAllPages] = useState(true)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [splitSubmenuOpen, setSplitSubmenuOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus()
  }, [showSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
        setSplitSubmenuOpen(false)
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

  const handleOpen = async () => {
    const filePath = await window.api.openFile()
    if (filePath) await openDocument(filePath)
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
      const res = await fetch(`${API_BASE}/pdf/save/${activeDoc.doc_id}?output_path=${encodeURIComponent(newPath)}`, { method: 'POST' })
      if (res.ok) {
        showToast('Guardado como ' + newPath.split(/[\\/]/).pop(), 'success')
      } else {
        showToast('Error al guardar', 'error')
      }
    } catch (err) {
      toastActionError(err)
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
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleAddPageNumbers = async () => {
    if (!activeDoc) return
    const prefix = prompt('Prefijo Bates (deja vacío para numeración "n / total"):', '') ?? ''
    try {
      const res = await fetch(`${API_BASE}/pdf/page-numbers/${activeDoc.doc_id}?prefix=${encodeURIComponent(prefix)}&start=1&position=bottom`, { method: 'POST' })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Numeración aplicada', 'success')
      } else showToast('Error al numerar páginas', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleMarkupSummary = async () => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/markup-summary/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (res.ok) {
        const data = await res.json()
        const link = document.createElement('a')
        link.download = data.filename || 'marcas.pdf'
        link.href = `data:application/pdf;base64,${data.data_base64}`
        link.click()
        showToast('Resumen de marcas generado', 'success')
      } else showToast('Error al generar resumen', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleRedactMatches = async () => {
    if (!activeDoc || !searchInput.trim()) return
    if (!confirm(`¿Redactar (tachar permanentemente) todas las ocurrencias de "${searchInput}"?`)) return
    try {
      const res = await fetch(`${API_BASE}/pdf/redact-matches/${activeDoc.doc_id}?query=${encodeURIComponent(searchInput)}`, { method: 'POST' })
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

  const handleMakeSearchable = async () => {
    if (!activeDoc) return
    try {
      const avail = await (await fetch(`${API_BASE}/pdf/ocr-available`)).json()
      if (!avail.available) { showToast('Tesseract OCR no está instalado en el sistema', 'error'); return }
      showToast('Procesando OCR de la página...', 'info')
      const res = await fetch(`${API_BASE}/pdf/make-searchable/${activeDoc.doc_id}?page=${activeDoc.currentPage}`, { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast(`OCR aplicado: ${d.words} palabra(s)`, 'success')
      } else if (res.status === 503) {
        showToast('Tesseract OCR no está instalado', 'error')
      } else showToast('Error en OCR', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleNewWindow = () => { window.api.newWindow() }

  const handleReadAloud = async () => {
    if (!activeDoc) return
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return }
    try {
      const res = await fetch(`${API_BASE}/pdf/text/${activeDoc.doc_id}/${activeDoc.currentPage}`)
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
    } catch (err) {
      setSaveStatus('idle')
      toastActionError(err)
    }
  }

  const handleNewBlank = async () => {
    const outputPath = await window.api.saveFile({ defaultPath: 'nuevo.pdf' })
    if (!outputPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/create-blank`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_path: outputPath }),
      })
      if (res.ok) {
        const data = await res.json()
        addDoc(data)
        showToast('PDF en blanco creado', 'success')
      } else {
        showToast('Error al crear PDF', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleWatermark = async () => {
    if (!activeDoc) return
    const text = prompt('Texto de la marca de agua:', 'CONFIDENCIAL')
    if (!text) return
    try {
      const res = await fetch(`${API_BASE}/pdf/watermark/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Marca de agua agregada', 'success')
      } else {
        showToast('Error al agregar marca de agua', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleRedact = async () => {
    if (!activeDoc) return
    const input = prompt('Área a redactar: x,y,ancho,alto (en puntos):', '50,50,100,100')
    if (!input) return
    const [x, y, w, h] = input.split(',').map(Number)
    if ([x, y, w, h].some(isNaN)) {
      showToast('Coordenadas inválidas', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/pdf/redact/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: activeDoc.currentPage, x, y, width: w, height: h }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Área redactada', 'success')
      } else {
        showToast('Error al redactar', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleCrop = async () => {
    if (!activeDoc) return
    const input = prompt('Márgenes de recorte: top,right,bottom,left (en puntos):', '50,50,50,50')
    if (!input) return
    const [t, r, b, l] = input.split(',').map(Number)
    if ([t, r, b, l].some(isNaN)) {
      showToast('Márgenes inválidos', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/pdf/crop/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: activeDoc.currentPage, top: t, right: r, bottom: b, left: l }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Página recortada', 'success')
      } else {
        showToast('Error al recortar', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleExportExcel = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace('.pdf', '.xlsx') })
    if (!outputPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/export-excel/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      if (res.ok) {
        showToast('Exportado a Excel', 'success')
      } else {
        showToast('Error al exportar', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleExportPptx = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace('.pdf', '.pptx') })
    if (!outputPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/export-pptx/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      if (res.ok) {
        showToast('Exportado a PowerPoint', 'success')
      } else {
        showToast('Error al exportar', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleOcr = async () => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/ocr/${activeDoc.doc_id}/${activeDoc.currentPage}`)
      if (res.ok) {
        const data = await res.json()
        alert(`Texto OCR (página ${activeDoc.currentPage + 1}):\n\n${data.text || 'Sin texto detectado'}`)
      } else {
        showToast('OCR falló o Tesseract no está instalado', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleSavePageAsImage = async () => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/page-image/${activeDoc.doc_id}/${activeDoc.currentPage}?zoom=2.0`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${activeDoc.file_name.replace('.pdf', '')}_pagina_${activeDoc.currentPage + 1}.png`
        a.click()
        URL.revokeObjectURL(url)
        showToast('Página guardada como imagen', 'success')
      } else {
        showToast('Error al exportar imagen', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleEditMetadata = async () => {
    if (!activeDoc) return
    const title = prompt('Título:', activeDoc.title || '')
    if (title === null) return
    const author = prompt('Autor:', activeDoc.author || '')
    if (author === null) return
    const subject = prompt('Asunto:', activeDoc.subject || '')
    if (subject === null) return
    const keywords = prompt('Palabras clave:', '')
    if (keywords === null) return
    try {
      const res = await fetch(`${API_BASE}/pdf/metadata/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || undefined, author: author || undefined, subject: subject || undefined, keywords: keywords || undefined }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        showToast('Metadatos actualizados', 'success')
      } else {
        showToast('Error al actualizar metadatos', 'error')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleHeaderFooter = async () => {
    if (!activeDoc) return
    const header = prompt('Texto de encabezado (deja vacío para omitir):')
    if (header === null) return
    const footer = prompt('Texto de pie de página (deja vacío para omitir):')
    if (footer === null) return
    try {
      const res = await fetch(`${API_BASE}/pdf/header-footer/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ header: header || undefined, footer: footer || undefined }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Encabezado/pie agregado', 'success')
      } else {
        showToast('Error al agregar encabezado/pie', 'error')
      }
    } catch (err) {
      toastActionError(err)
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
    } catch (err) {
      toastActionError(err)
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
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleSplit = async (mode: 'even' | 'odd' | 'range' | 'from-current') => {
    if (!activeDoc) return
    let pages: number[] = []
    if (mode === 'even') {
      pages = Array.from({ length: activeDoc.page_count }, (_, i) => i).filter(i => i % 2 === 1)
    } else if (mode === 'odd') {
      pages = Array.from({ length: activeDoc.page_count }, (_, i) => i).filter(i => i % 2 === 0)
    } else if (mode === 'from-current') {
      pages = Array.from({ length: activeDoc.page_count - activeDoc.currentPage }, (_, i) => i + activeDoc.currentPage)
    } else if (mode === 'range') {
      const input = prompt('Ingresa el rango de páginas (ej: 1-5,8,10-12):')
      if (!input) return
      pages = []
      const parts = input.split(',')
      for (const part of parts) {
        const trimmed = part.trim()
        if (trimmed.includes('-')) {
          const [start, end] = trimmed.split('-').map(Number)
          if (!isNaN(start) && !isNaN(end)) {
            for (let p = start; p <= end; p++) pages.push(p - 1)
          }
        } else {
          const p = Number(trimmed)
          if (!isNaN(p)) pages.push(p - 1)
        }
      }
      pages = [...new Set(pages)].filter(p => p >= 0 && p < activeDoc.page_count).sort((a, b) => a - b)
      if (pages.length === 0) {
        showToast('Rango inválido', 'error')
        return
      }
    }
    if (pages.length === 0) {
      showToast('No hay páginas para dividir', 'error')
      return
    }
    const outputPath = await window.api.saveFile()
    if (!outputPath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/split/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      if (res.ok) {
        showToast(`Dividido: ${pages.length} páginas guardadas`, 'success')
      } else {
        showToast('Error al dividir PDF', 'error')
      }
    } catch (err) {
      toastActionError(err)
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
    } catch (err) {
      toastActionError(err)
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
        incrementDocVersion(activeDoc.doc_id)
        showToast(`Página rotada ${degrees}°`, 'success')
      }
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleRotateAll = async (degrees: number) => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/rotate-all/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: 0, degrees }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast(`Documento rotado ${degrees}°`, 'success')
      }
    } catch (err) {
      toastActionError(err)
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
    } catch (err) {
      toastActionError(err)
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
  const handleCloseSearch = () => { setShowSearch(false); setSearchInput(''); setReplaceInput(''); if (activeDoc) setSearchQuery(activeDoc.doc_id, '') }

  const handleReplace = async () => {
    if (!activeDoc || !searchInput.trim()) return
    try {
      const res = await fetch(`${API_BASE}/pdf/replace-text/${activeDoc.doc_id}`, {
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
    if (!confirm(`¿Reemplazar todas las ocurrencias de "${searchInput}" por "${replaceInput}"?`)) return
    try {
      const res = await fetch(`${API_BASE}/pdf/replace-text/${activeDoc.doc_id}`, {
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

  const MenuItem = ({ icon: Icon, label, onClick, disabled = false, color = '' }: any) => (
    <button onClick={() => { onClick(); setMenuOpen(null) }} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : tc('hover:bg-slate-700 text-slate-200', 'hover:bg-gray-100 text-gray-800')}`}>
      {Icon && <Icon size={14} className={color || tc('text-slate-400', 'text-gray-500')} />} <span>{label}</span>
    </button>
  )

  return (
    <div className={`flex flex-col shrink-0 select-none ${tc('bg-slate-900', 'bg-white')}`}>
      {/* Barra de pestañas */}
      <div className={`h-10 border-b flex items-center ${tc('bg-slate-900 border-slate-700', 'bg-white border-gray-300')}`}>
        <div className="relative" ref={menuRef}>
          <button onClick={() => { setMenuOpen(menuOpen === 'file' ? null : 'file'); setSplitSubmenuOpen(false) }}
            className="flex items-center gap-1.5 px-3 h-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shrink-0">
            <FolderOpen size={15} /> <span>Archivo</span>
          </button>
          {menuOpen === 'file' && (
            <div className={`menu-pop absolute top-full left-0 z-50 w-56 border rounded shadow-xl py-1 max-h-[80vh] overflow-y-auto ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
              <MenuItem icon={FolderOpen} label="Abrir..." onClick={handleOpen} />
              <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
              <MenuItem icon={Save} label="Guardar" onClick={handleSave} disabled={!activeDoc} />
              <MenuItem icon={FilePlus} label="Guardar como..." onClick={handleSaveAs} disabled={!activeDoc} />
              <MenuItem icon={Save} label="Guardar con contraseña..." onClick={handleSaveWithPassword} disabled={!activeDoc} color="text-amber-400" />
              <MenuItem icon={FileDown} label="Exportar a Word" onClick={handleExportWord} disabled={!activeDoc} />
              <MenuItem icon={FileDown} label="Exportar a Excel" onClick={handleExportExcel} disabled={!activeDoc} />
              <MenuItem icon={FileDown} label="Exportar a PowerPoint" onClick={handleExportPptx} disabled={!activeDoc} />
              <MenuItem icon={Mail} label="Compartir por email" onClick={handleShareEmail} disabled={!activeDoc} />
              <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
              <MenuItem icon={FilePlus} label="Nuevo PDF en blanco" onClick={handleNewBlank} />
              <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
              <MenuItem icon={Merge} label="Combinar PDF..." onClick={handleMerge} disabled={!activeDoc} />
              <MenuItem icon={Stamp} label="Marca de agua" onClick={handleWatermark} disabled={!activeDoc} />
              <MenuItem icon={Trash2} label="Redactar área..." onClick={handleRedact} disabled={!activeDoc} color="text-red-400" />
              <MenuItem icon={Minimize2} label="Recortar página..." onClick={handleCrop} disabled={!activeDoc} />
              <MenuItem icon={AlignVerticalJustifyCenter} label="Encabezado y pie..." onClick={handleHeaderFooter} disabled={!activeDoc} />
              <MenuItem icon={FileText} label="Numerar páginas / Bates..." onClick={handleAddPageNumbers} disabled={!activeDoc} />
              <MenuItem icon={FileDown} label="Resumen de marcas (PDF)" onClick={handleMarkupSummary} disabled={!activeDoc} />
              <MenuItem icon={Search} label="OCR página actual (extraer)" onClick={handleOcr} disabled={!activeDoc} />
              <MenuItem icon={ScanText} label="Hacer página buscable (OCR)" onClick={handleMakeSearchable} disabled={!activeDoc} />
              <MenuItem icon={FileDown} label="Guardar página como imagen" onClick={handleSavePageAsImage} disabled={!activeDoc} />
              <MenuItem icon={FileText} label="Editar metadatos..." onClick={handleEditMetadata} disabled={!activeDoc} />
              <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
              <MenuItem icon={MonitorPlay} label="Nueva ventana" onClick={handleNewWindow} />
              <div className="relative">
                <button onClick={() => setSplitSubmenuOpen(!splitSubmenuOpen)} disabled={!activeDoc}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${!activeDoc ? 'opacity-40 cursor-not-allowed' : tc('hover:bg-slate-700 text-slate-200', 'hover:bg-gray-100 text-gray-800')}`}>
                  <Scissors size={14} className={tc('text-slate-400', 'text-gray-500')} /> <span>Dividir PDF</span>
                </button>
                {splitSubmenuOpen && (
                  <div className={`ml-4 mt-1 border rounded py-1 ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
                    <button onClick={() => { handleSplit('even'); setMenuOpen(null); setSplitSubmenuOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${tc('text-slate-300 hover:bg-slate-700', 'text-gray-700 hover:bg-gray-100')}`}>Páginas pares</button>
                    <button onClick={() => { handleSplit('odd'); setMenuOpen(null); setSplitSubmenuOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${tc('text-slate-300 hover:bg-slate-700', 'text-gray-700 hover:bg-gray-100')}`}>Páginas impares</button>
                    <button onClick={() => { handleSplit('range'); setMenuOpen(null); setSplitSubmenuOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${tc('text-slate-300 hover:bg-slate-700', 'text-gray-700 hover:bg-gray-100')}`}>Rango personalizado...</button>
                    <button onClick={() => { handleSplit('from-current'); setMenuOpen(null); setSplitSubmenuOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${tc('text-slate-300 hover:bg-slate-700', 'text-gray-700 hover:bg-gray-100')}`}>Desde página actual</button>
                  </div>
                )}
              </div>
              <MenuItem icon={Minimize2} label="Comprimir PDF" onClick={handleCompress} disabled={!activeDoc} />
              <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
              <MenuItem icon={X} label="Cerrar documento" onClick={() => activeDoc && requestCloseDoc(activeDoc.doc_id)} disabled={!activeDoc} />
              {recentFiles.length > 0 && (
                <>
                  <div className={`h-px my-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
                  <div className={`px-3 py-1 text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Recientes</div>
                  {recentFiles.slice(0, 10).map((path, i) => (
                    <button key={i}
                      onClick={() => { openDocument(path); setMenuOpen(null) }}
                      className={`w-full text-left px-3 py-1.5 text-xs truncate ${tc('text-slate-300 hover:bg-slate-700 hover:text-white', 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')}`}
                      title={path}>
                      <Clock size={12} className={`inline mr-1 ${tc('text-slate-500', 'text-gray-500')}`} />
                      {path.split(/[\\/]/).pop()}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <TabStrip />

        <div className="flex items-center h-full">
          <Tooltip content={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'} shortcut="Ctrl+Shift+L">
            <button onClick={toggleSidebar} aria-label={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'}
              className={`p-2 h-full transition-colors ${sidebarOpen ? 'text-blue-400' : tc('text-slate-400', 'text-gray-500')} ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <PanelLeft size={16} />
            </button>
          </Tooltip>
          <Tooltip content={toolsPanelOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}>
            <button onClick={toggleToolsPanel} aria-label={toolsPanelOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}
              className={`p-2 h-full transition-colors ${toolsPanelOpen ? 'text-blue-400' : tc('text-slate-400', 'text-gray-500')} ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}>
              <PanelRight size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Barra de herramientas del documento activo */}
      {activeDoc && (
        <div className={`h-11 border-b flex items-center px-3 gap-2 ${tc('bg-slate-800 border-slate-700', 'bg-gray-100 border-gray-300')}`}>
          <div className="flex items-center gap-1">
            <Tooltip content="Ajustar página (ver toda la hoja)">
              <button onClick={() => handleFit('fit-page')} aria-label="Ajustar página"
                className={`p-1.5 rounded transition-colors ${activeDoc.fitMode === 'fit-page' ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <Maximize2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Comparar PDFs">
              <button
                onClick={handleCompare}
                className={`p-1.5 rounded transition-colors ${compareMode ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}
                aria-label="Comparar PDFs"
              >
                <GitCompare size={16} />
              </button>
            </Tooltip>
            <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />
            <Tooltip content="Alejar" shortcut="Ctrl+-">
              <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom - 0.15)} aria-label="Alejar" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ZoomOut size={16} />
              </button>
            </Tooltip>
            <span className={`text-xs w-12 text-center font-mono ${tc('text-slate-300', 'text-gray-700')}`}>{Math.round(activeDoc.zoom * 100)}%</span>
            <Tooltip content="Acercar" shortcut="Ctrl++">
              <button onClick={() => setZoom(activeDoc.doc_id, activeDoc.zoom + 0.15)} aria-label="Acercar" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ZoomIn size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Zoom 100%" shortcut="Ctrl+0">
              <button onClick={() => { setZoom(activeDoc.doc_id, 1); setFitMode(activeDoc.doc_id, 'custom') }} aria-label="Zoom 100%" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ResetZoom size={16} />
              </button>
            </Tooltip>
          </div>

          <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

          <div className="flex items-center gap-1">
            <Tooltip content="Página anterior" shortcut="↑ / PgUp">
              <button onClick={() => prevPage(activeDoc.doc_id)} disabled={activeDoc.currentPage === 0} aria-label="Página anterior"
                className={`p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ChevronLeft size={16} />
              </button>
            </Tooltip>
            <div className="flex items-center gap-1 text-xs">
              <input type="number" min={1} max={activeDoc.page_count} value={activeDoc.currentPage + 1}
                onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= activeDoc.page_count) setPage(activeDoc.doc_id, v - 1) }}
                className={`w-10 border rounded px-1 py-0.5 text-center focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`} />
              <span className={tc('text-slate-400', 'text-gray-500')}>/ {activeDoc.page_count}</span>
            </div>
            <Tooltip content="Página siguiente" shortcut="↓ / PgDn">
              <button onClick={() => nextPage(activeDoc.doc_id)} disabled={activeDoc.currentPage >= activeDoc.page_count - 1} aria-label="Página siguiente"
                className={`p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ChevronRight size={16} />
              </button>
            </Tooltip>
          </div>

          <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

          <div className="flex items-center gap-1">
            <Tooltip content="Deshacer" shortcut="Ctrl+Z">
              <button onClick={undo} aria-label="Deshacer" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <Undo2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Rehacer" shortcut="Ctrl+Y">
              <button onClick={redo} aria-label="Rehacer" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <Redo2 size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Atrás">
              <button onClick={() => activeDoc && goBack(activeDoc.doc_id)} disabled={navHistoryIndex <= 0}
                aria-label="Atrás" className={`p-1.5 rounded disabled:opacity-30 transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ArrowLeft size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Adelante">
              <button onClick={() => activeDoc && goForward(activeDoc.doc_id)} disabled={navHistoryIndex >= navHistory.length - 1}
                aria-label="Adelante" className={`p-1.5 rounded disabled:opacity-30 transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ArrowRight size={16} />
              </button>
            </Tooltip>
          </div>

          <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

          <div className="flex items-center gap-1">
            <Tooltip content="Rotar página 90° a la izquierda">
              <button onClick={() => handleRotate(-90)} aria-label="Rotar 90° en sentido antihorario" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <RotateCcw size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Rotar página 90° a la derecha">
              <button onClick={() => handleRotate(90)} aria-label="Rotar 90° en sentido horario" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <RotateCw size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Rotar todas las páginas 90° a la izquierda">
              <button onClick={() => handleRotateAll(-90)} aria-label="Rotar todo el documento 90° antihorario" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <RefreshCw size={16} className="-scale-x-100" />
              </button>
            </Tooltip>
            <Tooltip content="Rotar todas las páginas 90° a la derecha">
              <button onClick={() => handleRotateAll(90)} aria-label="Rotar todo el documento 90° horario" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <RefreshCw size={16} />
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
              <button onClick={() => window.print()} aria-label="Imprimir" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <Printer size={16} />
              </button>
            </Tooltip>
            <Tooltip content={readingMode ? 'Salir de modo lectura' : 'Modo lectura'}>
              <button onClick={toggleReadingMode} aria-label={readingMode ? 'Salir de modo lectura' : 'Modo lectura'} className={`p-1.5 rounded transition-colors ${readingMode ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <BookOpen size={16} />
              </button>
            </Tooltip>
            <Tooltip content={continuousMode ? 'Vista de página única' : 'Scroll continuo'}>
              <button onClick={() => toggleContinuousMode()} disabled={!activeDoc} aria-label="Scroll continuo" className={`p-1.5 rounded transition-colors disabled:opacity-30 ${continuousMode ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <ScrollText size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Modo presentación">
              <button onClick={() => togglePresentationMode()} disabled={!activeDoc} aria-label="Modo presentación" className={`p-1.5 rounded transition-colors disabled:opacity-30 ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <Presentation size={16} />
              </button>
            </Tooltip>
            <Tooltip content={isSpeaking ? 'Detener lectura' : 'Leer página en voz alta'}>
              <button onClick={handleReadAloud} disabled={!activeDoc} aria-label="Leer en voz alta" className={`p-1.5 rounded transition-colors disabled:opacity-30 ${isSpeaking ? 'bg-blue-600 text-white' : tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </Tooltip>
            <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </Tooltip>
            <Tooltip content="Atajos de teclado" shortcut="F1">
              <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-shortcuts'))} aria-label="Atajos de teclado" className={`p-1.5 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-300', 'hover:bg-gray-200 text-gray-600')}`}>
                <HelpCircle size={16} />
              </button>
            </Tooltip>
          </div>

          <div className={`w-px h-5 mx-1 ${tc('bg-slate-700', 'bg-gray-300')}`} />

          <div className="flex items-center gap-2">
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

    </div>
  )
}
