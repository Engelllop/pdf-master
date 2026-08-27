import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

import { apiFetch } from './api'

// Caché de documentos PDF.js por `${docId}:${version}`. Una versión nueva (rotar,
// borrar página, etc.) invalida la anterior y se destruye para liberar memoria.
const MAX_DOCS = 3

interface DocEntry {
  task: pdfjsLib.PDFDocumentLoadingTask | null
  promise: Promise<pdfjsLib.PDFDocumentProxy>
  destroyed: boolean
}

// pdfjs 5+ quitó PDFDocumentProxy.destroy(): se destruye el loading task.
const docCache = new Map<string, DocEntry>()

function destroyEntry(key: string): void {
  const entry = docCache.get(key)
  if (!entry) return
  docCache.delete(key)
  entry.destroyed = true
  // Si el task ya existe se destruye aquí. Si el `/pdf/raw` sigue en vuelo no hay nada
  // que destruir todavía: la bandera hace que el propio cargador lo destruya en cuanto
  // lo cree (antes se colgaba un `.then` del promise, que nunca corría si el parseo
  // fallaba — el task quedaba vivo con su worker para siempre).
  if (entry.task) entry.task.destroy().catch(() => {})
}

export function getPdfDocument(docId: string, version: number): Promise<pdfjsLib.PDFDocumentProxy> {
  const key = `${docId}:${version}`
  const existing = docCache.get(key)
  if (existing) {
    // Reinserta para que el Map quede en orden de USO, no de inserción: con MAX_DOCS 3
    // y 4+ pestañas, volver a una vieja evictaba justo la que se acababa de pedir y
    // había que redescargar y reparsear su ArrayBuffer entero.
    docCache.delete(key)
    docCache.set(key, existing)
    return existing.promise
  }

  // Invalida versiones anteriores del mismo doc
  for (const k of [...docCache.keys()]) {
    if (k.startsWith(`${docId}:`)) destroyEntry(k)
  }

  const entry: DocEntry = { task: null, promise: null as unknown as Promise<pdfjsLib.PDFDocumentProxy>, destroyed: false }
  entry.promise = (async () => {
    const res = await apiFetch(`/pdf/raw/${docId}?v=${version}`)
    if (!res.ok) throw new Error(`HTTP ${res.status} en /pdf/raw`)
    const data = await res.arrayBuffer()
    const task = pdfjsLib.getDocument({ data })
    if (entry.destroyed) {
      task.destroy().catch(() => {})
      throw new DOMException('documento descartado', 'AbortError')
    }
    entry.task = task
    return task.promise
  })()
  const promise = entry.promise
  docCache.set(key, entry)
  // Evicta el documento menos usado si excede el tope
  if (docCache.size > MAX_DOCS) {
    const oldest = docCache.keys().next().value as string | undefined
    if (oldest) destroyEntry(oldest)
  }
  // Identidad: si el promise falla DESPUÉS de que esta clave se reemplazara por una
  // entrada nueva, borrarla por clave tiraba la entrada fresca y sana.
  promise.catch(() => {
    if (docCache.get(key) === entry) docCache.delete(key)
  })
  return promise
}

async function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png'),
  )
  return URL.createObjectURL(blob)
}

export interface RenderedPage {
  url: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

// Tope de rasterizado de la página base. Un plano de 3024 pt a zoom 4 daría un canvas
// de 12 000 px de lado (cientos de MB en RAM, y se rasterizan también las vecinas por
// el preload). La nitidez en zoom profundo la cubre `DetailTile`, que rasteriza solo
// el rectángulo visible, así que topar el lado largo aquí no se ve en pantalla.
const MAX_RENDER_PX = 6000

function cappedScale(baseWidth: number, baseHeight: number, scale: number): number {
  const longest = Math.max(baseWidth, baseHeight)
  return longest * scale > MAX_RENDER_PX ? MAX_RENDER_PX / longest : scale
}

// Renderiza una página a canvas localmente (GPU, sin round-trip a Python) y devuelve
// un blob URL con la misma forma que el antiguo PNG del backend.
export async function renderPdfPage(
  docId: string, version: number, pageIndex: number, scale: number, signal?: AbortSignal,
): Promise<RenderedPage> {
  const pdf = await getPdfDocument(docId, version)
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const page = await pdf.getPage(pageIndex + 1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: cappedScale(base.width, base.height, scale) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  // 0 = AnnotationMode.DISABLE: las marcas nativas las pinta el overlay editable.
  await page.render({ canvas, viewport, annotationMode: 0 }).promise
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return {
    url: await canvasToBlobUrl(canvas),
    width: canvas.width,
    height: canvas.height,
    originalWidth: base.width,
    originalHeight: base.height,
  }
}

// Miniatura del panel de páginas. Antes venía del motor (`/pdf/thumbnail`, PNG en
// base64): un round-trip por página que además tomaba el único lock de MuPDF, así que
// hojear el panel de un plano de 300 páginas bloqueaba guardar, medir o buscar.
// Aquí se rasteriza con el documento PDF.js que el visor ya tiene parseado.
const THUMB_LONG_SIDE_PX = 300

export async function renderPdfThumbnail(
  docId: string, version: number, pageIndex: number, signal?: AbortSignal,
): Promise<RenderedPage> {
  const pdf = await getPdfDocument(docId, version)
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const page = await pdf.getPage(pageIndex + 1)
  const base = page.getViewport({ scale: 1 })
  const longest = Math.max(base.width, base.height)
  const viewport = page.getViewport({ scale: THUMB_LONG_SIDE_PX / longest })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  // annotationMode 0 igual que el motor, que pintaba con annots=False.
  await page.render({ canvas, viewport, annotationMode: 0 }).promise
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return {
    url: await canvasToBlobUrl(canvas),
    width: canvas.width,
    height: canvas.height,
    originalWidth: base.width,
    originalHeight: base.height,
  }
}

// Renderiza solo un sub-rectángulo (en puntos PDF, origen arriba-izquierda) a la
// escala objetivo — deep-zoom nítido sin rasterizar la página entera.
export async function renderPdfTile(
  docId: string, version: number, pageIndex: number,
  x0: number, y0: number, x1: number, y1: number, scale: number, signal?: AbortSignal,
): Promise<{ url: string }> {
  const pdf = await getPdfDocument(docId, version)
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const page = await pdf.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((x1 - x0) * scale))
  canvas.height = Math.max(1, Math.ceil((y1 - y0) * scale))
  await page.render({
    canvas, viewport,
    transform: [1, 0, 0, 1, -x0 * scale, -y0 * scale],
    annotationMode: 0,
  }).promise
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return { url: await canvasToBlobUrl(canvas) }
}

export { revokePageUrl } from './blobUrl'

// 404 al pedir el PDF crudo = el motor se reinició y el doc_id murió (el health-check
// sí responde, porque el motor nuevo está sano). Quien renderice debe reabrir el
// documento en vez de mostrar una página en blanco.
export function isDeadDocError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('HTTP 404 ')
}
