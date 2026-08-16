import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export type FitMode = 'fit-width' | 'fit-page' | 'custom'

export type LineStyle = 'solid' | 'dashed' | 'dotted'
export type ThemePreference = 'light' | 'dark' | 'system'
/** Qué hace la rueda al llegar al borde de la página: desplazar o cambiar de página. */
export type WheelMode = 'scroll' | 'page'
/** Encuadre con el que se abre un documento. */
export type DefaultZoomMode = 'fit-page' | 'fit-width' | 'actual'
export type RibbonTab = 'read' | 'comment' | 'edit' | 'page' | 'protect' | 'convert' | 'ai'

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

export type AnnotationStatus = 'open' | 'resolved'
export type CountSymbol = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star'
export const COUNT_SYMBOLS: CountSymbol[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'star']

export interface Reply {
  id: string
  author?: string
  text: string
  at: number
}

export interface Annotation {
  id: string
  type: 'highlight' | 'underline' | 'strikethrough' | 'note' | 'draw' | 'text' | 'rect' | 'circle' | 'arrow' | 'line' | 'callout' | 'signature' | 'measure_distance' | 'measure_area' | 'measure_perimeter' | 'image' | 'count' | 'check' | 'cross' | 'star' | 'cloud' | 'polygon'
  page: number
  x: number
  y: number
  width?: number
  height?: number
  color?: string
  text?: string
  points?: Array<{ x: number; y: number }>
  lineWidth?: number
  lineStyle?: LineStyle
  opacity?: number
  fillColor?: string
  fillOpacity?: number
  measurement?: { value: number; unit: string; label: string }
  fontFamily?: string
  fontSize?: number
  imageData?: string
  rotation?: number
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  listStyle?: 'none' | 'bullet' | 'number'
  /** Símbolo de las marcas de conteo (estilo Bluebeam): permite contar varias
   * categorías en el mismo plano distinguiéndolas de un vistazo. */
  symbol?: CountSymbol
  // Metadatos de revisión: los rellena el store al crear/editar la marca.
  author?: string
  createdAt?: number
  modifiedAt?: number
  status?: AnnotationStatus
  replies?: Reply[]
  /** Capa de markup (estilo Bluebeam). Default "Marcas". */
  layer?: string
}

export interface TextStyle {
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: number
  listStyle: 'none' | 'bullet' | 'number'
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
  navHistory: number[]
  navHistoryIndex: number
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  /** en su animación de salida; se retira del array al terminar */
  leaving?: boolean
}

/** Operación larga en curso. `total` 0 = progreso indeterminado. */
export interface ProgressState {
  label: string
  detail?: string
  current: number
  total: number
  cancelable: boolean
  canceled: boolean
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
  viewerWidth: number
  viewerHeight: number
  activeTool: string | null
  stickyTools: boolean
  activeRibbon: RibbonTab
  annotationColor: string
  annotationLineWidth: number
  annotationLineStyle: LineStyle
  annotationOpacity: number
  annotationFillColor: string | null
  annotationFillOpacity: number
  viewMode: 'single' | 'double'
  theme: 'dark' | 'light'
  readingMode: boolean
  presentationMode: boolean
  continuousMode: boolean
  textFontFamily: string
  textFontSize: number
  bookmarks: Bookmark[]
  toasts: Toast[]
  undoStack: AnnCommand[]
  redoStack: AnnCommand[]
  selectedAnnotationId: string | null
  saveStatus: 'idle' | 'saving' | 'saved'
  compareMode: boolean
  compareDocId: string | null
  compareSync: boolean
  compareZoom: number
  selectedImagePath: string | null
  selectedImageData: string | null
  viewerScroll: ViewerScroll
  selectedStamp: string
  stampColor: string
  stampSize: number
  loadingDocId: string | null

