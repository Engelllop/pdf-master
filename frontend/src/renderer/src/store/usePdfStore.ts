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

export interface ViewerScroll {
  left: number
  top: number
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
}

export interface Annotation {
  id: string
  type: 'highlight' | 'underline' | 'strikethrough' | 'note' | 'draw' | 'text' | 'rect' | 'circle' | 'arrow' | 'signature' | 'measure_distance' | 'measure_area' | 'image'
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
  fontFamily?: string
  fontSize?: number
  imageData?: string
  rotation?: number
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
  searchResults: Array<{ page: number; x: number; y: number; width: number; height: number; snippet?: string }>
  searchIndex: number
  pageCache: Map<string, { image: string; width: number; height: number; originalWidth: number; originalHeight: number }>
  annotations: Annotation[]
  dirty: boolean
  outline: OutlineItem[]
  measurementScale?: MeasurementScale | null
  docVersion: number
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface AnnCommand {
  docId: string
  before: Annotation[]
  after: Annotation[]
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
  presentationMode: boolean
  continuousMode: boolean
  autoSaveEnabled: boolean
  textFontFamily: string
  textFontSize: number
  bookmarks: Bookmark[]
  navHistory: number[]
  navHistoryIndex: number
  toasts: Toast[]
  undoStack: AnnCommand[]
  redoStack: AnnCommand[]
  selectedAnnotationId: string | null
  saveStatus: 'idle' | 'saving' | 'saved'
  compareMode: boolean
  compareDocId: string | null
  compareSync: boolean
  selectedImagePath: string | null
  selectedImageData: string | null
  viewerScroll: ViewerScroll
  selectedStamp: string
  stampColor: string
  loadingDocId: string | null

  setDocLoading: (docId: string | null) => void
  addDoc: (info: {
    doc_id: string
    file_path: string
    page_count: number
    title: string | null
    author: string | null
    subject: string | null
    page_sizes: PageSize[]
  }, activate?: boolean) => string
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
  goToSearchResult: (docId: string, index: number) => void
  setActiveTool: (tool: string | null) => void
  setAnnotationColor: (color: string) => void
  setViewMode: (mode: 'single' | 'double') => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleReadingMode: () => void
  togglePresentationMode: () => void
  toggleContinuousMode: () => void
  setAutoSaveEnabled: (enabled: boolean) => void
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
  incrementDocVersion: (docId: string) => void
  setTextFontFamily: (family: string) => void
  setTextFontSize: (size: number) => void
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
  setSelectedImagePath: (path: string | null) => void
  setSelectedImageData: (data: string | null) => void
  reorderPages: (docId: string, newOrder: number[]) => void
  setViewerScroll: (scroll: ViewerScroll) => void
  setSelectedStamp: (stamp: string) => void
  setStampColor: (color: string) => void
}

const SCALES_KEY = 'pdfmaster_scales'

function loadPersistedScale(filePath: string): MeasurementScale | null {
  try {
    const map = JSON.parse(localStorage.getItem(SCALES_KEY) || '{}')
    return map[filePath] || null
  } catch {
    return null
  }
}

function persistScale(filePath: string, scale: MeasurementScale | null) {
  try {
    const map = JSON.parse(localStorage.getItem(SCALES_KEY) || '{}')
    if (scale) map[filePath] = scale
    else delete map[filePath]
    localStorage.setItem(SCALES_KEY, JSON.stringify(map))
  } catch {
    // localStorage lleno o bloqueado: la escala sigue viva en memoria
  }
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
    fitMode: 'fit-page',
    thumbnails: new Map(),
    searchQuery: '',
    searchResults: [],
    searchIndex: -1,
    pageCache: new Map(),
    annotations: [],
    dirty: false,
    outline: [],
    measurementScale: loadPersistedScale(info.file_path),
    docVersion: 0,
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
  undoStack: [],
  redoStack: [],
  selectedAnnotationId: null,
  saveStatus: 'idle',
  compareMode: false,
  compareDocId: null,
  compareSync: true,
  selectedImagePath: null,
  selectedImageData: null,
  viewerScroll: { left: 0, top: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0 },
  selectedStamp: 'APROBADO',
  stampColor: '#22c55e',
  theme: (() => { try { const t = localStorage.getItem('pdfmaster_theme'); return t === 'light' ? 'light' : 'dark' } catch { return 'dark' } })(),
  readingMode: false,
  presentationMode: false,
  continuousMode: false,
  autoSaveEnabled: (() => { try { return localStorage.getItem('pdfmaster_autosave') !== 'off' } catch { return true } })(),
  textFontFamily: 'Arial',
  textFontSize: 14,
  bookmarks: (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_bookmarks') || '[]') }
    catch { return [] }
  })(),
  navHistory: [],
  navHistoryIndex: -1,
  loadingDocId: null,

