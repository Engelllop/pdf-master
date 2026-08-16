import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

import { apiFetch } from './api'

// Caché de documentos PDF.js por `${docId}:${version}`. Una versión nueva (rotar,
// borrar página, etc.) invalida la anterior y se destruye para liberar memoria.
const MAX_DOCS = 3
// pdfjs 5+ quitó PDFDocumentProxy.destroy(): se destruye el loading task.
const docCache = new Map<string, { task: pdfjsLib.PDFDocumentLoadingTask; promise: Promise<pdfjsLib.PDFDocumentProxy> }>()

function destroyEntry(key: string): void {
  const entry = docCache.get(key)
  if (entry) {
    entry.promise.then(() => entry.task.destroy()).catch(() => {})
    docCache.delete(key)
  }
}

export function getPdfDocument(docId: string, version: number): Promise<pdfjsLib.PDFDocumentProxy> {
  const key = `${docId}:${version}`
  const existing = docCache.get(key)
  if (existing) return existing.promise

  // Invalida versiones anteriores del mismo doc
  for (const k of [...docCache.keys()]) {
    if (k.startsWith(`${docId}:`)) destroyEntry(k)
  }

  const entry = { task: null as unknown as pdfjsLib.PDFDocumentLoadingTask, promise: null as unknown as Promise<pdfjsLib.PDFDocumentProxy> }
  entry.promise = (async () => {
    const res = await apiFetch(`/pdf/raw/${docId}?v=${version}`)
    if (!res.ok) throw new Error(`404 raw ${res.status}`)
    const data = await res.arrayBuffer()
    entry.task = pdfjsLib.getDocument({ data })
    return entry.task.promise
  })()
  const promise = entry.promise
  docCache.set(key, entry)
  // Evicta el documento más antiguo si excede el tope
  if (docCache.size > MAX_DOCS) {
    const oldest = docCache.keys().next().value as string | undefined
    if (oldest) destroyEntry(oldest)
  }
  promise.catch(() => docCache.delete(key))
  return promise
}

export interface RenderedPage {
  url: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

// Renderiza una página a canvas localmente (GPU, sin round-trip a Python) y devuelve
// un blob URL con la misma forma que el antiguo PNG del backend.
export async function renderPdfPage(
  docId: string, version: number, pageIndex: number, scale: number, signal?: AbortSignal,
): Promise<RenderedPage> {
  const pdf = await getPdfDocument(docId, version)
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const page = await pdf.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale })
  const base = page.getViewport({ scale: 1 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png'),
  )
  return {
    url: URL.createObjectURL(blob),
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
  }).promise
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png'),
  )
  return { url: URL.createObjectURL(blob) }
}

export function revokePageUrl(url: string | undefined): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}
