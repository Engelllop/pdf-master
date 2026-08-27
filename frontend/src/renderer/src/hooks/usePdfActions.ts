import { useStoreSlice } from './useStoreSlice'
import { scaleForPage, usePdfStore, type PdfDoc, type Annotation } from '../store/usePdfStore'
import { type Field, type FormValues } from '../components/FormModal'

import { apiFetch } from '../lib/api'
import { parsePageRanges, parsePagesField } from '../lib/pageRange'
import { correrCola } from '../lib/batchQueue'
import { avisarSiFallóLaCopia, confirmarEscrituraEn, confirmarSobrescritura, pushAnnotations, refrescarEstadoEnDisco } from '../lib/saveDocument'
import {
  deletePagesUndoable,
  duplicatePageUndoable,
  headerFooterUndoable,
  insertBlankUndoable,
  makeSearchableAllUndoable,
  makeSearchableUndoable,
  metadataUndoable,
  mergePdfUndoable,
  pageNumbersUndoable,
  rotatePagesUndoable,
  watermarkUndoable,
} from '../lib/pageUndo'

type ActiveDoc = PdfDoc | undefined

/** El aviso dice sobre cuántas páginas se aplicó: sellar 3 de 60 láminas y leer el
 * mismo «agregado» que al sellarlas todas no deja ver si el rango se tomó en cuenta. */