  setDocLoading: (docId) => set({ loadingDocId: docId }),
  addDoc: (info, activate = true) => {
    const doc = createDocFromInfo(info)
    set((state) => ({
      docs: [...state.docs, doc],
      // Bulk opens (e.g. 60+ plans at once) add background tabs; only activate when
      // asked or when nothing is open yet, so we render just one document at a time.
      activeDocId: (activate === false && state.activeDocId !== null) ? state.activeDocId : doc.doc_id,
    }))
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
        undoStack: state.undoStack.filter((c) => c.docId !== docId),
        redoStack: state.redoStack.filter((c) => c.docId !== docId),
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
        if (cache.size > 100) {
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

  goToSearchResult: (docId, index) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || index < 0 || index >= d.searchResults.length) return d
        return { ...d, searchIndex: index }
      }),
    }))
  },

  setActiveTool: (tool) => set({ activeTool: tool, selectedAnnotationId: null }),
  setAnnotationColor: (color) => set({ annotationColor: color }),

  setViewMode: (mode) => set({ viewMode: mode }),

  addAnnotation: (docId, ann) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const before = doc.annotations
      const after = [...before, ann]
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: after, dirty: true } : d)),
        undoStack: [...state.undoStack, { docId, before, after }].slice(-100),
        redoStack: [],
      }
    })
  },

  deleteAnnotation: (docId, annId) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const before = doc.annotations
      const after = before.filter((a) => a.id !== annId)
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: after, dirty: true } : d)),
        selectedAnnotationId: state.selectedAnnotationId === annId ? null : state.selectedAnnotationId,
        undoStack: [...state.undoStack, { docId, before, after }].slice(-100),
        redoStack: [],
      }
    })
  },

  setAnnotations: (docId, anns) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const before = doc.annotations
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: anns } : d)),
        undoStack: [...state.undoStack, { docId, before, after: anns }].slice(-100),
        redoStack: [],
      }
    })
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
    try { localStorage.setItem('pdfmaster_theme', theme) } catch {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  },

  toggleReadingMode: () => {
    set((state) => ({ readingMode: !state.readingMode }))
  },

  togglePresentationMode: () => {
    set((state) => ({ presentationMode: !state.presentationMode }))
  },

  toggleContinuousMode: () => {
    set((state) => ({ continuousMode: !state.continuousMode }))
  },

  setAutoSaveEnabled: (enabled) => {
    try { localStorage.setItem('pdfmaster_autosave', enabled ? 'on' : 'off') } catch {}
    set({ autoSaveEnabled: enabled })
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

  incrementDocVersion: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, docVersion: d.docVersion + 1 } : d)),
    }))
  },

  setTextFontFamily: (family) => set({ textFontFamily: family }),
  setTextFontSize: (size) => set({ textFontSize: Math.max(4, Math.min(72, size)) }),
  setSelectedImagePath: (path) => set({ selectedImagePath: path }),
  setSelectedImageData: (data) => set({ selectedImageData: data }),

  setViewerScroll: (scroll) => set({ viewerScroll: scroll }),
  setSelectedStamp: (stamp) => set({ selectedStamp: stamp }),
  setStampColor: (color) => set({ stampColor: color }),

  reorderPages: (docId, newOrder) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const newPageSizes = newOrder.map((oldIdx, newIdx) => ({
        ...doc.page_sizes[oldIdx],
        page_num: newIdx,
      }))
      const oldCurrentPage = doc.currentPage
      const newCurrentPage = newOrder.indexOf(oldCurrentPage)
      const newAnnotations = doc.annotations.map((ann) => ({
        ...ann,
        page: newOrder.indexOf(ann.page),
      }))
      return {
        docs: state.docs.map((d) =>
          d.doc_id === docId
            ? {
                ...d,
                currentPage: newCurrentPage,
                page_sizes: newPageSizes,
                annotations: newAnnotations,
                thumbnails: new Map(),
                pageCache: new Map(),
              }
            : d
        ),
      }
    })
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
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (doc) persistScale(doc.file_path, scale)
      return {
        docs: state.docs.map((d) =>
          d.doc_id === docId ? { ...d, measurementScale: scale } : d
        ),
      }
    })
  },

  selectAnnotation: (docId, annId) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return
    const exists = doc.annotations.some((a) => a.id === annId)
    set({ selectedAnnotationId: exists ? annId : null })
  },

  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return state
      const cmd = state.undoStack[state.undoStack.length - 1]
      return {
        docs: state.docs.map((d) => (d.doc_id === cmd.docId ? { ...d, annotations: cmd.before, dirty: true } : d)),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, cmd],
        selectedAnnotationId: null,
      }
    })
  },

  redo: () => {
    set((state) => {
      if (state.redoStack.length === 0) return state
      const cmd = state.redoStack[state.redoStack.length - 1]
      return {
        docs: state.docs.map((d) => (d.doc_id === cmd.docId ? { ...d, annotations: cmd.after, dirty: true } : d)),
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, cmd],
        selectedAnnotationId: null,
      }
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
