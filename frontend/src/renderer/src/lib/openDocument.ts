import { usePdfStore } from '../store/usePdfStore'
import { askForm } from './uiPrompt'
import { touchRecent, updateRecentMeta } from './recents'

import { apiFetch, setDeadDocReopener } from './api'
import { revokePageUrl } from './blobUrl'

export interface OpenDocumentOptions {
  password?: string
  activate?: boolean // reserved; addDoc already activates the new doc
  silent?: boolean // suppress recents + toasts (used when re-opening after a backend restart)
}

// Serialize all opens through a single chain. When a tool like PDF Creator opens 60+
// plans at once, firing 60 concurrent open+annotations+outline+render bursts exhausts
// the browser's connection pool and overwhelms the single backend ("Failed to fetch",
// engine restart). Processing them one at a time keeps the app responsive.
let openChain: Promise<unknown> = Promise.resolve()

// Bulk opens (60+ plans) that fail would otherwise spam one error toast per file.
// Coalesce failures within a short window into a single toast.
let failCount = 0
let failTimer: ReturnType<typeof setTimeout> | null = null
function reportOpenFailure() {
  failCount++
  if (failTimer) clearTimeout(failTimer)
  failTimer = setTimeout(() => {
    const { showToast } = usePdfStore.getState()
    showToast(failCount === 1 ? 'No se pudo abrir el PDF' : `No se pudieron abrir ${failCount} PDFs`, 'error')
    failCount = 0
    failTimer = null
  }, 600)
}

// Reabre un documento cuyo doc_id murió (el motor se reinició pero el health-check
// nunca falló, p.ej. otro proceso lo reemplazó) y remapea el id conservando el
// estado local. Se dispara al detectar un 404 en page-info/page-image.
const reopening = new Set<string>()
export async function reopenDeadDoc(docId: string): Promise<string | null> {
  const { docs, remapDocId } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc || reopening.has(docId)) return null
  reopening.add(docId)
  try {
    const res = await apiFetch(`/pdf/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: doc.file_path }),
    })
    if (!res.ok) return null
    const data = await res.json()
    remapDocId(docId, data.doc_id)
    return data.doc_id
  } catch {
    return null
  } finally {
    reopening.delete(docId)
  }
}

// Con esto, cualquier llamada que reciba 404 por un doc_id muerto se repara sola
// (antes solo se recuperaban el render de página y las imágenes).
setDeadDocReopener(reopenDeadDoc)

// Miniatura de la 1ª página para el menú de recientes: se rasteriza en local con
// PDF.js y se encoge a JPEG ~5 KB para no agotar la cuota de localStorage (en
// localStorage tiene que ser data-URL: un blob: no sobrevive al cierre de la app).
async function captureRecentThumb(filePath: string, docId: string) {
  let blobUrl: string | null = null
  try {
    // Import diferido a propósito: `lib/pdfjs` arrastra pdfjs-dist (y su worker), y
    // este módulo lo importa media app. Con el import estático, cualquier test que
    // tocara openDocument cargaba pdfjs y moría con «DOMMatrix is not defined».
    const { renderPdfThumbnail } = await import('./pdfjs')
    const thumb = await renderPdfThumbnail(docId, 0, 0)
    blobUrl = thumb.url
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('thumb load'))
      img.src = thumb.url
    })
    const w = 96
    const h = Math.max(1, Math.round((img.height / img.width) * w))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    updateRecentMeta(filePath, { thumb: canvas.toDataURL('image/jpeg', 0.72) })
  } catch {} finally {
    revokePageUrl(blobUrl ?? undefined)
  }
}

export function openDocument(filePath: string, opts: OpenDocumentOptions = {}): Promise<string | null> {
  const run = () => openDocumentImpl(filePath, opts)
  const result = openChain.then(run, run)
  openChain = result.catch(() => {})
  return result
}

/**
 * Single entry point for opening a PDF. Every caller (toolbar button, drag & drop,
 * file association, recent files, backend-restart recovery) goes through here so that
 * annotations, outline and the recents list stay consistent.
 * Returns the new doc_id, or null on failure / cancelled password prompt.
 */
async function openDocumentImpl(filePath: string, opts: OpenDocumentOptions): Promise<string | null> {
  const { addDoc, setAnnotations, setOutline, showToast } = usePdfStore.getState()
  // Ya abierto: activar su pestaña en vez de duplicarla. En modo silent (recovery
  // tras reinicio del motor) sí se reabre, porque el doc_id viejo está muerto.
  if (!opts.silent) {
    const { docs, setActiveDoc } = usePdfStore.getState()
    const existing = docs.find((d) => d.file_path === filePath)
    if (existing) {
      if (opts.activate !== false) setActiveDoc(existing.doc_id)
      touchRecent(filePath)
      return existing.doc_id
    }
  }
  try {
    const res = await apiFetch(`/pdf/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, password: opts.password }),
    })

    if (res.status === 401) {
      const v = await askForm('PDF protegido', [{ name: 'pwd', label: 'Este PDF requiere contraseña', type: 'password', defaultValue: '' }], 'Abrir')
      const pwd = v ? String(v.pwd) : ''
      if (pwd) return openDocumentImpl(filePath, { ...opts, password: pwd })
      showToast('Se requiere contraseña para abrir el PDF', 'error')
      return null
    }
    if (!res.ok) throw new Error('Error abriendo PDF')

    const data = await res.json()
    const docId = addDoc(data, opts.activate !== false)

    // Load persisted annotations + outline (best-effort, non-blocking failures)
    try {
      const annRes = await apiFetch(`/pdf/annotations/${docId}`)
      if (annRes.ok) {
        const annData = await annRes.json()
        setAnnotations(docId, annData.annotations || [])
      }
    } catch {}
    try {
      const outlineRes = await apiFetch(`/pdf/outline/${docId}`)
      if (outlineRes.ok) {
        const outlineData = await outlineRes.json()
        setOutline(docId, outlineData || [])
      }
    } catch {}

    // Estado del archivo en disco al abrirlo: si alguien más lo toca mientras está
    // abierto, el guardado lo detecta y pregunta antes de sobrescribir.
    try {
      const st = await apiFetch(`/pdf/disk-state/${docId}`)
      if (st.ok) {
        const estado = await st.json()
        if (!estado.missing) usePdfStore.getState().setDiskState(docId, { mtime: estado.mtime, size: estado.size })
      }
    } catch { /* sin estado: el guardado no podrá comparar y seguirá como antes */ }

    // Sellos (y adjuntos, sonidos…) que están en el PDF y la app no gestiona: no los
    // dibuja el bitmap —se rasteriza sin anotaciones— ni la capa de marcas, así que sin
    // avisar el usuario trabajaría sin ver un «APROBADO» o un «NO APTO PARA
    // CONSTRUCCIÓN» que sí está en el archivo y sí sale impreso.
    if (!opts.silent && data.unmanaged_annots > 0) {
      const n = data.unmanaged_annots
      showToast(
        `Este PDF trae ${n} sello(s) o adjunto(s) que la app no muestra ni modifica: siguen en el archivo y salen al imprimir.`,
        'info',
      )
    }

    if (!opts.silent) {
      touchRecent(filePath)
      updateRecentMeta(filePath, { pageCount: data.page_count })
      captureRecentThumb(filePath, docId)
    }
    return docId
  } catch {
    if (!opts.silent) reportOpenFailure()
    return null
  }
}