  progress: ProgressState | null
  startProgress: (label: string, total: number, cancelable?: boolean) => void
  updateProgress: (current: number, detail?: string) => void
  endProgress: () => void
  requestCancel: () => void
  isCancelRequested: () => boolean

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
  moveDoc: (docId: string, toIndex: number) => void
  remapDocId: (oldId: string, newId: string) => void
  setActiveDoc: (docId: string) => void
  setPage: (docId: string, page: number) => void
  nextPage: (docId: string) => void
  prevPage: (docId: string) => void
  setZoom: (docId: string, zoom: number, markCustom?: boolean) => void
  setFitMode: (docId: string, mode: FitMode) => void
  cachePage: (docId: string, page: number, data: PdfDoc['pageCache'] extends Map<string, infer V> ? V : never) => void
  getCachedPage: (docId: string, page: number) => PdfDoc['pageCache'] extends Map<string, infer V> ? V | undefined : never
  computeFitZoom: (docId: string, page: number, mode: FitMode, vw: number, vh: number) => number
  addThumbnail: (docId: string, page: number, dataUrl: string) => void
  toggleSidebar: () => void
  setViewerSize: (w: number, h: number) => void
  setSearchQuery: (docId: string, query: string) => void
  setSearchResults: (docId: string, results: PdfDoc['searchResults']) => void
  nextSearchResult: (docId: string) => void
  prevSearchResult: (docId: string) => void
  goToSearchResult: (docId: string, index: number) => void
  setActiveTool: (tool: string | null) => void
  setStickyTools: (sticky: boolean) => void
  releaseTool: () => void
  setActiveRibbon: (tab: RibbonTab) => void
  setAnnotationColor: (color: string) => void
  countCategory: string
  setCountCategory: (category: string) => void
  countSymbol: CountSymbol
  setCountSymbol: (symbol: CountSymbol) => void
  setAnnotationLineWidth: (width: number) => void
  setAnnotationLineStyle: (style: LineStyle) => void
  setAnnotationOpacity: (opacity: number) => void
  setAnnotationFillColor: (color: string | null) => void
  setAnnotationFillOpacity: (opacity: number) => void
  setViewMode: (mode: 'single' | 'double') => void
  setTheme: (theme: 'dark' | 'light') => void
  themePreference: ThemePreference
  setThemePreference: (pref: ThemePreference) => void
  applySystemTheme: () => void
  wheelMode: WheelMode
  setWheelMode: (mode: WheelMode) => void
  uiScale: number
  setUiScale: (scale: number) => void
  defaultZoomMode: DefaultZoomMode
  setDefaultZoomMode: (mode: DefaultZoomMode) => void
  defaultUnit: MeasurementScale['unit']
  setDefaultUnit: (unit: MeasurementScale['unit']) => void
  restoreSession: boolean
  setRestoreSession: (on: boolean) => void
  backupOnSave: boolean
  setBackupOnSave: (on: boolean) => void
  toggleReadingMode: () => void
  togglePresentationMode: () => void
  toggleContinuousMode: () => void
  addBookmark: (bookmark: Bookmark) => void
  removeBookmark: (id: string) => void
  goBack: (docId: string) => void
  goForward: (docId: string) => void
  annotationAuthor: string
  setAnnotationAuthor: (name: string) => void
  setAnnotationStatus: (docId: string, annId: string, status: AnnotationStatus) => void
  addReply: (docId: string, annId: string, text: string) => void
  deleteReply: (docId: string, annId: string, replyId: string) => void
  addAnnotation: (docId: string, ann: Annotation) => void
  deleteAnnotation: (docId: string, annId: string) => void
  setAnnotations: (docId: string, anns: Annotation[]) => void
  getAnnotationsForPage: (docId: string, page: number) => Annotation[]
  setDocDirty: (docId: string, dirty: boolean) => void
  updateDocPageCount: (docId: string, count: number) => void
  updateDocPageSizes: (docId: string, sizes: PageSize[]) => void
  setOutline: (docId: string, outline: OutlineItem[]) => void
  selectAnnotation: (docId: string, annId: string | null) => void
  selectedAnnotationIds: string[]
  selectAnnotations: (docId: string, ids: string[]) => void
  toggleAnnotationSelection: (docId: string, annId: string) => void
  updateAnnotations: (docId: string, ids: string[], updates: Partial<Annotation>) => void
  moveAnnotations: (docId: string, ids: string[], dx: number, dy: number) => void
  deleteAnnotations: (docId: string, ids: string[]) => void
  annotationClipboard: Annotation[]
  copyAnnotations: (docId: string, ids: string[]) => number
  pasteAnnotations: (docId: string, page: number, offset?: number) => number
  invalidatePageCache: (docId: string) => void
  invalidateThumbnails: (docId: string) => void
  updateAnnotation: (docId: string, annId: string, updates: Partial<Annotation>) => void
  setMeasurementScale: (docId: string, scale: MeasurementScale | null) => void
  incrementDocVersion: (docId: string) => void
  setTextFontFamily: (family: string) => void
  setTextFontSize: (size: number) => void
  textStyle: TextStyle
  setTextStyle: (s: Partial<TextStyle>) => void
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
  setCompareZoom: (zoom: number) => void
  setSelectedImagePath: (path: string | null) => void
  setSelectedImageData: (data: string | null) => void
  reorderPages: (docId: string, newOrder: number[]) => void
  setViewerScroll: (scroll: ViewerScroll) => void
  setSelectedStamp: (stamp: string) => void
  setStampColor: (color: string) => void
  setStampSize: (size: number) => void
}

