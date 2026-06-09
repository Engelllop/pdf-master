import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'
const MAX_RENDER_ZOOM = 3

// Render the page bitmap close to the resolution it is actually shown at, so high
// zoom levels stay crisp instead of upscaling a fixed 1.5x bitmap with CSS.
function dpr(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
}
function baseRenderZoom(): number {
  return Math.min(MAX_RENDER_ZOOM, Math.max(1.5, 1.5 * dpr()))
}
function desiredRenderZoom(userZoom: number): number {
  return Math.min(MAX_RENDER_ZOOM, Math.max(1, Math.ceil(userZoom * dpr() * 2) / 2))
}

// Page bitmaps are served as binary PNG over a URL (not base64): huge architectural
// plans produce multi-MB images that fail to render as data: URLs and waste memory.
function pageImageUrl(docId: string, page: number, rz: number, version: number): string {
  return `${API_BASE}/pdf/page-image/${docId}/${page}?zoom=${rz}&v=${version}`
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

export function usePageLoader() {
  const store = usePdfStore()
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
    const rz = baseRenderZoom()
    const controller = new AbortController()
    const signal = controller.signal

    const fetchEntry = (p: number): Promise<PageData> =>
      fetch(`${API_BASE}/pdf/page-info/${docId}/${p}?zoom=${rz}`, { signal })
        .then((res) => res.json())
        .then((data) => ({
          image: pageImageUrl(docId, p, rz, version),
          width: data.width,
          height: data.height,
          originalWidth: data.original_width,
          originalHeight: data.original_height,
        }))

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

    // Load page text for text selection overlay
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

    // Preload adjacent pages in background (non-blocking): warm the cache + the browser image cache
    const preloadPage = (p: number) => {
      if (!activeDoc || p < 0 || p >= activeDoc.page_count) return
      if (getCachedPage(docId, p)) return
      fetchEntry(p)
        .then((entry) => {
          cachePage(docId, p, entry)
          const im = new Image()
          im.src = entry.image
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

  // Upgrade page resolution when the user zooms in beyond the current bitmap (debounced).
  const lastUpgradeRef = useRef<{ key: string; rz: number }>({ key: '', rz: 0 })
  useEffect(() => {
    if (!activeDoc || !pageData) return
    const docId = activeDoc.doc_id
    const version = activeDoc.docVersion
    const page = activeDoc.currentPage
    const desired = desiredRenderZoom(activeDoc.zoom)
    const current = pageData.originalWidth > 0 ? pageData.width / pageData.originalWidth : 0
    const key = `${docId}:${page}`
    if (desired <= current + 0.01) return
    if (lastUpgradeRef.current.key === key && lastUpgradeRef.current.rz >= desired) return

    const controller = new AbortController()
    const t = setTimeout(() => {
      lastUpgradeRef.current = { key, rz: desired }
      fetch(`${API_BASE}/pdf/page-info/${docId}/${page}?zoom=${desired}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          const entry: PageData = {
            image: pageImageUrl(docId, page, desired, version),
            width: data.width,
            height: data.height,
            originalWidth: data.original_width,
            originalHeight: data.original_height,
          }
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
