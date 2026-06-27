import { useEffect, useRef, useState } from 'react'
import { reopenDeadDoc } from '../lib/openDocument'
import { useStoreSlice } from './useStoreSlice'
import { renderPdfPage, revokePageUrl } from '../lib/pdfjs'

import { API_BASE } from '../lib/api'
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
function isDeadDoc(err: unknown): boolean {
  return err instanceof Error && err.message.includes('404')
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
  const [pageTextRight, setPageTextRight] = useState<TextBlock[]>([])
  const [searchHighlight, setSearchHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Recompute fit zoom when viewer size or panels change
  useEffect(() => {
    if (!activeDoc || activeDoc.fitMode === 'custom') return
    const newZoom = computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, activeDoc.fitMode, viewerWidth, viewerHeight)
    if (Math.abs(newZoom - activeDoc.zoom) > 0.01) {
      store.setZoom(activeDoc.doc_id, newZoom)
    }
  }, [viewerWidth, viewerHeight, activeDoc?.fitMode, activeDoc?.doc_id, activeDoc?.currentPage])

  // Load/render page — when page or doc changes. In-flight requests are aborted on change.
  useEffect(() => {
    if (!activeDoc) {
      setPageData(null)
      setPageDataRight(null)
      setPageText([])
      setPageTextRight([])
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
    const fetchEntry = (p: number): Promise<PageData> =>
      renderPdfPage(docId, version, p, rz, signal).then((r) => ({
        image: r.url, width: r.width, height: r.height,
        originalWidth: r.originalWidth, originalHeight: r.originalHeight,
      })).catch((err) => {
        if (isDeadDoc(err)) {
          // El motor se reinició: reabrir y remapear; al cambiar el doc_id este
          // efecto se vuelve a ejecutar con el id nuevo.
          reopenDeadDoc(docId)
        }
        throw err
      })

    // Reemplaza el bitmap cacheado de una página revocando el blob anterior.
    const replaceCache = (p: number, entry: PageData) => {
      const old = getCachedPage(docId, p)
      if (old && old.image !== entry.image) revokePageUrl(old.image)
      cachePage(docId, p, entry)
    }

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
          replaceCache(page, entry)
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
            replaceCache(rightPage, entry)
            setPageDataRight(entry)
          })
          .catch((err) => { if (!isAbort(err)) console.error('Error rendering right page:', err) })
          .finally(() => { if (!signal.aborted) setLoadingRight(false) })
      }
    } else {
      setPageDataRight(null)
    }

    // Load page text for text selection overlay (sigue viniendo del backend)
    fetch(`${API_BASE}/pdf/text/${docId}/${page}`, { signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.blocks) setPageText(data.blocks) })
      .catch(() => {})

    if (store.viewMode === 'double' && rightPage < activeDoc.page_count) {
      fetch(`${API_BASE}/pdf/text/${docId}/${rightPage}`, { signal })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data?.blocks) setPageTextRight(data.blocks) })
        .catch(() => {})
    } else {
      setPageTextRight([])
    }

    // Preload adjacent pages in background (non-blocking): warm the page cache
    const preloadPage = (p: number) => {
      if (!activeDoc || p < 0 || p >= activeDoc.page_count) return
      if (getCachedPage(docId, p)) return
      fetchEntry(p)
        .then((entry) => replaceCache(p, entry))
        .catch(() => {})
    }
    preloadPage(page - 1)
    preloadPage(page + 1)
    if (store.viewMode === 'double') {
      preloadPage(page + 2)
    }

    return () => { controller.abort() }
  }, [activeDoc?.doc_id, activeDoc?.currentPage, store.viewMode, activeDoc?.docVersion])

  // Reajusta la resolución del bitmap para que coincida con el zoom actual, en AMBAS
  // direcciones (al acercar sube; al alejar baja para no encoger un bitmap enorme).
  const lastUpgradeRef = useRef<{ key: string; rz: number }>({ key: '', rz: 0 })
  useEffect(() => {
    if (!activeDoc || !pageData) return
    const docId = activeDoc.doc_id
    const version = activeDoc.docVersion
    const page = activeDoc.currentPage
    const desired = renderZoomFor(activeDoc.zoom)
    const current = pageData.originalWidth > 0 ? pageData.width / pageData.originalWidth : 0
    const key = `${docId}:${page}`
    if (Math.abs(desired - current) < 0.5) return
    if (lastUpgradeRef.current.key === key && Math.abs(lastUpgradeRef.current.rz - desired) < 0.01) return

    const controller = new AbortController()
    const t = setTimeout(() => {
      lastUpgradeRef.current = { key, rz: desired }
      renderPdfPage(docId, version, page, desired, controller.signal)
        .then((r) => {
          const entry: PageData = {
            image: r.url, width: r.width, height: r.height,
            originalWidth: r.originalWidth, originalHeight: r.originalHeight,
          }
          const old = getCachedPage(docId, page)
          if (old && old.image !== entry.image) revokePageUrl(old.image)
          cachePage(docId, page, entry)
          setPageData(entry)
        })
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
  }, [activeDoc?.zoom, activeDoc?.currentPage, activeDoc?.doc_id, pageData?.width])

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
    pageTextRight,
    searchHighlight,
  }
}
