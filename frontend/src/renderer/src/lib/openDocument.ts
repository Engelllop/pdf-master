import { usePdfStore } from '../store/usePdfStore'
import { askForm } from './uiPrompt'
import { loadRecents, removeRecent, touchRecent, updateRecentMeta } from './recents'
import { mismaRuta } from './rutas'

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
let failMissing = 0
let failMotivo: string | null = null
let failTimer: ReturnType<typeof setTimeout> | null = null
function reportOpenFailure(motivo?: string, faltaba = false) {
  failCount++
  if (faltaba) failMissing++
  // Con un solo fallo se dice el motivo; con muchos, cuántos —y si TODOS fueron
  // archivos que ya no están, eso es lo útil: se movió la carpeta, no falla la app.
  if (motivo && !failMotivo) failMotivo = motivo
  if (failTimer) clearTimeout(failTimer)
  failTimer = setTimeout(() => {
    const { showToast } = usePdfStore.getState()
    showToast(mensajeDeFallos(failCount, failMissing, failMotivo), 'error')
    failCount = 0
    failMissing = 0
    failMotivo = null
    failTimer = null
  }, 600)
}

/** Aviso para una tanda de aperturas fallidas. Exportado para poder fijar los textos:
 * un lote de 60 planos no puede sacar 60 avisos, y «No se pudo abrir el PDF» cuando el
 * archivo simplemente ya no está manda a buscar un problema que no existe. */
export function mensajeDeFallos(total: number, faltantes: number, motivo: string | null): string {
  if (total === 1) return motivo || 'No se pudo abrir el PDF'
  if (faltantes === total) return `No se encontraron ${total} PDFs: ¿movidos o borrados?`
  if (faltantes > 0) return `No se pudieron abrir ${total} PDFs (${faltantes} ya no están en su carpeta)`
  return `No se pudieron abrir ${total} PDFs`
}

/** Motivo de un 4xx del motor, en el idioma del usuario. El motor ya explica por qué
 * (`detail`) y la app lo tiraba a la basura para decir siempre lo mismo. */
export function motivoDeApertura(nombre: string, status: number, detalle: string): string {
  if (status === 422 && /no existe/i.test(detalle)) {
    return `«${nombre}» ya no está en esa carpeta: ¿la moviste o la borraste?`
  }
  if (status === 422 || status === 413) return detalle || `No se pudo abrir «${nombre}»`
  // El motor rechaza el token: casi siempre es otro pdf-engine (otra instalación, o
  // uno que quedó vivo) ocupando el 8745, así que la app le está hablando a un motor
  // que no es el suyo. Sin este caso salía "No se pudo abrir" a secas y no había por
  // dónde empezar.
  if (status === 403) {
    return `El motor rechazó la app: hay otro PDF Master usando el puerto 8745. Cerrá el otro y reintentá.`
  }
  return `No se pudo abrir «${nombre}»`
}

async function detalleDeError(res: Response): Promise<string> {
  try {
    const cuerpo = await res.json()
    return typeof cuerpo?.detail === 'string' ? cuerpo.detail : ''
  } catch {
    return ''
  }
}

/** Un reciente que ya no existe es ruido en la lista y vuelve a fallar cada vez que se
 * pincha. Las FIJADAS se respetan: el usuario las puso ahí a propósito y puede que el
 * archivo vuelva (un disco de red, una carpeta sincronizada que aún no bajó). */
function olvidarRecienteQueYaNoEsta(filePath: string): void {
  const entrada = loadRecents().find((e) => mismaRuta(e.path, filePath))
  if (entrada && !entrada.pinned) removeRecent(filePath)
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
    // Por archivo, no por cadena: la ruta llega con formatos distintos según venga del
    // cuadro de abrir, de recientes, de arrastrar y soltar o de la sesión guardada, y
    // comparándolas se abría una SEGUNDA pestaña del mismo PDF — cada una con su lista
    // de marcas, y guardar desde una descartaba las de la otra (el aviso de «está
    // abierto en otra pestaña» saltaba por un estado que la propia app había creado).
    const existing = docs.find((d) => mismaRuta(d.file_path, filePath))
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
    if (!res.ok) {
      const detalle = await detalleDeError(res)
      const yaNoEsta = res.status === 422 && /no existe/i.test(detalle)
      if (yaNoEsta) olvidarRecienteQueYaNoEsta(filePath)
      const nombre = filePath.split(/[\\/]/).pop() || filePath
      if (!opts.silent) reportOpenFailure(motivoDeApertura(nombre, res.status, detalle), yaNoEsta)
      return null
    }

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
