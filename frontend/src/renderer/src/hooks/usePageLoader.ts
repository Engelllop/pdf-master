import { useEffect, useRef, useState } from 'react'
import { reopenDeadDoc } from '../lib/openDocument'
import { useStoreSlice } from './useStoreSlice'
import type { PdfDoc } from '../store/usePdfStore'
import { revokePageUrl } from '../lib/blobUrl'
import { renderPdfPage, isDeadDocError } from '../lib/pdfjs'

import { apiFetch } from '../lib/api'
const MAX_RENDER_ZOOM = 4
const MIN_RENDER_ZOOM = 0.5

function dpr(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
}
// Rasteriza a la resolución real a la que se muestra (zoom de display × dpr),
// cuantizada a pasos de 0.5 para reusar bitmaps entre cambios pequeños. Antes se
// rasterizaba a una escala fija (1.5×) y el navegador encogía ese bitmap gigante
// hasta el tamaño "fit" → las líneas de 1px de los planos se difuminaban. Renderizar
// al tamaño de display deja que PDF.js dibuje cada línea vectorialmente y nítida.
function renderZoomFor(userZoom: number): number {
  const q = Math.ceil(userZoom * dpr() * 2) / 2
  return Math.min(MAX_RENDER_ZOOM, Math.max(MIN_RENDER_ZOOM, q))
}

