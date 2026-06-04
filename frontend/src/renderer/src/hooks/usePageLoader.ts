import { useEffect, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'
const BASE_RENDER_ZOOM = 1.5

export interface PageData {
  image: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

export function usePageLoader() {
  const store = usePdfStore()
  const { docs, activeDocId, getCachedPage, cachePage, setPage, computeFitZoom, viewerWidth, viewerHeight } = store

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const [loading, setLoading] = useState(false)
  const [pageData, setPageData] = useState<PageData | null>(null)
  const [loadingRight, setLoadingRight] = useState(false)
  const [pageDataRight, setPageDataRight] = useState<PageData | null>(null)
  const [searchHighlight, setSearchHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Recompute fit zoom when viewer size or panels change
  useEffect(() => {
    if (!activeDoc || activeDoc.fitMode === 'custom') return
    const newZoom = computeFitZoom(activeDoc.doc_id, activeDoc.currentPage, activeDoc.fitMode, viewerWidth, viewerHeight)
    if (Math.abs(newZoom - activeDoc.zoom) > 0.01) {
      store.setZoom(activeDoc.doc_id, newZoom)
    }
  }, [viewerWidth, viewerHeight, activeDoc?.fitMode, activeDoc?.doc_id, activeDoc?.currentPage])

  // Load/render page — ONLY when page or doc changes, never on zoom changes
  useEffect(() => {
    if (!activeDoc) {
      setPageData(null)
      setPageDataRight(null)
      setSearchHighlight(null)
      return
    }
    const page = activeDoc.currentPage

    const cached = getCachedPage(activeDoc.doc_id, page)
    if (cached) {
      setPageData(cached)
    }

    let cancelled = false
    if (!cached) {
      setLoading(true)
      setSearchHighlight(null)
      fetch(`${API_BASE}/pdf/page/${activeDoc.doc_id}/${page}?zoom=${BASE_RENDER_ZOOM}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          const entry: PageData = {
            image: data.image_base64,
            width: data.width,
            height: data.height,
            originalWidth: data.original_width,
            originalHeight: data.original_height,
          }
          cachePage(activeDoc.doc_id, page, entry)
          setPageData(entry)
        })
        .catch((err) => console.error('Error rendering page:', err))
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    // Load right page in double view mode
    const rightPage = page + 1
    if (store.viewMode === 'double' && rightPage < activeDoc.page_count) {
      const cachedRight = getCachedPage(activeDoc.doc_id, rightPage)
      if (cachedRight) {
        setPageDataRight(cachedRight)
      } else {
        setLoadingRight(true)
        fetch(`${API_BASE}/pdf/page/${activeDoc.doc_id}/${rightPage}?zoom=${BASE_RENDER_ZOOM}`)
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) return
            const entry: PageData = {
              image: data.image_base64,
              width: data.width,
              height: data.height,
              originalWidth: data.original_width,
              originalHeight: data.original_height,
            }
            cachePage(activeDoc.doc_id, rightPage, entry)
            setPageDataRight(entry)
          })
          .catch((err) => console.error('Error rendering right page:', err))
          .finally(() => { if (!cancelled) setLoadingRight(false) })
      }
    } else {
      setPageDataRight(null)
    }

    return () => { cancelled = true }
  }, [activeDoc?.doc_id, activeDoc?.currentPage, store.viewMode])

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
    searchHighlight,
  }
}
