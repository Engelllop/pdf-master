import { create } from 'zustand'

export type FitMode = 'fit-width' | 'fit-page' | 'custom'

export interface PageSize {
  page_num: number
  width: number
  height: number
}

export interface MeasurementScale {
  pixelsPerUnit: number
  unit: 'm' | 'cm' | 'mm' | 'ft' | 'in'
}

export interface Annotation {
  id: string
  type: 'highlight' | 'underline' | 'strikethrough' | 'note' | 'draw' | 'text' | 'rect' | 'circle' | 'arrow' | 'signature' | 'measure_distance' | 'measure_area'
  page: number
  x: number
  y: number
  width?: number
  height?: number
  color?: string
  text?: string
  points?: Array<{ x: number; y: number }>
  lineWidth?: number
  measurement?: { value: number; unit: string; label: string }
}

export interface OutlineItem {
  title: string
  page: number
  children?: OutlineItem[]
}

export interface Bookmark {
  id: string
  docId: string
  page: number
  label: string
}

export interface PdfDoc {
  doc_id: string
  file_path: string
  file_name: string
  page_count: number
  title: string | null
  author: string | null
  subject: string | null
  page_sizes: PageSize[]
  currentPage: number
  zoom: number
  fitMode: FitMode
  thumbnails: Map<number, string>
  searchQuery: string
  searchResults: Array<{ page: number; x: number; y: number; width: number; height: number }>
  searchIndex: number
  pageCache: Map<string, { image: string; width: number; height: number; originalWidth: number; originalHeight: number }>
  annotations: Annotation[]
  dirty: boolean
  outline: OutlineItem[]
  measurementScale?: MeasurementScale | null
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface HistoryEntry {
  docs: PdfDoc[]
  activeDocId: string | null
}

export interface PdfState {
  docs: PdfDoc[]
  activeDocId: string | null
  sidebarOpen: boolean
  toolsPanelOpen: boolean
  viewerWidth: number
  viewerHeight: number
  activeTool: string | null
  annotationColor: string
  viewMode: 'single' | 'double'
  theme: 'dark' | 'light'
  readingMode: boolean
  bookmarks: Bookmark[]
  navHistory: number[]
  navHistoryIndex: number
  toasts: Toast[]
  history: HistoryEntry[]
  historyIndex: number
  selectedAnnotationId: string | null
  saveStatus: 'idle' | 'saving' | 'saved'
  compareMode: boolean
  compareDocId: string | null
  compareSync: boolean

  addDoc: (info: {
    doc_id: string
    file_path: string
    page_count: number
    title: string | null
    author: string | null
    subject: string | null
    page_sizes: PageSize[]
  }) => string
  closeDoc: (docId: string) => void
  setActiveDoc: (docId: string) => void
  setPage: (docId: string, page: number) => void
  nextPage: (docId: string) => void
  prevPage: (docId: string) => void
  setZoom: (docId: string, zoom: number) => void
  setFitMode: (docId: string, mode: FitMode) => void
  cachePage: (docId: string, page: number, data: PdfDoc['pageCache'] extends Map<string, infer V> ? V : never) => void
  getCachedPage: (docId: string, page: number) => PdfDoc['pageCache'] extends Map<string, infer V> ? V | undefined : never
  computeFitZoom: (docId: string, page: number, mode: FitMode, vw: number, vh: number) => number
  addThumbnail: (docId: string, page: number, dataUrl: string) => void
  toggleSidebar: () => void
  toggleToolsPanel: () => void
  setViewerSize: (w: number, h: number) => void
  setSearchQuery: (docId: string, query: string) => void
  setSearchResults: (docId: string, results: PdfDoc['searchResults']) => void
  nextSearchResult: (docId: string) => void
  prevSearchResult: (docId: string) => void
  setActiveTool: (tool: string | null) => void
  setAnnotationColor: (color: string) => void
  setViewMode: (mode: 'single' | 'double') => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleReadingMode: () => void
  addBookmark: (bookmark: Bookmark) => void
  removeBookmark: (id: string) => void
  goBack: (docId: string) => void
  goForward: (docId: string) => void
  addAnnotation: (docId: string, ann: Annotation) => void
  deleteAnnotation: (docId: string, annId: string) => void
  setAnnotations: (docId: string, anns: Annotation[]) => void
  getAnnotationsForPage: (docId: string, page: number) => Annotation[]
  setDocDirty: (docId: string, dirty: boolean) => void
  updateDocPageCount: (docId: string, count: number) => void
  updateDocPageSizes: (docId: string, sizes: PageSize[]) => void
  setOutline: (docId: string, outline: OutlineItem[]) => void
  selectAnnotation: (docId: string, annId: string | null) => void
  invalidatePageCache: (docId: string) => void
  invalidateThumbnails: (docId: string) => void
  updateAnnotation: (docId: string, annId: string, updates: Partial<Annotation>) => void
  setMeasurementScale: (docId: string, scale: MeasurementScale | null) => void
  undo: () => void
  redo: () => void