export interface PageData {
  image: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

export interface TextBlock {
  x: number
  y: number
  width: number
  height: number
  text: string
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}

/** Reajusta la resolución del bitmap para que coincida con el zoom actual, en AMBAS
 * direcciones (al acercar sube; al alejar baja para no encoger un bitmap enorme).
 *
 * Se usa para los DOS paneles. Antes solo lo tenía el izquierdo: en vista doble el
 * efecto de carga no vuelve a correr al cambiar el zoom, así que la lámina de la
 * derecha se quedaba con el bitmap del zoom anterior — se acercaba a mirar un detalle
 * y la mitad derecha seguía borrosa hasta cambiar de página. */
function useZoomUpgrade(
  doc: PdfDoc | undefined,
  offset: number,
  data: PageData | null,
  setData: (d: PageData) => void,
  cachePage: (docId: string, page: number, entry: PageData) => void,
  activo: boolean,
): void {
  const ultimo = useRef<{ key: string; rz: number }>({ key: '', rz: 0 })
  useEffect(() => {
    if (!activo || !doc || !data) return
    const docId = doc.doc_id
    const version = doc.docVersion
    const page = doc.currentPage + offset
    if (page >= doc.page_count) return
    const desired = renderZoomFor(doc.zoom)
    const current = data.originalWidth > 0 ? data.width / data.originalWidth : 0
    const key = `${docId}:${page}`
    if (Math.abs(desired - current) < 0.5) return
    if (ultimo.current.key === key && Math.abs(ultimo.current.rz - desired) < 0.01) return

    const controller = new AbortController()
    const t = setTimeout(() => {
      ultimo.current = { key, rz: desired }
      renderPdfPage(docId, version, page, desired, controller.signal)
        .then((r) => {
          const entry: PageData = {
            image: r.url, width: r.width, height: r.height,
            originalWidth: r.originalWidth, originalHeight: r.originalHeight,
          }
          cachePage(docId, page, entry)
          setData(entry)
        })
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
  }, [doc?.zoom, doc?.currentPage, doc?.doc_id, data?.width, activo])
}

export function usePageLoader() {
  const store = useStoreSlice(
    'docs', 'activeDocId', 'getCachedPage', 'cachePage', 'setPage', 'computeFitZoom',
    'viewerWidth', 'viewerHeight', 'setDocLoading', 'setZoom', 'viewMode',
  )
  const { docs, activeDocId, getCachedPage, cachePage, setPage, computeFitZoom, viewerWidth, viewerHeight } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const [loading, setLoading] = useState(false)
  const [pageData, setPageData] = useState<PageData | null>(null)
  const [loadingRight, setLoadingRight] = useState(false)
  const [pageDataRight, setPageDataRight] = useState<PageData | null>(null)
  const [pageText, setPageText] = useState<TextBlock[]>([])
  const [searchHighlight, setSearchHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Recompute fit zoom when viewer size or panels change
  useEffect(() => {
    if (!activeDoc || activeDoc.fitMode === 'custom') return
    if (!viewerWidth || !viewerHeight) return // viewer aún no medido: no calcular un fit espurio
    const newZoom = computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, activeDoc.fitMode, viewerWidth, viewerHeight)
    if (Math.abs(newZoom - activeDoc.zoom) > 0.01) {
      store.setZoom(activeDoc.doc_id, newZoom, false) // preservar fitMode para que siga reajustándose
    }
  }, [viewerWidth, viewerHeight, activeDoc?.fitMode, activeDoc?.doc_id, activeDoc?.currentPage])

  // Load/render page — when page or doc changes. In-flight requests are aborted on change.
  useEffect(() => {
    if (!activeDoc) {
      setPageData(null)
      setPageDataRight(null)
      setPageText([])
      setSearchHighlight(null)
      return
    }
    const docId = activeDoc.doc_id
    const version = activeDoc.docVersion
    const page = activeDoc.currentPage
    const rz = renderZoomFor(activeDoc.zoom)
    const controller = new AbortController()
    const signal = controller.signal

    // Render local con PDF.js (sin round-trip a Python).
    const fetchEntry = (p: number, zoomOverride?: number): Promise<PageData> =>
      renderPdfPage(docId, version, p, zoomOverride ?? rz, signal).then((r) => ({
        image: r.url, width: r.width, height: r.height,
        originalWidth: r.originalWidth, originalHeight: r.originalHeight,
      })).catch((err) => {
        if (isDeadDocError(err)) {
          // El motor se reinició: reabrir y remapear; al cambiar el doc_id este
          // efecto se vuelve a ejecutar con el id nuevo.
          reopenDeadDoc(docId)
        }
        throw err
      })

    const cached = getCachedPage(docId, page)
    if (cached) {
      setPageData(cached)
    } else {
      setPageData(null) // drop the previous doc/page bitmap so it isn't shown while loading
      setLoading(true)
      store.setDocLoading(docId)
      setSearchHighlight(null)
      fetchEntry(page)
        .then((entry) => {
          cachePage(docId, page, entry)
          setPageData(entry)
        })
        .catch((err) => { if (!isAbort(err)) console.error('Error rendering page:', err) })
        .finally(() => { if (!signal.aborted) { setLoading(false); store.setDocLoading(null) } })
    }

    // Load right page in double view mode
    const rightPage = page + 1
    if (store.viewMode === 'double' && rightPage < activeDoc.page_count) {
      const cachedRight = getCachedPage(docId, rightPage)
      if (cachedRight) {
        setPageDataRight(cachedRight)
      } else {
        setPageDataRight(null)
        setLoadingRight(true)
        fetchEntry(rightPage)
          .then((entry) => {
            cachePage(docId, rightPage, entry)
            setPageDataRight(entry)
          })
          .catch((err) => { if (!isAbort(err)) console.error('Error rendering right page:', err) })
          .finally(() => { if (!signal.aborted) setLoadingRight(false) })
      }
    } else {
      setPageDataRight(null)
    }

    // Load page text for text selection overlay (sigue viniendo del backend)
    apiFetch(`/pdf/text/${docId}/${page}`, { signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.blocks) setPageText(data.blocks) })
      .catch(() => {})

    // Preload adjacent pages in background (non-blocking): warm the page cache.
    // A resolución moderada: en zoom profundo cada bitmap pesa cientos de MB y el
    // usuario no está pasando páginas; si llega a una, el efecto de upgrade la sube.
    const preloadZoom = Math.min(rz, 1.5)
    const preloadPage = (p: number) => {
      if (!activeDoc || p < 0 || p >= activeDoc.page_count) return
      // En vista doble, `page + 1` ES el panel derecho: se estaba rasterizando dos
      // veces la misma página (una de verdad y otra como «preload») y las dos
      // carreras se pisaban en la misma entrada del cache.
      if (store.viewMode === 'double' && p === rightPage) return
      if (getCachedPage(docId, p)) return
      fetchEntry(p, preloadZoom)
        .then((entry) => {
          // El preload no pisa lo que ya hay: si mientras rasterizaba a baja resolución
          // la página se rasterizó de verdad, `cachePage` revocaría el blob que se está
          // MOSTRANDO y el visor se quedaba en blanco. El bitmap de más se descarta —y
          // se libera, que borrar la referencia no libera los MB del blob.
          if (getCachedPage(docId, p)) { revokePageUrl(entry.image); return }
          cachePage(docId, p, entry)
        })
        .catch(() => {})
    }
    preloadPage(page - 1)
    preloadPage(page + 1)
    if (store.viewMode === 'double') {
      preloadPage(page + 2)
    }

    return () => { controller.abort() }
  }, [activeDoc?.doc_id, activeDoc?.currentPage, store.viewMode, activeDoc?.docVersion])

  useZoomUpgrade(activeDoc, 0, pageData, setPageData, cachePage, true)
  useZoomUpgrade(activeDoc, 1, pageDataRight, setPageDataRight, cachePage, store.viewMode === 'double')

  // Search highlight
  useEffect(() => {
    if (!activeDoc || activeDoc.searchIndex < 0 || !activeDoc.searchResults.length) {
      setSearchHighlight(null)
      return
    }
    const result = activeDoc.searchResults[activeDoc.searchIndex]
    if (result.page !== activeDoc.currentPage) {
      setPage(activeDoc.doc_id, result.page)
      return
    }
    if (pageData) {
      const scaleX = pageData.width / pageData.originalWidth
      const scaleY = pageData.height / pageData.originalHeight
      setSearchHighlight({
        x: result.x * scaleX,
        y: result.y * scaleY,
        w: result.width * scaleX,
        h: result.height * scaleY,
      })
    }
  }, [activeDoc?.searchIndex, activeDoc?.searchResults, pageData?.width, activeDoc?.currentPage])

  return {
    activeDoc,
    loading,
    pageData,
    loadingRight,
    pageDataRight,
    pageText,
    searchHighlight,
  }
}
