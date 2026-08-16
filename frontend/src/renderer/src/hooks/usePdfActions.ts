import { useStoreSlice } from './useStoreSlice'
import { usePdfStore, type PdfDoc } from '../store/usePdfStore'
import { type Field, type FormValues } from '../components/FormModal'

import { apiFetch } from '../lib/api'
import {
  deletePagesUndoable,
  duplicatePageUndoable,
  headerFooterUndoable,
  insertBlankUndoable,
  makeSearchableUndoable,
  metadataUndoable,
  mergePdfUndoable,
  pageNumbersUndoable,
  rotatePagesUndoable,
  watermarkUndoable,
} from '../lib/pageUndo'

type ActiveDoc = PdfDoc | undefined

type Helpers = {
  askForm: (title: string, fields: Field[], submitLabel?: string) => Promise<FormValues | null>
  askConfirm: (title: string, message: string, confirmLabel?: string) => Promise<boolean>
  toastActionError: (err: unknown) => void
}

/** Operaciones de documento de la barra de herramientas que no dependen del estado
 * de UI local (búsqueda/reemplazo/lectura quedan en Toolbar). Cada handler es un
 * wrapper sobre el backend; movidos verbatim desde Toolbar.tsx. */
export function usePdfActions(activeDoc: ActiveDoc, { askForm, askConfirm, toastActionError }: Helpers) {
  const {
    docs, addDoc, setZoom,
    setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    showToast,
    setDocDirty, setSaveStatus,
    toggleCompareMode, setCompareDoc, compareMode, compareDocId,
    activeTool, setActiveTool, setSelectedImagePath, setSelectedImageData,
    setAnnotations,
  } = useStoreSlice(
    'docs', 'addDoc', 'setZoom',
    'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'showToast',
    'setDocDirty', 'setSaveStatus',
    'toggleCompareMode', 'setCompareDoc', 'compareMode', 'compareDocId',
    'activeTool', 'setActiveTool', 'setSelectedImagePath', 'setSelectedImageData',
    'setAnnotations',
  )

  const handleExportWord = async () => {
    if (!activeDoc) return
    try {
      const res = await withProgress('Exportando a Word…', () => apiFetch(`/pdf/export-word/${activeDoc.doc_id}`))
      if (res.ok) {
        const data = await res.json()
        const link = document.createElement('a')
        link.download = data.filename || `${activeDoc.file_name.replace(/\.pdf$/i, '')}.docx`
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
      await pageNumbersUndoable(activeDoc.doc_id, prefix, 1, String(v.position))
      showToast('Numeración aplicada. Ctrl+Z deshace.', 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleMarkupSummary = async () => {
    if (!activeDoc) return
    try {
      const res = await apiFetch(`/pdf/markup-summary/${activeDoc.doc_id}`, {
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

  const handleMakeSearchable = async () => {
    if (!activeDoc) return
    try {
      const avail = await (await apiFetch(`/pdf/ocr-available`)).json()
      if (!avail.available) {
        showToast('Tesseract OCR no está instalado. Instalá tesseract-ocr y reiniciá la app.', 'error')
        return
      }
      const v = await askForm('Hacer buscable (OCR)', [
        { name: 'scope', label: 'Alcance', type: 'select', options: ['Página actual', 'Todo el documento'], defaultValue: 'Página actual' },
      ], 'Aplicar')
      if (!v) return
      const all = String(v.scope).includes('documento')
      const words = await withProgress(
        all ? 'OCR de todo el documento…' : 'Haciendo la página buscable (OCR)…',
        () => makeSearchableUndoable(activeDoc.doc_id, all ? undefined : activeDoc.currentPage),
      )
      if (words > 0) showToast(`OCR aplicado: ${words} palabra(s). Ctrl+Z deshace.`, 'success')
      else showToast('Nada que OCR: la página ya tiene texto', 'info')
    } catch (err) { toastActionError(err) }
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
      const embedRes = await apiFetch(`/pdf/embed/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (!embedRes.ok) throw new Error('Error al embeber anotaciones')
      const res = await apiFetch(`/pdf/save-password/${activeDoc.doc_id}`, {
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
      await watermarkUndoable(activeDoc.doc_id, text)
      showToast('Marca de agua agregada. Ctrl+Z deshace.', 'success')
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
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.xlsx') })
    if (!outputPath) return
    try {
      const res = await withProgress('Exportando a Excel…', () => apiFetch(`/pdf/export-excel/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' }))
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
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.pptx') })
    if (!outputPath) return
    try {
      const res = await withProgress('Exportando a PowerPoint…', () => apiFetch(`/pdf/export-pptx/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' }))
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
      const res = await withProgress('Reconociendo texto (OCR)…', () => apiFetch(`/pdf/ocr/${activeDoc.doc_id}/${activeDoc.currentPage}`))
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
      const res = await apiFetch(`/pdf/page-image/${activeDoc.doc_id}/${activeDoc.currentPage}?zoom=2.0`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${activeDoc.file_name.replace(/\.pdf$/i, '')}_pagina_${activeDoc.currentPage + 1}.png`
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
      await metadataUndoable(activeDoc.doc_id, {
        title: String(v.title) || undefined,
        author: String(v.author) || undefined,
        subject: String(v.subject) || undefined,
        keywords: String(v.keywords) || undefined,
      })
      showToast('Metadatos actualizados. Ctrl+Z deshace.', 'success')
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
      await headerFooterUndoable(activeDoc.doc_id, header || undefined, footer || undefined)
      showToast('Encabezado/pie agregado. Ctrl+Z deshace.', 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleMerge = async () => {
    if (!activeDoc) return
    const sourcePath = await window.api.openFile()
    if (!sourcePath) return
    try {
      await mergePdfUndoable(activeDoc.doc_id, sourcePath)
      showToast('PDFs combinados. Ctrl+Z deshace.', 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleCompress = async () => {
    if (!activeDoc) return
    const outputPath = activeDoc.file_path.replace(/\.pdf$/i, '_compressed.pdf')
    try {
      const res = await withProgress('Comprimiendo…', () => apiFetch(`/pdf/compress/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' }))
      if (res.ok) {
        showToast('Comprimido en ' + outputPath.split(/[\\/]/).pop() + ' (archivo nuevo)', 'success')
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
    const { startProgress, updateProgress, endProgress, isCancelRequested } = usePdfStore.getState()
    startProgress(label, docs.length)
    let ok = 0
    let canceled = false
    for (const [i, d] of docs.entries()) {
      // Cancelar detiene la cola: lo ya procesado se conserva.
      if (isCancelRequested()) { canceled = true; break }
      updateProgress(i, d.file_name)
      try { await op(d); ok++ } catch (err) { window.api.logError(`[batch] ${String(err)}`).catch(() => {}) }
      updateProgress(i + 1, d.file_name)
    }
    endProgress()
    showToast(
      canceled ? `${label}: cancelado tras ${ok} documento(s)` : `${label}: ${ok}/${docs.length} completado(s)`,
      canceled ? 'info' : ok === docs.length ? 'success' : 'error',
    )
  }

  /** Envuelve una operación de un solo documento que tarda (OCR, exportar, comprimir)
   * con un progreso indeterminado, para que la app no parezca colgada. */
  const withProgress = async <T,>(label: string, op: () => Promise<T>): Promise<T> => {
    const { startProgress, endProgress } = usePdfStore.getState()
    startProgress(label, 0, false)
    try {
      return await op()
    } finally {
      endProgress()
    }
  }

  const handleBatchCompress = () => runBatch('Comprimir', async (d) => {
    const out = d.file_path.replace(/\.pdf$/i, '_compressed.pdf')
    const res = await apiFetch(`/pdf/compress/${d.doc_id}?output_path=${encodeURIComponent(out)}`, { method: 'POST' })
    if (!res.ok) throw new Error('compress ' + d.file_name)
  })

  const handleBatchWatermark = async () => {
    const v = await askForm('Marca de agua en todos los documentos', [{ name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' }], 'Aplicar a todos')
    if (!v) return
    const text = String(v.text).trim()
    if (!text) return
    await runBatch('Marca de agua', async (d) => {
      await watermarkUndoable(d.doc_id, text)
    })
  }

  const handleBatchExportWord = () => runBatch('Exportar a Word', async (d) => {
    const res = await apiFetch(`/pdf/export-word/${d.doc_id}`)
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
      const res = await apiFetch(`/pdf/split/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
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
      const res = await apiFetch(`/pdf/open`, {
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
      await rotatePagesUndoable(activeDoc.doc_id, [activeDoc.currentPage], degrees)
      showToast(`Página rotada ${degrees}°. Ctrl+Z deshace.`, 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleRotateAll = async (degrees: number) => {
    if (!activeDoc) return
    try {
      await rotatePagesUndoable(activeDoc.doc_id, 'all', degrees)
      showToast(`Documento rotado ${degrees}°. Ctrl+Z deshace.`, 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleDeletePage = async () => {
    if (!activeDoc) return
    if (activeDoc.page_count <= 1) {
      showToast('No se puede eliminar la única página', 'error')
      return
    }
    if (!(await askConfirm('Eliminar página', `¿Eliminar la página ${activeDoc.currentPage + 1}?`, 'Eliminar'))) return
    try {
      await deletePagesUndoable(activeDoc.doc_id, [activeDoc.currentPage])
      showToast('Página eliminada. Ctrl+Z la restaura.', 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleFit = (mode: 'fit-width' | 'fit-page') => {
    if (!activeDoc) return
    setFitMode(activeDoc.doc_id, mode)
    const z = computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, mode, viewerWidth, viewerHeight)
    setZoom(activeDoc.doc_id, z, false) // preservar el modo fit
  }

  const handleInsertBlank = async () => {
    if (!activeDoc) return
    try {
      await insertBlankUndoable(activeDoc.doc_id, activeDoc.currentPage + 1)
      showToast('Página en blanco insertada. Ctrl+Z deshace.', 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleDuplicatePage = async () => {
    if (!activeDoc) return
    try {
      await duplicatePageUndoable(activeDoc.doc_id, activeDoc.currentPage)
      showToast('Página duplicada. Ctrl+Z deshace.', 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleExportTxt = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.txt'), filters: [{ name: 'Texto', extensions: ['txt'] }] })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/export-txt/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      showToast(res.ok ? 'Exportado a TXT' : 'Error al exportar', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleExportHtml = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.html'), filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/export-html/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      showToast(res.ok ? 'Exportado a HTML' : 'Error al exportar', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleRemovePassword = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({ defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_sin_clave.pdf') })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/remove-password/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      showToast(res.ok ? 'PDF guardado sin contraseña' : 'Error al quitar contraseña', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleExportMeasurements = async () => {
    if (!activeDoc) return
    const anns = activeDoc.annotations
    const measures = anns.filter((a) => a.type === 'measure_distance' || a.type === 'measure_area' || a.type === 'measure_perimeter')
    const counts = anns.filter((a) => a.type === 'count')
    if (measures.length === 0 && counts.length === 0) {
      showToast('No hay mediciones ni conteos en el documento', 'info')
      return
    }
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_mediciones.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }, { name: 'CSV', extensions: ['csv'] }],
    })
    if (!outputPath) return
    const rows = [...measures]
      .sort((a, b) => a.page - b.page)
      .map((a) => ({
        page: String(a.page + 1),
        tipo: a.type === 'measure_distance' ? 'Distancia' : a.type === 'measure_perimeter' ? 'Perímetro' : 'Área',
        etiqueta: a.measurement?.label || '',
        valor: a.measurement ? a.measurement.value.toFixed(2) : '',
        unidad: a.measurement?.unit || 'px',
      }))
    // Los conteos se agrupan por categoría + símbolo (dos categorías pueden usar
    // el mismo nombre con símbolos distintos en planos diferentes).
    const byCategory = new Map<string, { n: number; symbol: string }>()
    for (const c of counts) {
      const cat = c.text || 'General'
      const cur = byCategory.get(cat)
      byCategory.set(cat, { n: (cur?.n || 0) + 1, symbol: c.symbol || cur?.symbol || 'circle' })
    }
    for (const [cat, { n, symbol }] of byCategory) {
      rows.push({ page: '', tipo: `Conteo (${symbol})`, etiqueta: cat, valor: String(n), unidad: 'uds' })
    }
    const scale = activeDoc.measurementScale
    const title = `${activeDoc.file_name} — ${scale ? `escala: 1 ${scale.unit} = ${scale.pixelsPerUnit.toFixed(2)} pt` : 'sin calibrar'}`
    try {
      const res = await apiFetch('/pdf/export-measurements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output_path: outputPath, title, rows }),
      })
      showToast(res.ok ? `Tabla exportada (${rows.length} filas)` : 'Error al exportar', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleExportXfdf = async () => {
    if (!activeDoc) return
    if (activeDoc.annotations.length === 0) {
      showToast('No hay anotaciones que exportar', 'info')
      return
    }
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.xfdf'),
      filters: [{ name: 'XFDF', extensions: ['xfdf'] }],
    })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/export-xfdf/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      showToast(res.ok ? `${activeDoc.annotations.length} anotación(es) exportadas a XFDF` : 'Error al exportar XFDF', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleImportXfdf = async () => {
    if (!activeDoc) return
    const path = await window.api.openFile([{ name: 'XFDF', extensions: ['xfdf'] }])
    if (!path) return
    try {
      const res = await apiFetch(`/pdf/import-xfdf/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
      if (!res.ok) { showToast('Error al importar XFDF', 'error'); return }
      const data = await res.json()
      const imported = data.annotations || []
      if (imported.length === 0) { showToast('El XFDF no contiene anotaciones compatibles', 'info'); return }
      setAnnotations(activeDoc.doc_id, [...activeDoc.annotations, ...imported])
      setDocDirty(activeDoc.doc_id, true)
      showToast(`${imported.length} anotación(es) importadas`, 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleImagesToPdf = async () => {
    const images = await window.api.openFiles([{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tif', 'tiff'] }])
    if (!images || images.length === 0) return
    const outputPath = await window.api.saveFile({ defaultPath: 'imagenes.pdf' })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/images-to-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, output_path: outputPath }),
      })
      showToast(res.ok ? `PDF creado de ${images.length} imagen(es)` : 'Error al convertir', res.ok ? 'success' : 'error')
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

  return {
    handleExportWord, handleAddPageNumbers, handleMarkupSummary, handleMakeSearchable,
    handleSaveWithPassword, handleWatermark, handleRedact, handleCrop,
    handleExportExcel, handleExportPptx, handleOcr, handleSavePageAsImage,
    handleEditMetadata, handleHeaderFooter, handleMerge, handleCompress,
    handleBatchCompress, handleBatchWatermark, handleBatchExportWord,
    handleSplit, handleCompare, handleRotate, handleRotateAll, handleDeletePage,
    handleFit, handleInsertBlank, handleDuplicatePage, handleToolClick,
    handleExportTxt, handleExportHtml, handleRemovePassword, handleImagesToPdf,
    handleExportMeasurements, handleExportXfdf, handleImportXfdf,
  }
}
