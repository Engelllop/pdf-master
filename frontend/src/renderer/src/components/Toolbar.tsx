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
} from 'lucide-react'
import RibbonTabs from './ribbon/RibbonTabs'
import PrintDialog from './PrintDialog'
import PropertiesBar from './PropertiesBar'
import { useFormModal } from './FormModal'
import { useState, useRef, useEffect } from 'react'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'

const API_BASE = 'http://localhost:8745'

export default function Toolbar() {
  const tc = useThemeClasses()
  const {
    docs, activeDocId, addDoc,
    setPage, setZoom,
    setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    setSearchQuery, setSearchResults, nextSearchResult, prevSearchResult,
    updateDocPageCount, updateDocPageSizes, showToast,
    setDocDirty, invalidatePageCache, invalidateThumbnails, setSaveStatus,
    readingMode, toggleReadingMode, togglePresentationMode, continuousMode, toggleContinuousMode,
    toggleCompareMode, setCompareDoc, compareMode, compareDocId, incrementDocVersion,
    activeRibbon, activeTool, setActiveTool, annotationColor, setAnnotationColor,
    setSelectedImagePath, setSelectedImageData,
  } = useStoreSlice(
    'docs', 'activeDocId', 'addDoc',
    'setPage', 'setZoom',
    'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'setSearchQuery', 'setSearchResults', 'nextSearchResult', 'prevSearchResult',
    'updateDocPageCount', 'updateDocPageSizes', 'showToast',
    'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails', 'setSaveStatus',
    'readingMode', 'toggleReadingMode', 'togglePresentationMode', 'continuousMode', 'toggleContinuousMode',
    'toggleCompareMode', 'setCompareDoc', 'compareMode', 'compareDocId', 'incrementDocVersion',
    'activeRibbon', 'activeTool', 'setActiveTool', 'annotationColor', 'setAnnotationColor',
    'setSelectedImagePath', 'setSelectedImageData',
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
    const v = await askForm('Numerar páginas', [
      { name: 'prefix', label: 'Prefijo Bates (vacío = "n / total")', type: 'text', defaultValue: '', placeholder: 'Ej. DOC-' },
      { name: 'position', label: 'Posición', type: 'select', options: ['bottom', 'top'], defaultValue: 'bottom' },
    ])
    if (!v) return
    const prefix = String(v.prefix)
    try {
      const res = await fetch(`${API_BASE}/pdf/page-numbers/${activeDoc.doc_id}?prefix=${encodeURIComponent(prefix)}&start=1&position=${v.position}`, { method: 'POST' })
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
    if (!(await askConfirm('Redactar coincidencias', `Se tacharán permanentemente todas las ocurrencias de "${searchInput}". Esta acción no se puede deshacer.`, 'Redactar'))) return
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

  const handleSaveWithPassword = async () => {
    if (!activeDoc) return
    const v = await askForm('Guardar con contraseña (AES-256)', [
      { name: 'user', label: 'Contraseña de usuario (abrir el PDF)', type: 'password', defaultValue: '' },
      { name: 'owner', label: 'Contraseña de owner (permisos, opcional)', type: 'password', defaultValue: '' },
    ], 'Guardar')
    if (!v) return
    const userPw = String(v.user)
    const ownerPw = String(v.owner)
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

  const handleWatermark = async () => {
    if (!activeDoc) return
    const v = await askForm('Marca de agua', [{ name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' }])
    if (!v) return
    const text = String(v.text).trim()
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

  const handleRedact = () => {
    if (!activeDoc) return
    setActiveTool('redactarea')
    showToast('Arrastra el área a redactar y suelta para aplicar', 'info')
  }

  const handleCrop = () => {
    if (!activeDoc) return
    setActiveTool('croparea')
    showToast('Arrastra el área a conservar y suelta para recortar', 'info')
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
        await askForm(`Texto OCR · página ${activeDoc.currentPage + 1}`,
          [{ name: 't', label: '', type: 'textarea', defaultValue: data.text || 'Sin texto detectado', readOnly: true }], 'Cerrar')
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
    const v = await askForm('Editar metadatos', [
      { name: 'title', label: 'Título', type: 'text', defaultValue: activeDoc.title || '' },
      { name: 'author', label: 'Autor', type: 'text', defaultValue: activeDoc.author || '' },
      { name: 'subject', label: 'Asunto', type: 'text', defaultValue: activeDoc.subject || '' },
      { name: 'keywords', label: 'Palabras clave', type: 'text', defaultValue: '' },
    ], 'Guardar')
    if (!v) return
    try {
      const res = await fetch(`${API_BASE}/pdf/metadata/${activeDoc.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: String(v.title) || undefined, author: String(v.author) || undefined, subject: String(v.subject) || undefined, keywords: String(v.keywords) || undefined }),
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
    const v = await askForm('Encabezado y pie de página', [
      { name: 'header', label: 'Encabezado (vacío = omitir)', type: 'text', defaultValue: '' },
      { name: 'footer', label: 'Pie de página (vacío = omitir)', type: 'text', defaultValue: '' },
    ], 'Aplicar')
    if (!v) return
    const header = String(v.header), footer = String(v.footer)
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

  // --- Por lotes: aplica una operación a TODOS los documentos abiertos ---
  const runBatch = async (label: string, op: (d: typeof docs[number]) => Promise<void>) => {
    if (docs.length === 0) { showToast('No hay documentos abiertos', 'info'); return }
    showToast(`${label}: procesando ${docs.length} documento(s)...`, 'info')
    let ok = 0
    for (const d of docs) {
      try { await op(d); ok++ } catch (err) { window.api.logError(`[batch] ${String(err)}`).catch(() => {}) }
    }
    showToast(`${label}: ${ok}/${docs.length} completado(s)`, ok === docs.length ? 'success' : 'error')
  }

  const handleBatchCompress = () => runBatch('Comprimir', async (d) => {
    const out = d.file_path.replace(/\.pdf$/i, '_compressed.pdf')
    const res = await fetch(`${API_BASE}/pdf/compress/${d.doc_id}?output_path=${encodeURIComponent(out)}`, { method: 'POST' })
    if (!res.ok) throw new Error('compress ' + d.file_name)
  })

  const handleBatchWatermark = async () => {
    const v = await askForm('Marca de agua en todos los documentos', [{ name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' }], 'Aplicar a todos')
    if (!v) return
    const text = String(v.text).trim()
    if (!text) return
    await runBatch('Marca de agua', async (d) => {
      const res = await fetch(`${API_BASE}/pdf/watermark/${d.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('watermark ' + d.file_name)
      setDocDirty(d.doc_id, true); invalidatePageCache(d.doc_id); invalidateThumbnails(d.doc_id); incrementDocVersion(d.doc_id)
    })
  }

  const handleBatchExportWord = () => runBatch('Exportar a Word', async (d) => {
    const res = await fetch(`${API_BASE}/pdf/export-word/${d.doc_id}`)
    if (!res.ok) throw new Error('word ' + d.file_name)
    const data = await res.json()
    const link = document.createElement('a')
    link.download = data.filename || `${d.file_name.replace(/\.pdf$/i, '')}.docx`
    link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${data.data_base64}`
    link.click()
  })

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
      const v = await askForm('Dividir / extraer páginas', [
        { name: 'range', label: 'Rango de páginas', type: 'text', defaultValue: '', placeholder: 'Ej. 1-5, 8, 10-12' },
      ], 'Continuar')
      if (!v) return
      const input = String(v.range).trim()
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
      // No activar: el doc actual queda en el panel izquierdo (activeDocId) y el recién
      // abierto en el derecho (compareDocId). Activarlo hacía que ambos paneles
      // apuntaran al mismo PDF.
      const docId = addDoc(data, false)
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
    if (!(await askConfirm('Eliminar página', `¿Eliminar la página ${activeDoc.currentPage + 1}?`, 'Eliminar'))) return
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
    if (!(await askConfirm('Reemplazar todo', `Se reemplazarán todas las ocurrencias de "${searchInput}" por "${replaceInput}".`, 'Reemplazar todo'))) return
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

  const handleInsertBlank = async () => {
    if (!activeDoc) return
    const index = activeDoc.currentPage + 1
    try {
      const res = await fetch(`${API_BASE}/pdf/insert-blank/${activeDoc.doc_id}?index=${index}`, { method: 'POST' })
      if (res.ok) {
        updateDocPageCount(activeDoc.doc_id, activeDoc.page_count + 1)
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Página en blanco insertada', 'success')
      } else showToast('Error al insertar página', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleDuplicatePage = async () => {
    if (!activeDoc) return
    try {
      const res = await fetch(`${API_BASE}/pdf/duplicate-page/${activeDoc.doc_id}?page_num=${activeDoc.currentPage}`, { method: 'POST' })
      if (res.ok) {
        updateDocPageCount(activeDoc.doc_id, activeDoc.page_count + 1)
        setDocDirty(activeDoc.doc_id, true)
        invalidatePageCache(activeDoc.doc_id)
        invalidateThumbnails(activeDoc.doc_id)
        incrementDocVersion(activeDoc.doc_id)
        showToast('Página duplicada', 'success')
      } else showToast('Error al duplicar', 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleToolClick = async (toolId: string) => {
    if (toolId === 'image') {
      const path = await window.api.openFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }])
      if (!path) return
      setSelectedImagePath(path)
      const base64 = await window.api.readFileBase64(path)
      if (!base64) { showToast('Error al cargar la imagen', 'error'); return }
      const ext = path.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : ext === 'webp' ? 'image/webp' : 'image/png'
      setSelectedImageData(`data:${mime};base64,${base64}`)
      setActiveTool('image')
      showToast('Imagen lista. Haz click en el documento para colocarla.', 'success')
      return
    }
    setActiveTool(activeTool === toolId ? null : toolId)
  }

  // Botón de la barra contextual: solo icono (la descripción va en el tooltip)
  const TBtn = ({ icon: Icon, label, tip, onClick, active = false, disabled = false }: any) => (
    <Tooltip content={tip || label}>
      <button onClick={onClick} disabled={disabled} aria-label={tip || label}
        className={`flex items-center justify-center p-2 rounded-token transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          active ? 'bg-active text-accent' : 'text-fg hover:bg-hover'
        }`}>
        <Icon size={17} strokeWidth={1.75} />
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
            <Sep />
            <TBtn icon={FileDown} label="Resumen" tip="Resumen de marcas (PDF)" onClick={handleMarkupSummary} />
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
            <TBtn icon={FileImage} label="Imagen" tip="Guardar página como imagen" onClick={handleSavePageAsImage} />
            <Sep />
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