function rangoAplicado(hecho: string, pages?: number[]): string {
  const donde = pages?.length ? ` en ${pages.length} página(s)` : ''
  return `${hecho}${donde}. Ctrl+Z deshace.`
}

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
    setAnnotations, commitAnnotationGesture,
  } = useStoreSlice(
    'docs', 'addDoc', 'setZoom',
    'setFitMode', 'computeFitZoom', 'viewerWidth', 'viewerHeight',
    'showToast',
    'setDocDirty', 'setSaveStatus',
    'toggleCompareMode', 'setCompareDoc', 'compareMode', 'compareDocId',
    'activeTool', 'setActiveTool', 'setSelectedImagePath', 'setSelectedImageData',
    'setAnnotations', 'commitAnnotationGesture',
  )

  const handleExportWord = async () => {
    if (!activeDoc) return
    // Era la única exportación que no preguntaba dónde guardar: se bajaba por un
    // `data:` URL a la carpeta de descargas (y de un PDF largo, en una sola cadena
    // base64 de varios MB).
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.docx'),
      filters: [{ name: 'Word', extensions: ['docx'] }],
    })
    if (!outputPath) return
    try {
      const res = await withProgress('Exportando a Word…',
        () => apiFetch(`/pdf/export-word/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`))
      showToast(res.ok ? 'Exportado a Word' : 'Error al exportar a Word', res.ok ? 'success' : 'error')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleAddPageNumbers = async () => {
    if (!activeDoc) return
    const v = await askForm('Numerar páginas', [
      { name: 'prefix', label: 'Prefijo (vacío = n / total)', type: 'text', defaultValue: '', placeholder: 'Ej. DOC-' },
      { name: 'position', label: 'Posición', type: 'select', options: ['Abajo', 'Arriba'], defaultValue: 'Abajo' },
      { name: 'pages', label: 'Páginas (vacío = todas)', type: 'text', defaultValue: '', placeholder: 'Ej. 1-5, 8' },
    ])
    if (!v) return
    const prefix = String(v.prefix)
    const position = String(v.position) === 'Arriba' ? 'top' : 'bottom'
    const pages = parsePagesField(String(v.pages ?? ''), activeDoc.page_count)
    if (pages === null) {
      showToast(`Rango de páginas inválido (el documento tiene ${activeDoc.page_count})`, 'error')
      return
    }
    try {
      await pageNumbersUndoable(activeDoc.doc_id, prefix, 1, position, pages)
      showToast(rangoAplicado('Numeración aplicada', pages), 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleMarkupSummary = async () => {
    if (!activeDoc) return
    if (activeDoc.annotations.length === 0) {
      showToast('Este documento no tiene marcas que resumir', 'info')
      return
    }
    // Se pregunta dónde guardarlo, como el resto de exportaciones. Antes se bajaba
    // por un `data:` URL a la carpeta de descargas, sin decir a dónde iba.
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_marcas.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/markup-summary/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (res.ok) showToast('Resumen de marcas guardado', 'success')
      else showToast('Error al generar resumen', 'error')
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
      if (all) {
        // Antes esto era UNA petición para todo el documento: minutos con el motor
        // tomado, sin progreso y sin forma de cortar. El usuario elegía «todo el
        // documento» en un escaneo de 300 láminas y se quedaba mirando una app
        // aparentemente colgada.
        const pend = await apiFetch(`/pdf/ocr-pending/${activeDoc.doc_id}`)
        const datos = pend.ok ? await pend.json() : null
        const paginas: number[] = datos?.pages ?? []
        if (datos && paginas.length === 0) {
          showToast('Todas las páginas ya tienen texto: no hay nada que OCR', 'info')
          return
        }
        const ok = await askConfirm(
          'Hacer buscable todo el documento',
          `Se va a reconocer texto en ${paginas.length} de ${activeDoc.page_count} página(s).`
          + '\n\nTarda del orden de un segundo o dos por página. Se puede cancelar:'
          + ' lo ya reconocido se conserva. Ctrl+Z deshace todo el lote.',
          'Empezar',
        )
        if (!ok) return
        // Página por página para poder mostrar progreso real y cancelar; el paso de
        // deshacer sigue siendo uno solo (el stash se toma antes de empezar).
        const { startProgress, updateProgress, endProgress, isCancelRequested } = usePdfStore.getState()
        startProgress('OCR del documento', paginas.length)
        let res
        try {
          res = await makeSearchableAllUndoable(activeDoc.doc_id, paginas, {
            avanzar: (n, p) => updateProgress(n, `Página ${p + 1}`),
            cancelado: isCancelRequested,
          })
        } finally {
          endProgress()
        }
        if (res.palabras > 0) {
          showToast(
            res.cancelado
              ? `Cancelado: ${res.palabras} palabra(s) en ${res.hechas} de ${paginas.length} página(s). Ctrl+Z deshace.`
              : `OCR aplicado: ${res.palabras} palabra(s) en ${res.hechas} página(s). Ctrl+Z deshace.`,
            res.cancelado ? 'info' : 'success',
          )
        } else {
          showToast(res.cancelado ? 'OCR cancelado' : 'El OCR no encontró texto en esas páginas', 'info')
        }
        return
      }
      const words = await withProgress(
        'Haciendo la página buscable (OCR)…',
        () => makeSearchableUndoable(activeDoc.doc_id, activeDoc.currentPage),
      )
      if (words > 0) showToast(`OCR aplicado: ${words} palabra(s). Ctrl+Z deshace.`, 'success')
      else if (words < 0) showToast('Tesseract OCR no está disponible', 'error')
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
    // Con los dos campos vacíos el motor guarda SIN cifrar (su rama es
    // `if user_password or owner_password`), y la app decía igual «PDF protegido con
    // contraseña guardado»: el usuario se quedaba creyendo que el archivo iba cifrado.
    if (!userPw && !ownerPw) {
      showToast('Escribí al menos la contraseña de usuario para proteger el PDF', 'error')
      return
    }
    // Escribe ENCIMA del original (y encima cifrado): era la única ruta de guardado sin
    // el aviso de «el archivo cambió en disco».
    if (!(await confirmarSobrescritura(activeDoc.doc_id))) return
    setSaveStatus('saving')
    try {
      const embedRes = await apiFetch(`/pdf/embed/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      if (!embedRes.ok) throw new Error('Error al embeber anotaciones')
      const res = await apiFetch(`/pdf/save-password/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_password: userPw || undefined,
          owner_password: ownerPw || undefined,
          // Sobrescribe el archivo original (y encima cifrado): es justo donde la
          // copia .bak hace falta, y esta ruta ni miraba el ajuste.
          backup: usePdfStore.getState().backupOnSave,
        }),
      })
      if (res.ok) {
        setDocDirty(activeDoc.doc_id, false)
        setSaveStatus('saved')
        showToast('PDF protegido con contraseña guardado', 'success')
        await avisarSiFallóLaCopia(res)
        // Nuestro propio guardado cambió la fecha: sin refrescar la referencia, el
        // siguiente Ctrl+S avisaría de un cambio externo que fuimos nosotros.
        await refrescarEstadoEnDisco(activeDoc.doc_id)
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
    const v = await askForm('Marca de agua', [
      { name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' },
      { name: 'pages', label: 'Páginas (vacío = todas)', type: 'text', defaultValue: '', placeholder: 'Ej. 1-5, 8' },
    ])
    if (!v) return
    const text = String(v.text).trim()
    if (!text) return
    const pages = parsePagesField(String(v.pages ?? ''), activeDoc.page_count)
    if (pages === null) {
      showToast(`Rango de páginas inválido (el documento tiene ${activeDoc.page_count})`, 'error')
      return
    }
    try {
      await watermarkUndoable(activeDoc.doc_id, text, pages)
      showToast(rangoAplicado('Marca de agua agregada', pages), 'success')
    } catch (err) {
      toastActionError(err)
    }
  }

  const handleRedact = () => {
    if (!activeDoc) return
    setActiveTool('redactarea')
    showToast('Arrastrá el área a redactar. Al soltar te pedimos confirmación.', 'info')
  }

  const handleCrop = () => {
    if (!activeDoc) return
    setActiveTool('croparea')
    showToast('Arrastrá el área a conservar y soltá para recortar', 'info')
  }

  const handleExportExcel = async () => {
    if (!activeDoc) return
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
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
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '.pptx'),
      filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
    })
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
    // Antes bajaba el blob a la carpeta de descargas y revocaba su URL en la línea
    // siguiente al clic: la descarga podía quedarse sin leer el blob y no escribirse
    // nada, mientras el aviso decía que la página se había guardado.
    const outputPath = await window.api.saveFile({
      defaultPath: `${activeDoc.file_name.replace(/\.pdf$/i, '')}_pagina_${activeDoc.currentPage + 1}.png`,
      filters: [{ name: 'Imagen PNG', extensions: ['png'] }],
    })
    if (!outputPath) return
    try {
      const res = await apiFetch(
        `/pdf/save-page-image/${activeDoc.doc_id}/${activeDoc.currentPage}`
        + `?output_path=${encodeURIComponent(outputPath)}&zoom=2.0`,
        { method: 'POST' },
      )
      showToast(res.ok ? 'Página guardada como imagen' : 'Error al exportar imagen', res.ok ? 'success' : 'error')
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
      { name: 'pages', label: 'Páginas (vacío = todas)', type: 'text', defaultValue: '', placeholder: 'Ej. 1-5, 8' },
    ], 'Aplicar')
    if (!v) return
    const header = String(v.header).trim(), footer = String(v.footer).trim()
    // Con los dos campos vacíos no hay nada que poner: antes se llamaba igual al motor,
    // se apilaba un paso de deshacer y el aviso decía «agregado».
    if (!header && !footer) {
      showToast('Escribí al menos un encabezado o un pie', 'info')
      return
    }
    const pages = parsePagesField(String(v.pages ?? ''), activeDoc.page_count)
    if (pages === null) {
      showToast(`Rango de páginas inválido (el documento tiene ${activeDoc.page_count})`, 'error')
      return
    }
    try {
      await headerFooterUndoable(activeDoc.doc_id, header || undefined, footer || undefined, pages)
      showToast(rangoAplicado('Encabezado/pie agregado', pages), 'success')
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
    // Era la última operación que elegía la ruta ella sola: escribía
    // `<original>_compressed.pdf` al lado del original y pisaba el de la vez anterior.
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_comprimido.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!outputPath) return
    const { seguir, eraElOriginal } = await confirmarEscrituraEn(activeDoc.doc_id, outputPath)
    if (!seguir) return
    try {
      // Comprimir escribe un PDF completo: sin subir las marcas del store el archivo
      // salía sin ellas (y comprimiendo encima del original, se perdían).
      await pushAnnotations(activeDoc.doc_id)
      const res = await withProgress('Comprimiendo…', () => apiFetch(`/pdf/compress/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' }))
      if (!res.ok) { showToast('Error al comprimir', 'error'); return }
      if (eraElOriginal) await refrescarEstadoEnDisco(activeDoc.doc_id)
      const { size_before: antes, size_after: despues } = await res.json()
      // Comprimir un PDF ya optimizado puede dejarlo MÁS grande: decirlo evita que el
      // usuario se quede con la copia peor creyendo que ganó algo.
      const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`
      if (antes > 0 && despues > 0) {
        const pct = Math.round((1 - despues / antes) * 100)
        showToast(
          pct > 0
            ? `Comprimido: ${mb(antes)} → ${mb(despues)} (−${pct} %)`
            : `Sin ganancia: ${mb(antes)} → ${mb(despues)}. El PDF ya estaba optimizado.`,
          pct > 0 ? 'success' : 'info',
        )
      } else {
        showToast('PDF comprimido', 'success')
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
    try {
      const r = await correrCola(docs, async (d) => {
        try { await op(d); return true } catch (err) {
          window.api.logError(`[batch] ${String(err)}`).catch(() => {})
          return false
        }
      }, {
        avanzar: (n, d) => updateProgress(n, d.file_name),
        cancelado: isCancelRequested,
      })
      ok = r.ok
      canceled = r.cancelado
    } finally {
      endProgress()
    }
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

  // Mismo arreglo que en el de un documento (que ya decía «era la última operación que
  // elegía la ruta ella sola»): escribía `<original>_compressed.pdf` al lado de cada
  // archivo, sin preguntar y pisando el de la corrida anterior. Y no decía si había
  // ganancia: comprimir un PDF ya optimizado puede dejarlo MÁS grande.
  const handleBatchCompress = async () => {
    if (docs.length === 0) { showToast('No hay documentos abiertos', 'info'); return }
    const carpeta = await window.api.chooseFolder()
    if (!carpeta) return
    let antes = 0
    let despues = 0
    let peores = 0
    await runBatch('Comprimir', async (d) => {
      const salida = `${carpeta}\\${d.file_name.replace(/\.pdf$/i, '')}_comprimido.pdf`
      await pushAnnotations(d.doc_id)
      const res = await apiFetch(`/pdf/compress/${d.doc_id}?output_path=${encodeURIComponent(salida)}`, { method: 'POST' })
      if (!res.ok) throw new Error('compress ' + d.file_name)
      const { size_before: a, size_after: b } = await res.json()
      if (a > 0 && b > 0) {
        antes += a
        despues += b
        if (b >= a) peores++
      }
    })
    if (antes > 0 && despues > 0) {
      const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`
      const pct = Math.round((1 - despues / antes) * 100)
      showToast(
        `${mb(antes)} → ${mb(despues)} (${pct > 0 ? `−${pct} %` : 'sin ganancia'})`
        + (peores > 0 ? `. ${peores} quedaron más grandes: ya estaban optimizados.` : '')
        + ` En ${carpeta}`,
        pct > 0 ? 'success' : 'info',
      )
    }
  }

  const handleBatchWatermark = async () => {
    const v = await askForm('Marca de agua en todos los documentos', [{ name: 'text', label: 'Texto', type: 'text', defaultValue: 'CONFIDENCIAL' }], 'Aplicar a todos')
    if (!v) return
    const text = String(v.text).trim()
    if (!text) return
    await runBatch('Marca de agua', async (d) => {
      await watermarkUndoable(d.doc_id, text)
    })
  }

  // Era la última exportación que se bajaba por un `data:` URL a la carpeta de
  // Descargas: 60 planos = 60 cadenas base64 de varios MB en memoria y 60 descargas
  // silenciosas, sin decir a dónde iban. El resto de exportaciones ya escribía donde
  // el usuario elige; esta pregunta la carpeta una vez y el motor escribe cada archivo.
  const handleBatchExportWord = async () => {
    if (docs.length === 0) { showToast('No hay documentos abiertos', 'info'); return }
    const carpeta = await window.api.chooseFolder()
    if (!carpeta) return
    await runBatch('Exportar a Word', async (d) => {
      const salida = `${carpeta}\\${d.file_name.replace(/\.pdf$/i, '')}.docx`
      const res = await apiFetch(`/pdf/export-word/${d.doc_id}?output_path=${encodeURIComponent(salida)}`)
      if (!res.ok) throw new Error('word ' + d.file_name)
    })
    showToast(`Documentos exportados a ${carpeta}`, 'info')
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
      const v = await askForm('Dividir / extraer páginas', [
        { name: 'range', label: 'Rango de páginas', type: 'text', defaultValue: '', placeholder: 'Ej. 1-5, 8, 10-12' },
      ], 'Continuar')
      if (!v) return
      const input = String(v.range).trim()
      if (!input) return
      // Mismo parser que la impresión (`lib/pageRange`). El de aquí era más
      // permisivo: «1-5, 99» en un documento de 10 páginas extraía 1-5 y descartaba
      // el 99 sin decir nada — al extraer páginas, callarse lo que se ignora es peor
      // que rechazarlo.
      const rangos = parsePageRanges(input, activeDoc.page_count)
      if (!rangos) {
        showToast(`Rango inválido. Usá números entre 1 y ${activeDoc.page_count}, por ejemplo «1-5, 8»`, 'error')
        return
      }
      const set = new Set<number>()
      for (const r of rangos) for (let p = r.from; p <= r.to; p++) set.add(p)
      pages = [...set].sort((a, b) => a - b)
    }
    if (pages.length === 0) {
      showToast('No hay páginas para dividir', 'error')
      return
    }
    // Era el único diálogo de guardado sin nombre propuesto ni filtro.
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_paginas.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!outputPath) return
    try {
      // El extracto es un PDF que se manda a alguien: sin subir las marcas del store
      // salía con las páginas limpias, sin las marcas que se acaban de poner.
      await pushAnnotations(activeDoc.doc_id)
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
    const outputPath = await window.api.saveFile({
      defaultPath: activeDoc.file_name.replace(/\.pdf$/i, '_sin_clave.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!outputPath) return
    // El cuadro de guardar deja elegir el propio archivo del documento: si es el
    // original, pasa por el aviso de cambio en disco como cualquier sobrescritura.
    const { seguir, eraElOriginal } = await confirmarEscrituraEn(activeDoc.doc_id, outputPath)
    if (!seguir) return
    try {
      await pushAnnotations(activeDoc.doc_id)
      const res = await apiFetch(`/pdf/remove-password/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, { method: 'POST' })
      showToast(res.ok ? 'PDF guardado sin contraseña' : 'Error al quitar contraseña', res.ok ? 'success' : 'error')
      if (res.ok && eraElOriginal) await refrescarEstadoEnDisco(activeDoc.doc_id)
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
    // La escala va POR FILA: con láminas a distinta escala, una sola en el título sería
    // mentira — y quien lee el takeoff no tiene cómo saber con qué se midió cada cota.
    const textoEscala = (page: number) => {
      const e = scaleForPage(activeDoc, page)
      return e ? `1 ${e.unit} = ${e.pixelsPerUnit.toFixed(2)} pt` : 'sin calibrar'
    }
    const rows = [...measures]
      .sort((a, b) => a.page - b.page)
      .map((a) => ({
        page: String(a.page + 1),
        tipo: a.type === 'measure_distance' ? 'Distancia' : a.type === 'measure_perimeter' ? 'Perímetro' : 'Área',
        etiqueta: a.measurement?.label || '',
        valor: a.measurement ? a.measurement.value.toFixed(2) : '',
        unidad: a.measurement?.unit || 'px',
        escala: textoEscala(a.page),
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
      rows.push({ page: '', tipo: `Conteo (${symbol})`, etiqueta: cat, valor: String(n), unidad: 'uds', escala: '' })
    }
    const escalasUsadas = new Set(measures.map((a) => textoEscala(a.page)))
    const title = `${activeDoc.file_name} — ${
      escalasUsadas.size === 1 ? `escala: ${[...escalasUsadas][0]}`
      : escalasUsadas.size === 0 ? 'sin mediciones'
      : 'varias escalas (ver columna)'
    }`
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
      filters: [{ name: 'Marcas', extensions: ['xfdf'] }],
    })
    if (!outputPath) return
    try {
      const res = await apiFetch(`/pdf/export-xfdf/${activeDoc.doc_id}?output_path=${encodeURIComponent(outputPath)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeDoc.annotations }),
      })
      showToast(res.ok ? `${activeDoc.annotations.length} marca(s) exportadas` : 'No se pudieron exportar las marcas', res.ok ? 'success' : 'error')
    } catch (err) { toastActionError(err) }
  }

  const handleImportXfdf = async () => {
    if (!activeDoc) return
    const path = await window.api.openFile([{ name: 'Marcas', extensions: ['xfdf'] }])
    if (!path) return
    try {
      const res = await apiFetch(`/pdf/import-xfdf/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
      if (!res.ok) { showToast('No se pudieron importar las marcas', 'error'); return }
      const data = await res.json()
      const imported: Annotation[] = data.annotations || []
      if (imported.length === 0) { showToast('Ese archivo no tiene marcas compatibles', 'info'); return }
      // Un XFDF de otro documento puede traer marcas de páginas que aquí no existen:
      // se colaban invisibles y luego viajaban al PDF al guardar.
      const dentro = imported.filter((a) => a.page >= 0 && a.page < activeDoc.page_count)
      const fuera = imported.length - dentro.length
      if (dentro.length === 0) {
        showToast(`Las ${fuera} marcas del archivo son de páginas que este documento no tiene`, 'error')
        return
      }
      // Fusión por id, no append: el id de cada marca viaja en el `name` del XFDF, así
      // que reimportar el archivo (rev B y después rev C del mismo plano) actualizaba
      // lo que ya estaba en vez de apilar una copia encima. Un id repetido además
      // rompe el estado: las operaciones del store buscan por id y solo encuentran la
      // primera, así que la marca duplicada no se podía ni editar ni borrar.
      const porId = new Map(activeDoc.annotations.map((a) => [a.id, a]))
      let actualizadas = 0
      for (const a of dentro) {
        if (porId.has(a.id)) actualizadas++
        porId.set(a.id, a)
      }
      const nuevas = dentro.length - actualizadas
      const antes = activeDoc.annotations
      setAnnotations(activeDoc.doc_id, [...porId.values()])
      setDocDirty(activeDoc.doc_id, true)
      // Importar es un cambio masivo del documento: sin esto, importar el archivo
      // equivocado no se podía deshacer.
      commitAnnotationGesture(activeDoc.doc_id, antes)
      const partes = [`${nuevas} marca(s) nuevas`]
      if (actualizadas > 0) partes.push(`${actualizadas} actualizada(s)`)
      if (fuera > 0) partes.push(`${fuera} de páginas inexistentes descartada(s)`)
      showToast(partes.join(', '), fuera > 0 ? 'info' : 'success')
    } catch (err) { toastActionError(err) }
  }

  const handleImagesToPdf = async () => {
    const images = await window.api.openFiles([{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tif', 'tiff'] }])
    if (!images || images.length === 0) return
    const outputPath = await window.api.saveFile({
      defaultPath: 'imagenes.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
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
      const path = await window.api.openFile([{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }])
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