const SCALES_KEY = 'pdfmaster_scales'
const STROKE_KEY = 'pdfmaster_stroke'
const STICKY_KEY = 'pdfmaster_sticky_tools'
const AUTHOR_KEY = 'pdfmaster_author'
const THEME_PREF_KEY = 'pdfmaster_theme_pref'
const WHEEL_KEY = 'pdfmaster_wheel_mode'
const PREF_KEYS = {
  uiScale: 'pdfmaster_ui_scale',
  zoomMode: 'pdfmaster_default_zoom',
  unit: 'pdfmaster_default_unit',
  restore: 'pdfmaster_restore_session',
  backup: 'pdfmaster_backup_on_save',
}

function loadPref<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && valid.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

function systemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function loadThemePreference(): ThemePreference {
  try {
    const pref = localStorage.getItem(THEME_PREF_KEY)
    if (pref === 'dark' || pref === 'light' || pref === 'system') return pref
    // Sin preferencia nueva: respeta el tema que ya tuviera guardado la app.
    return localStorage.getItem('pdfmaster_theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// Herramientas que siempre se sueltan tras un uso aunque el modo pegajoso esté
// activo: piden un archivo, una calibración o una selección de área puntual.
const ONE_SHOT_TOOLS = ['image', 'measure_calibrate', 'croparea', 'redactarea']

function loadStrokePrefs(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(STROKE_KEY) || '{}') } catch { return {} }
}

function persistStrokePrefs(partial: Record<string, unknown>) {
  try { localStorage.setItem(STROKE_KEY, JSON.stringify({ ...loadStrokePrefs(), ...partial })) } catch {}
}

const strokePrefs = loadStrokePrefs()

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

// vw/vh = tamaño real del visor (mismos márgenes que computeFitZoom fit-page),
// para que el zoom inicial ya sea el ajuste correcto aunque el doc se abra en
// segundo plano y el recálculo del efecto no llegue a dispararse.
function createDocFromInfo(
  info: Parameters<PdfState['addDoc']>[0],
  vw: number,
  vh: number,
  zoomMode: DefaultZoomMode = 'fit-page',
): PdfDoc {
  const sizes = info.page_sizes || []
  const first = sizes[0]
  const fitZoom = first
    ? zoomMode === 'actual'
      ? 1
      : zoomMode === 'fit-width'
        ? (vw - 48) / first.width
        : Math.min((vw - 48) / first.width, (vh - 40) / first.height)
    : 1
  return {
    ...info,
    page_sizes: sizes,
    file_name: info.file_path.split(/[\\/]/).pop() || 'Documento',
    currentPage: 0,
    zoom: fitZoom,
    fitMode: zoomMode === 'actual' ? 'custom' : zoomMode,
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
    navHistory: [],
    navHistoryIndex: -1,
  }
}

function getPageCacheKey(page: number): string {
  return `${page}`
}

export const usePdfStore = create<PdfState>((set, get) => ({
  docs: [],
  activeDocId: null,
  sidebarOpen: false,
  viewerWidth: 800,
  viewerHeight: 600,
  activeTool: null,
  stickyTools: (() => { try { return localStorage.getItem(STICKY_KEY) !== '0' } catch { return true } })(),
  annotationAuthor: (() => { try { return localStorage.getItem(AUTHOR_KEY) || '' } catch { return '' } })(),
  activeRibbon: 'read',
  annotationColor: '#fbbf24',
  countCategory: 'General',
  countSymbol: 'circle',
  annotationLineWidth: typeof strokePrefs.lineWidth === 'number' ? strokePrefs.lineWidth as number : 2,
  annotationLineStyle: (['solid', 'dashed', 'dotted'].includes(strokePrefs.lineStyle as string) ? strokePrefs.lineStyle : 'solid') as LineStyle,
  annotationOpacity: typeof strokePrefs.opacity === 'number' ? strokePrefs.opacity as number : 1,
  annotationFillColor: typeof strokePrefs.fillColor === 'string' ? strokePrefs.fillColor as string : null,
  annotationFillOpacity: typeof strokePrefs.fillOpacity === 'number' ? strokePrefs.fillOpacity as number : 0.3,
  viewMode: 'single',
  toasts: [],
  undoStack: [],
  redoStack: [],
  selectedAnnotationId: null,
  selectedAnnotationIds: [],
  annotationClipboard: [],
  progress: null,
  saveStatus: 'idle',
  compareMode: false,
  compareDocId: null,
  compareSync: true,
  compareZoom: 1,
  selectedImagePath: null,
  selectedImageData: null,
  viewerScroll: { left: 0, top: 0, clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0 },
  selectedStamp: 'APROBADO',
  stampColor: '#22c55e',
  stampSize: 24,
  themePreference: loadThemePreference(),
  theme: (() => {
    const pref = loadThemePreference()
    return pref === 'system' ? systemTheme() : pref
  })(),
  // Por defecto se mantiene el comportamiento histórico (cambiar de página al llegar
  // al borde); quien lo encuentre sorprendente lo desactiva en Ajustes.
  wheelMode: (() => { try { return localStorage.getItem(WHEEL_KEY) === 'scroll' ? 'scroll' : 'page' } catch { return 'page' } })(),
  uiScale: (() => { try { return Number(localStorage.getItem(PREF_KEYS.uiScale)) || 1 } catch { return 1 } })(),
  defaultZoomMode: loadPref(PREF_KEYS.zoomMode, ['fit-page', 'fit-width', 'actual'] as const, 'fit-page'),
  defaultUnit: loadPref(PREF_KEYS.unit, ['m', 'cm', 'mm', 'ft', 'in'] as const, 'mm'),
  restoreSession: (() => { try { return localStorage.getItem(PREF_KEYS.restore) !== '0' } catch { return true } })(),
  backupOnSave: (() => { try { return localStorage.getItem(PREF_KEYS.backup) !== '0' } catch { return true } })(),
  readingMode: false,
  presentationMode: false,
  continuousMode: false,
  textFontFamily: 'Arial',
  textFontSize: 14,
  textStyle: { bold: false, italic: false, align: 'left', lineHeight: 1.3, listStyle: 'none' },
  bookmarks: (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_bookmarks') || '[]') }
    catch { return [] }
  })(),
  loadingDocId: null,

  // Progreso de operaciones largas. El backend corre con UN worker: sin esto, un
  // export o un lote de 60 documentos congela la app sin explicación.
  startProgress: (label, total, cancelable = true) =>
    set({ progress: { label, current: 0, total, cancelable, canceled: false } }),

  updateProgress: (current, detail) =>
    set((state) => (state.progress ? { progress: { ...state.progress, current, detail } } : state)),

  endProgress: () => set({ progress: null }),

  requestCancel: () =>
    set((state) => (state.progress ? { progress: { ...state.progress, canceled: true } } : state)),

  isCancelRequested: () => !!get().progress?.canceled,

  setDocLoading: (docId) => set({ loadingDocId: docId }),
  addDoc: (info, activate = true) => {
    const { viewerWidth, viewerHeight } = get()
    const doc = createDocFromInfo(info, viewerWidth || 800, viewerHeight || 600, get().defaultZoomMode)
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
    apiFetch(`/pdf/close/${docId}`, { method: 'POST' }).catch(() => {})
    set((state) => {
      const remaining = state.docs.filter((d) => d.doc_id !== docId)
      const newActiveId =
        state.activeDocId === docId
          ? remaining.length > 0
            ? remaining[remaining.length - 1].doc_id
            : null
          : state.activeDocId
      // Si el doc cerrado participaba en la comparación, salir del modo comparar
      // para que ComparisonView no quede apuntando a un documento muerto.
      const wasComparing = state.compareDocId === docId || (state.compareMode && state.activeDocId === docId)
      return {
        docs: remaining,
        activeDocId: newActiveId,
        selectedAnnotationId: null,
  selectedAnnotationIds: [],
        saveStatus: 'idle',
        undoStack: state.undoStack.filter((c) => c.docId !== docId),
        redoStack: state.redoStack.filter((c) => c.docId !== docId),
        ...(wasComparing ? { compareMode: false, compareDocId: state.compareDocId === docId ? null : state.compareDocId } : {}),
      }
    })
  },

  moveDoc: (docId, toIndex) => {
    set((state) => {
      const from = state.docs.findIndex((d) => d.doc_id === docId)
      const to = Math.max(0, Math.min(state.docs.length - 1, toIndex))
      if (from === -1 || from === to) return state
      const docs = [...state.docs]
      const [doc] = docs.splice(from, 1)
      docs.splice(to, 0, doc)
      return { docs }
    })
  },

  // Tras un reinicio del motor el doc_id queda muerto (404). Reabrimos el archivo y
  // sustituimos el id conservando todo el estado local (anotaciones, página, zoom).
  // El pageCache se vacía porque sus URLs contienen el id viejo; docVersion sube
  // para bustear el caché de <img> del navegador.
  remapDocId: (oldId, newId) => {
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === oldId ? { ...d, doc_id: newId, pageCache: new Map(), docVersion: d.docVersion + 1 } : d
      ),
      activeDocId: state.activeDocId === oldId ? newId : state.activeDocId,
      compareDocId: state.compareDocId === oldId ? newId : state.compareDocId,
      loadingDocId: state.loadingDocId === oldId ? newId : state.loadingDocId,
      undoStack: state.undoStack.map((c) => (c.docId === oldId ? { ...c, docId: newId } : c)),
      redoStack: state.redoStack.map((c) => (c.docId === oldId ? { ...c, docId: newId } : c)),
    }))
  },

  setActiveDoc: (docId) => set({ activeDocId: docId, selectedAnnotationId: null }),

  setPage: (docId, page) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId) return d
        const validPage = Math.max(0, Math.min(d.page_count - 1, page))
        if (validPage === d.currentPage) return d
        // Truncate forward history and append new page
        const navHistory = [...d.navHistory.slice(0, d.navHistoryIndex + 1), validPage].slice(-50)
        return { ...d, currentPage: validPage, navHistory, navHistoryIndex: navHistory.length - 1 }
      }),
    }))
  },

  nextPage: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.currentPage >= d.page_count - 1) return d
        const step = state.viewMode === 'double' ? 2 : 1
        const newPage = Math.min(d.page_count - 1, d.currentPage + step)
        const navHistory = [...d.navHistory.slice(0, d.navHistoryIndex + 1), newPage].slice(-50)
        return { ...d, currentPage: newPage, navHistory, navHistoryIndex: navHistory.length - 1 }
      }),
    }))
  },

  prevPage: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.currentPage <= 0) return d
        const step = state.viewMode === 'double' ? 2 : 1
        const newPage = Math.max(0, d.currentPage - step)
        const navHistory = [...d.navHistory.slice(0, d.navHistoryIndex + 1), newPage].slice(-50)
        return { ...d, currentPage: newPage, navHistory, navHistoryIndex: navHistory.length - 1 }
      }),
    }))
  },

  setZoom: (docId, zoom, markCustom = true) => {
    const clamped = Math.max(0.1, Math.min(8, zoom))
    set((state) => ({
      docs: state.docs.map((d) =>
        d.doc_id === docId ? { ...d, zoom: clamped, ...(markCustom ? { fitMode: 'custom' as FitMode } : {}) } : d
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

  // El scroll continuo es de solo lectura: elegir una herramienta ahí dejaba la app
  // "muerta" (ni marcar ni seleccionar). Se vuelve a la vista de página, que sí marca.
  setActiveTool: (tool) => set((state) => ({
    activeTool: tool,
    selectedAnnotationId: null,
    ...(tool && state.continuousMode ? { continuousMode: false } : {}),
  })),
  setStickyTools: (sticky) => {
    set({ stickyTools: sticky })
    try { localStorage.setItem(STICKY_KEY, sticky ? '1' : '0') } catch {}
  },
  releaseTool: () => {
    const { activeTool, stickyTools } = get()
    if (!activeTool) return
    if (!stickyTools || ONE_SHOT_TOOLS.includes(activeTool)) set({ activeTool: null })
  },
  setActiveRibbon: (tab) => set({ activeRibbon: tab }),
  setAnnotationColor: (color) => set({ annotationColor: color }),
  setCountCategory: (category) => set({ countCategory: category }),
  setCountSymbol: (symbol) => set({ countSymbol: symbol }),
  setAnnotationLineWidth: (width) => {
    const v = Math.max(0.5, Math.min(20, width))
    persistStrokePrefs({ lineWidth: v })
    set({ annotationLineWidth: v })
  },
  setAnnotationLineStyle: (style) => {
    persistStrokePrefs({ lineStyle: style })
    set({ annotationLineStyle: style })
  },
  setAnnotationOpacity: (opacity) => {
    const v = Math.max(0.05, Math.min(1, opacity))
    persistStrokePrefs({ opacity: v })
    set({ annotationOpacity: v })
  },
  setAnnotationFillColor: (color) => {
    persistStrokePrefs({ fillColor: color })
    set({ annotationFillColor: color })
  },
  setAnnotationFillOpacity: (opacity) => {
    const v = Math.max(0.05, Math.min(1, opacity))
    persistStrokePrefs({ fillOpacity: v })
    set({ annotationFillOpacity: v })
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  addAnnotation: (docId, ann) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc) return state
      const before = doc.annotations
      // Sella autor y fecha en el momento de crear la marca (el panel de revisión
      // filtra y ordena por ellos); si ya vienen puestos, se respetan.
      const author = ann.author ?? (state.annotationAuthor || undefined)
      const stamped: Annotation = {
        ...ann,
        ...(author ? { author } : {}),
        layer: ann.layer || 'Marcas',
        createdAt: ann.createdAt ?? Date.now(),
      }
      const after = [...before, stamped]
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
    get().setThemePreference(theme)
  },

  // `themePreference` es lo que el usuario eligió ('system' incluido) y `theme` el
  // tema efectivo que consume la UI.
  setThemePreference: (pref) => {
    const effective = pref === 'system' ? systemTheme() : pref
    set({ themePreference: pref, theme: effective })
    try { localStorage.setItem(THEME_PREF_KEY, pref) } catch {}
    try { localStorage.setItem('pdfmaster_theme', effective) } catch {}
    document.documentElement.classList.toggle('dark', effective === 'dark')
  },

  applySystemTheme: () => {
    if (get().themePreference !== 'system') return
    const effective = systemTheme()
    set({ theme: effective })
    document.documentElement.classList.toggle('dark', effective === 'dark')
  },

  setWheelMode: (mode) => {
    set({ wheelMode: mode })
    try { localStorage.setItem(WHEEL_KEY, mode) } catch {}
  },

  setUiScale: (scale) => {
    const v = Math.max(0.75, Math.min(1.5, scale))
    set({ uiScale: v })
    try { localStorage.setItem(PREF_KEYS.uiScale, String(v)) } catch {}
    window.api.setUiZoom(v).catch(() => {})
  },

  setDefaultZoomMode: (mode) => {
    set({ defaultZoomMode: mode })
    try { localStorage.setItem(PREF_KEYS.zoomMode, mode) } catch {}
  },

  setDefaultUnit: (unit) => {
    set({ defaultUnit: unit })
    try { localStorage.setItem(PREF_KEYS.unit, unit) } catch {}
  },

  setRestoreSession: (on) => {
    set({ restoreSession: on })
    try { localStorage.setItem(PREF_KEYS.restore, on ? '1' : '0') } catch {}
  },

  setBackupOnSave: (on) => {
    set({ backupOnSave: on })
    try { localStorage.setItem(PREF_KEYS.backup, on ? '1' : '0') } catch {}
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
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.navHistoryIndex <= 0) return d
        const navHistoryIndex = d.navHistoryIndex - 1
        return { ...d, navHistoryIndex, currentPage: d.navHistory[navHistoryIndex] }
      }),
    }))
  },

  goForward: (docId) => {
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.doc_id !== docId || d.navHistoryIndex >= d.navHistory.length - 1) return d
        const navHistoryIndex = d.navHistoryIndex + 1
        return { ...d, navHistoryIndex, currentPage: d.navHistory[navHistoryIndex] }
      }),
    }))
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
  setTextStyle: (s) => set((state) => ({ textStyle: { ...state.textStyle, ...s } })),
  setSelectedImagePath: (path) => set({ selectedImagePath: path }),
  setSelectedImageData: (data) => set({ selectedImageData: data }),

  setViewerScroll: (scroll) => set({ viewerScroll: scroll }),
  setSelectedStamp: (stamp) => set({ selectedStamp: stamp }),
  setStampColor: (color) => set({ stampColor: color }),
  setStampSize: (size) => set({ stampSize: Math.max(6, Math.min(96, size)) }),

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
      newAnns[annIndex] = { ...newAnns[annIndex], ...updates, modifiedAt: Date.now() }
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: newAnns, dirty: true } : d)),
      }
    })
  },

  setAnnotationAuthor: (name) => {
    set({ annotationAuthor: name })
    try { localStorage.setItem(AUTHOR_KEY, name) } catch {}
  },

  setAnnotationStatus: (docId, annId, status) => {
    get().updateAnnotation(docId, annId, { status })
  },

  addReply: (docId, annId, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const doc = get().docs.find((d) => d.doc_id === docId)
    const ann = doc?.annotations.find((a) => a.id === annId)
    if (!ann) return
    const reply: Reply = {
      id: crypto.randomUUID(),
      author: get().annotationAuthor || undefined,
      text: trimmed,
      at: Date.now(),
    }
    get().updateAnnotation(docId, annId, { replies: [...(ann.replies || []), reply] })
  },

  deleteReply: (docId, annId, replyId) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    const ann = doc?.annotations.find((a) => a.id === annId)
    if (!ann?.replies) return
    get().updateAnnotation(docId, annId, { replies: ann.replies.filter((r) => r.id !== replyId) })
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

  // `selectedAnnotationId` es la marca "principal" (la que muestra handles y la barra
  // de propiedades) y siempre es la última de `selectedAnnotationIds`.
  selectAnnotation: (docId, annId) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return
    const exists = annId !== null && doc.annotations.some((a) => a.id === annId)
    set({
      selectedAnnotationId: exists ? annId : null,
      selectedAnnotationIds: exists ? [annId as string] : [],
    })
  },

  selectAnnotations: (docId, ids) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return
    const valid = ids.filter((id) => doc.annotations.some((a) => a.id === id))
    set({ selectedAnnotationIds: valid, selectedAnnotationId: valid.length ? valid[valid.length - 1] : null })
  },

  toggleAnnotationSelection: (docId, annId) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc || !doc.annotations.some((a) => a.id === annId)) return
    const current = get().selectedAnnotationIds
    const next = current.includes(annId) ? current.filter((id) => id !== annId) : [...current, annId]
    set({ selectedAnnotationIds: next, selectedAnnotationId: next.length ? next[next.length - 1] : null })
  },

  updateAnnotations: (docId, ids, updates) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc || ids.length === 0) return state
      const idSet = new Set(ids)
      const now = Date.now()
      const newAnns = doc.annotations.map((a) => (idSet.has(a.id) ? { ...a, ...updates, modifiedAt: now } : a))
      return { docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: newAnns, dirty: true } : d)) }
    })
  },

  // Desplaza también `points` (dibujos, polígonos, mediciones de área): mover solo
  // x/y dejaba esas marcas clavadas en su sitio.
  moveAnnotations: (docId, ids, dx, dy) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc || ids.length === 0 || (dx === 0 && dy === 0)) return state
      const idSet = new Set(ids)
      const now = Date.now()
      const newAnns = doc.annotations.map((a) => (idSet.has(a.id)
        ? {
            ...a,
            x: a.x + dx,
            y: a.y + dy,
            points: a.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            modifiedAt: now,
          }
        : a))
      return { docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: newAnns, dirty: true } : d)) }
    })
  },

  deleteAnnotations: (docId, ids) => {
    set((state) => {
      const doc = state.docs.find((d) => d.doc_id === docId)
      if (!doc || ids.length === 0) return state
      const idSet = new Set(ids)
      const before = doc.annotations
      const after = before.filter((a) => !idSet.has(a.id))
      if (after.length === before.length) return state
      return {
        docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: after, dirty: true } : d)),
        selectedAnnotationIds: state.selectedAnnotationIds.filter((id) => !idSet.has(id)),
        selectedAnnotationId: state.selectedAnnotationId && idSet.has(state.selectedAnnotationId) ? null : state.selectedAnnotationId,
        undoStack: [...state.undoStack, { docId, before, after }].slice(-100),
        redoStack: [],
      }
    })
  },

  copyAnnotations: (docId, ids) => {
    const doc = get().docs.find((d) => d.doc_id === docId)
    if (!doc) return 0
    const idSet = new Set(ids)
    const copied = doc.annotations.filter((a) => idSet.has(a.id))
    if (copied.length === 0) return 0
    set({ annotationClipboard: copied.map((a) => ({ ...a })) })
    return copied.length
  },

  // Pega en la página indicada del documento activo (sirve entre documentos: las
  // coordenadas son puntos PDF). Ids y metadatos de revisión se regeneran.
  pasteAnnotations: (docId, page, offset = 12) => {
    const state = get()
    const clip = state.annotationClipboard
    const doc = state.docs.find((d) => d.doc_id === docId)
    if (!doc || clip.length === 0) return 0
    const now = Date.now()
    const author = state.annotationAuthor || undefined
    const pasted: Annotation[] = clip.map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      page,
      x: a.x + offset,
      y: a.y + offset,
      points: a.points?.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      ...(author ? { author } : {}),
      createdAt: now,
      modifiedAt: undefined,
    }))
    const before = doc.annotations
    const after = [...before, ...pasted]
    set({
      docs: state.docs.map((d) => (d.doc_id === docId ? { ...d, annotations: after, dirty: true } : d)),
      selectedAnnotationIds: pasted.map((a) => a.id),
      selectedAnnotationId: pasted[pasted.length - 1].id,
      undoStack: [...state.undoStack, { docId, before, after }].slice(-100),
      redoStack: [],
    })
    return pasted.length
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
  selectedAnnotationIds: [],
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
  selectedAnnotationIds: [],
      }
    })
  },

  // El aviso se marca como saliente y se retira 120 ms después (lo que dura
  // `toast-out`): antes entraba animado y desaparecía de golpe.
  showToast: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => get().removeToast(id), 3000)
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 120)
  },

  setCompareDoc: (docId) => set({ compareDocId: docId, compareZoom: 1 }),
  toggleCompareMode: () => set((state) => ({ compareMode: !state.compareMode, compareZoom: 1 })),
  clearCompare: () => set({ compareMode: false, compareDocId: null, compareZoom: 1 }),
  setCompareSync: (sync) => set({ compareSync: sync }),
  setCompareZoom: (zoom) => set({ compareZoom: Math.max(0.1, Math.min(8, zoom)) }),
}))