  // Toasts
  showToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
  setSaveStatus: (status: 'idle' | 'saving' | 'saved') => void
  setCompareDoc: (docId: string | null) => void
  toggleCompareMode: () => void
  clearCompare: () => void
  setCompareSync: (sync: boolean) => void
}

function cloneDocs(docs: PdfDoc[]): PdfDoc[] {
  return docs.map((d) => ({
    ...d,
    page_sizes: [...d.page_sizes],
    thumbnails: new Map(d.thumbnails),
    // pageCache is intentionally NOT cloned to save memory in undo history
    pageCache: new Map(),
    annotations: d.annotations.map((a) => ({ ...a, points: a.points ? a.points.map((p) => ({ ...p })) : undefined })),
    searchResults: [...d.searchResults],
  }))
}

function createDocFromInfo(info: Parameters<PdfState['addDoc']>[0]): PdfDoc {
  const sizes = info.page_sizes || []
  const fitZoom = sizes.length > 0 ? (800 - 64) / sizes[0].width : 1
  return {
    ...info,
    page_sizes: sizes,
    file_name: info.file_path.split(/[\\/]/).pop() || 'Documento',
    currentPage: 0,
    zoom: fitZoom,
    fitMode: 'fit-width',
    thumbnails: new Map(),
    searchQuery: '',
    searchResults: [],
    searchIndex: -1,
    pageCache: new Map(),
    annotations: [],
    dirty: false,
    outline: [],
    measurementScale: null,
  }
}

function getPageCacheKey(page: number): string {
  return `${page}`
}

export const usePdfStore = create<PdfState>((set, get) => ({
  docs: [],
  activeDocId: null,
  sidebarOpen: true,
  toolsPanelOpen: true,
  viewerWidth: 800,
  viewerHeight: 600,
  activeTool: null,
  annotationColor: '#fbbf24',
  viewMode: 'single',
  toasts: [],
  history: [],
  historyIndex: -1,
  selectedAnnotationId: null,
  saveStatus: 'idle',
  compareMode: false,
  compareDocId: null,
  compareSync: true,
  theme: 'dark',
  readingMode: false,
  bookmarks: (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_bookmarks') || '[]') }
    catch { return [] }
  })(),
  navHistory: [],
  navHistoryIndex: -1,

  addDoc: (info) => {
    const doc = createDocFromInfo(info)
    set((state) => {
      const newDocs = [...state.docs, doc]
      return {
        docs: newDocs,
        activeDocId: doc.doc_id,
        history: [{ docs: cloneDocs(newDocs), activeDocId: doc.doc_id }],
        historyIndex: 0,
      }
    })
    return doc.doc_id
  },

  closeDoc: (docId) => {
    // Notify backend to free memory
    fetch(`http://localhost:8745/pdf/close/${docId}`, { method: 'POST' }).catch(() => {})
    set((state) => {
      const remaining = state.docs.filter((d) => d.doc_id !== docId)
      const newActiveId =
        state.activeDocId === docId
          ? remaining.length > 0
            ? remaining[remaining.length - 1].doc_id
            : null
          : state.activeDocId
      return {
        docs: remaining,
        activeDocId: newActiveId,
        selectedAnnotationId: null,
        saveStatus: 'idle',
      }
    })
  },

  setActiveDoc: (docId) => set({ activeDocId: docId, selectedAnnotationId: null }),

  setPage: (docId, page) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      const validPage = doc ? Math.max(0, Math.min(doc.page_count - 1, page)) : page
      // Update nav history
      let newHistory = state.navHistory
      let newIndex = state.navHistoryIndex
      if (doc && validPage !== doc.currentPage) {
        // Truncate forward history and append new page
        newHistory = [...newHistory.slice(0, newIndex + 1), validPage].slice(-50)
        newIndex = newHistory.length - 1
      }
      return {
        docs: state.docs.map((d) =>
          d.doc_id === docId ? { ...d, currentPage: validPage } : d
        ),
        navHistory: newHistory,
        navHistoryIndex: newIndex,
      }
    })
  },

  nextPage: (docId) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc || doc.currentPage >= doc.page_count - 1) return state
      const step = state.viewMode === 'double' ? 2 : 1
      const newPage = Math.min(doc.page_count - 1, doc.currentPage + step)
      const newHistory = [...state.navHistory.slice(0, state.navHistoryIndex + 1), newPage].slice(-50)
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, currentPage: newPage } : d)),
        navHistory: newHistory,
        navHistoryIndex: newHistory.length - 1,
      }
    })
  },

  prevPage: (docId) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc || doc.currentPage <= 0) return state
      const step = state.viewMode === 'double' ? 2 : 1
      const newPage = Math.max(0, doc.currentPage - step)
      const newHistory = [...state.navHistory.slice(0, state.navHistoryIndex + 1), newPage].slice(-50)
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, currentPage: newPage } : d)),
        navHistory: newHistory,
        navHistoryIndex: newHistory.length - 1,
      }
    })
  },

  setZoom: (docId, zoom) => {
    const clamped = Math.max(0.1, Math.min(8, zoom))
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, zoom: clamped, fitMode: 'custom' } : d
      ),
    }))
  },

  setFitMode: (docId, mode) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, fitMode: mode } : d)),
    }))
  },

  cachePage: (docId, page, data) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId) return d
        const cache = new Map(d.pageCache)
        cache.set(getPageCacheKey(page), data)
        if (cache.size > 30) {
          const first = cache.keys().next().value
          if (first !== undefined) cache.delete(first)
        }
        return { ...d, pageCache: cache }
      }),
    }))
  },

  getCachedPage: (docId, page) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return undefined
    return doc.pageCache.get(getPageCacheKey(page))
  },

  computeFitZoom: (docId, page, mode, vw, vh) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc || !doc.page_sizes[page]) return 1
    const pw = doc.page_sizes[page].width
    const ph = doc.page_sizes[page].height
    if (mode === 'fit-width') {
      const availableW = vw - 48
      return availableW / pw
    }
    if (mode === 'fit-page') {
      const availableW = vw - 48
      const availableH = vh - 40
      return Math.min(availableW / pw, availableH / ph)
    }
    return doc.zoom
  },

  addThumbnail: (docId, page, dataUrl) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId) return d
        const thumbs = new Map(d.thumbnails)
        thumbs.set(page, dataUrl)
        return { ...d, thumbnails: thumbs }
      }),
    }))
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleToolsPanel: () => set((state) => ({ toolsPanelOpen: !state.toolsPanelOpen })),
  setViewerSize: (w, h) => set({ viewerWidth: w, viewerHeight: h }),

  setSearchQuery: (docId, query) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, searchQuery: query, searchResults: [], searchIndex: -1 } : d
      ),
    }))
  },

  setSearchResults: (docId, results) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, searchResults: results, searchIndex: results.length > 0 ? 0 : -1 } : d
      ),
    }))
  },

  nextSearchResult: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.searchResults.length === 0) return d
        return { ...d, searchIndex: (d.searchIndex + 1) % d.searchResults.length }
      }),
    }))
  },

  prevSearchResult: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.searchResults.length === 0) return d
        return { ...d, searchIndex: (d.searchIndex - 1 + d.searchResults.length) % d.searchResults.length }
      }),
    }))
  },

  setActiveTool: (tool) => set({ activeTool: tool, selectedAnnotationId: null }),
  setAnnotationColor: (color) => set({ annotationColor: color }),

  setViewMode: (mode) => set({ viewMode: mode }),

  addAnnotation: (docId, ann) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, annotations: [...d.annotations, ann], dirty: true } : d
      ),
    }))
    // Record history
    const { docs, activeDocId, history, historyIndex } = get()
    const newEntry = { docs: cloneDocs(docs), activeDocId }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newEntry)
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  deleteAnnotation: (docId, annId) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, annotations: d.annotations.filter((a) => a.id !== annId), dirty: true } : d
      ),
      selectedAnnotationId: state.selectedAnnotationId === annId ? null : state.selectedAnnotationId,
    }))
    // Record history
    const { docs, activeDocId, history, historyIndex } = get()
    const newEntry = { docs: cloneDocs(docs), activeDocId }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newEntry)
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  setAnnotations: (docId, anns) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, annotations: anns } : d
      ),
    }))
    // Record history
    const { docs, activeDocId, history, historyIndex } = get()
    const newEntry = { docs: cloneDocs(docs), activeDocId }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newEntry)
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  setOutline: (docId, outline) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, outline } : d
      ),
    }))
  },

  getAnnotationsForPage: (docId, page) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    return doc ? doc.annotations.filter((a) => a.page === page) : []
  },

  setDocDirty: (docId, dirty) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, dirty } : d)),
      saveStatus: dirty ? 'idle' : state.saveStatus,
    }))
  },

  setSaveStatus: (status) => {
    set({ saveStatus: status })
  },

  setTheme: (theme) => {
    set({ theme })
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  },

  toggleReadingMode: () => {
    set((state) => ({ readingMode: !state.readingMode }))
  },

  addBookmark: (bookmark) => {
    set((state) => {
      const updated = [...state.bookmarks, bookmark]
      localStorage.setItem('pdfmaster_bookmarks', JSON.stringify(updated))
      return { bookmarks: updated }
    })
  },

  removeBookmark: (id) => {
    set((state) => {
      const updated = state.bookmarks.filter((b) => b.id !== id)
      localStorage.setItem('pdfmaster_bookmarks', JSON.stringify(updated))
      return { bookmarks: updated }
    })
  },

  goBack: (docId) => {
    set((state) => {
      if (state.navHistoryIndex <= 0) return state
      const newIndex = state.navHistoryIndex - 1
      const page = state.navHistory[newIndex]
      return {
        navHistoryIndex: newIndex,
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, currentPage: page } : d)),
      }
    })
  },

  goForward: (docId) => {
    set((state) => {
      if (state.navHistoryIndex >= state.navHistory.length - 1) return state
      const newIndex = state.navHistoryIndex + 1
      const page = state.navHistory[newIndex]
      return {
        navHistoryIndex: newIndex,
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, currentPage: page } : d)),
      }
    })
  },

  updateDocPageCount: (docId, count) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, page_count: count } : d)),
    }))
  },

  updateDocPageSizes: (docId, sizes) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, page_sizes: sizes } : d)),
    }))
  },

  invalidatePageCache: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, pageCache: new Map() } : d)),
    }))
  },

  invalidateThumbnails: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, thumbnails: new Map() } : d)),
    }))
  },

  updateAnnotation: (docId, annId, updates) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const annIndex = doc.annotations.findIndex((a) => a.id === annId)
      if (annIndex === -1) return state
      const newAnns = [...doc.annotations]
      newAnns[annIndex] = { ...newAnns[annIndex], ...updates }
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: newAnns, dirty: true } : d)),
      }
    })
  },

  setMeasurementScale: (docId, scale) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, measurementScale: scale, dirty: true } : d
      ),
    }))
  },

  selectAnnotation: (docId, annId) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return
    const exists = doc.annotations.some((a) => a.id === annId)
    set({ selectedAnnotationId: exists ? annId : null })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const entry = history[historyIndex - 1]
    set({
      docs: cloneDocs(entry.docs),
      activeDocId: entry.activeDocId,
      historyIndex: historyIndex - 1,
      selectedAnnotationId: null,
    })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const entry = history[historyIndex + 1]
    set({
      docs: cloneDocs(entry.docs),
      activeDocId: entry.activeDocId,
      historyIndex: historyIndex + 1,
      selectedAnnotationId: null,
    })
  },

  showToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  setCompareDoc: (docId) => set({ compareDocId: docId }),
  toggleCompareMode: () => set((state) => ({ compareMode: !state.compareMode })),
  clearCompare: () => set({ compareMode: false, compareDocId: null }),
  setCompareSync: (sync) => set({ compareSync: sync }),
}))
