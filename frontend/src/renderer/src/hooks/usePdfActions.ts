import { useStoreSlice } from './useStoreSlice'
import { type PdfDoc } from '../store/usePdfStore'
import { type Field, type FormValues } from '../components/FormModal'

import { apiFetch } from '../lib/api'

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
    docs, addDoc, setPage, setZoom,
    setFitMode, computeFitZoom, viewerWidth, viewerHeight,
    updateDocPageCount, updateDocPageSizes, showToast,
    setDocDirty, invalidatePageCache, invalidateThumbnails, setSaveStatus,
    toggleCompareMode, setCompareDoc, compareMode, compareDocId, incrementDocVersion,
    activeTool, setActiveTool, setSelectedImagePath, setSelectedImageData,
  } = useStoreSlice(
    'docs', 'addDoc', 'setPage', 'setZoom',
    'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'updateDocPageCount', 'updateDocPageSizes', 'showToast',
    'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails', 'setSaveStatus',
    'toggleCompareMode', 'setCompareDoc', 'compareMode', 'compareDocId', 'incrementDocVersion',
    'activeTool', 'setActiveTool', 'setSelectedImagePath', 'setSelectedImageData',
  )

  const handleExportWord = async () => {
    if (!activeDoc) return
    try {
      const res = await apiFetch(`/pdf/export-word/${activeDoc.doc_id}`)
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
      const res = await apiFetch(`/pdf/page-numbers/${activeDoc.doc_id}?prefix=${encodeURIComponent(prefix)}&start=1&position=${v.position}`, { method: 'POST' })
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
      if (!avail.available) { showToast('Tesseract OCR no está instalado en el sistema', 'error'); return }
      showToast('Procesando OCR de la página...', 'info')
      const res = await apiFetch(`/pdf/make-searchable/${activeDoc.doc_id}?page=${activeDoc.currentPage}`, { method: 'POST' })
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
      const res = await apiFetch(`/pdf/watermark/${activeDoc.doc_id}`, {
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
      const res = await apiFetch(`/pdf/export-excel/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
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
      const res = await apiFetch(`/pdf/export-pptx/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
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
      const res = await apiFetch(`/pdf/ocr/${activeDoc.doc_id}/${activeDoc.currentPage}`)
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
      const res = await apiFetch(`/pdf/metadata/${activeDoc.doc_id}`, {
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
      const res = await apiFetch(`/pdf/header-footer/${activeDoc.doc_id}`, {
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
      const res = await apiFetch(`/pdf/merge/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          // Reload doc info
          const infoRes = await apiFetch(`/pdf/open`, {
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
      const res = await apiFetch(`/pdf/compress/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
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
    const res = await apiFetch(`/pdf/compress/${d.doc_id}?output_path=${encodeURIComponent(out)}`, { method: 'POST' })
    if (!res.ok) throw new Error('compress ' + d.file_name)
  })

  const handleBatchWatermark = async () => {
    const v = await askForm('Marca de agua en todos los documentos', [{ name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' }], 'Aplicar a todos')
    if (!v) return
    const text = String(v.text).trim()
    if (!text) return
    await runBatch('Marca de agua', async (d) => {
      const res = await apiFetch(`/pdf/watermark/${d.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('watermark ' + d.file_name)
      setDocDirty(d.doc_id, true); invalidatePageCache(d.doc_id); invalidateThumbnails(d.doc_id); incrementDocVersion(d.doc_id)
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
      const res = await apiFetch(`/pdf/rotate/${activeDoc.doc_id}`, {
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
      const res = await apiFetch(`/pdf/rotate-all/${activeDoc.doc_id}`, {
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
      const res = await apiFetch(`/pdf/delete-pages/${activeDoc.doc_id}`, {
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
    setZoom(activeDoc.doc_id, z, false) // preservar el modo fit
  }

  const handleInsertBlank = async () => {
    if (!activeDoc) return
    const index = activeDoc.currentPage + 1
    try {
      const res = await apiFetch(`/pdf/insert-blank/${activeDoc.doc_id}?index=${index}`, { method: 'POST' })
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
      const res = await apiFetch(`/pdf/duplicate-page/${activeDoc.doc_id}?page_num=${activeDoc.currentPage}`, { method: 'POST' })
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
    const measures = anns.filter((a) => a.type === 'measure_distance' || a.type === 'measure_area')
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
        tipo: a.type === 'measure_distance' ? 'Distancia' : 'Área',
        etiqueta: a.measurement?.label || '',
        valor: a.measurement ? a.measurement.value.toFixed(2) : '',
        unidad: a.measurement?.unit || 'px',
      }))
    const byCategory = new Map<string, number>()
    for (const c of counts) {
      const cat = c.text || 'General'
      byCategory.set(cat, (byCategory.get(cat) || 0) + 1)
    }
    for (const [cat, n] of byCategory) {
      rows.push({ page: '', tipo: 'Conteo (total)', etiqueta: cat, valor: String(n), unidad: 'uds' })
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
    handleExportMeasurements,
  }
}
