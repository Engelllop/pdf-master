import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { usePdfStore } from './store/usePdfStore'
import { useStoreSlice } from './hooks/useStoreSlice'
import TopBar from './components/TopBar'
import Toolbar from './components/Toolbar'
import ThumbnailPanel from './components/ThumbnailPanel'
import Viewer from './components/Viewer'
import StatusBar from './components/StatusBar'
import Toasts from './components/Toasts'
import ComparisonView from './components/ComparisonView'
import PresentationView from './components/PresentationView'
import ContinuousView from './components/ContinuousView'
import FloatingViewBar from './components/FloatingViewBar'
import ShortcutsModal from './components/ShortcutsModal'
import SettingsModal from './components/SettingsModal'
import AIPanel from './components/AIPanel'
import { useFormModal } from './components/FormModal'
import { registerPromptHandler } from './lib/uiPrompt'
import { openDocument } from './lib/openDocument'
import { requestCloseDoc } from './lib/closeDocument'
import { updateRecentMeta } from './lib/recents'
import { TOOL_KEYS } from './lib/tools'
import CalibrationBanner from './components/CalibrationBanner'
import ProgressBar from './components/ProgressBar'
import CommandPalette from './components/CommandPalette'
import StampSignatureManager from './components/StampSignatureManager'
import PageOrganizer from './components/PageOrganizer'
import UnsavedDialog from './components/UnsavedDialog'

import { apiFetch } from './lib/api'

function App() {
  const store = useStoreSlice(
    'theme', 'readingMode', 'compareMode', 'presentationMode', 'continuousMode',
    'docs', 'activeDocId', 'toggleReadingMode', 'setActiveDoc', 'nextPage', 'prevPage',
    'setPage', 'toggleSidebar', 'setZoom', 'setFitMode',
    'activeTool', 'setActiveTool', 'setActiveRibbon', 'compareZoom', 'setCompareZoom',
  )
  const { theme, readingMode, compareMode, presentationMode, continuousMode } = store
  const [backendOk, setBackendOk] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showStamps, setShowStamps] = useState(false)
  const [showOrganizer, setShowOrganizer] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const { askForm, askConfirm, formModal } = useFormModal()

  useEffect(() => { registerPromptHandler({ askForm, askConfirm }) }, [askForm, askConfirm])

  useEffect(() => {
    const onOpen = (e: Event) => {
      setAiOpen(true)
      const preset = (e as CustomEvent).detail?.preset as string | undefined
      if (preset) setTimeout(() => window.dispatchEvent(new CustomEvent('app:ai-preset', { detail: { preset } })), 80)
    }
    window.addEventListener('app:ai-open', onOpen as EventListener)
    return () => window.removeEventListener('app:ai-open', onOpen as EventListener)
  }, [])

  // Panel de atajos: F1 lo abre/cierra; Esc lo cierra; la toolbar lo abre por evento.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        setShowShortcuts((s) => !s)
      } else if (e.key === 'Escape') {
        setShowShortcuts(false)
        setShowSettings(false)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette((s) => !s)
      }
    }
    const onOpen = () => setShowShortcuts(true)
    const onSettings = () => setShowSettings(true)
    const onStamps = () => setShowStamps(true)
    const onOrganizer = () => setShowOrganizer(true)
    window.addEventListener('app:page-organizer', onOrganizer as EventListener)
    window.addEventListener('keydown', onKey)
    window.addEventListener('app:show-shortcuts', onOpen as EventListener)
    window.addEventListener('app:show-settings', onSettings as EventListener)
    window.addEventListener('app:show-stamps', onStamps as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('app:show-shortcuts', onOpen as EventListener)
      window.removeEventListener('app:show-settings', onSettings as EventListener)
      window.removeEventListener('app:show-stamps', onStamps as EventListener)
      window.removeEventListener('app:page-organizer', onOrganizer as EventListener)
    }
  }, [])

  // Autor por defecto de las marcas: el usuario de Windows, hasta que se cambie en Ajustes.
  useEffect(() => {
    if (usePdfStore.getState().annotationAuthor) return
    window.api.osUsername()
      .then((name) => { if (name) usePdfStore.getState().setAnnotationAuthor(name) })
      .catch(() => {})
  }, [])

  // Escalado de interfaz guardado: hay que reaplicarlo en cada arranque de ventana.
  useEffect(() => {
    const scale = usePdfStore.getState().uiScale
    if (scale !== 1) window.api.setUiZoom(scale).catch(() => {})
  }, [])

  // Tema "seguir al sistema": reacciona a los cambios de Windows en caliente.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => usePdfStore.getState().applySystemTheme()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      window.api.setTitleOverlay({ color: '#1e293b', symbolColor: '#e2e8f0' })
    } else {
      document.documentElement.classList.remove('dark')
      window.api.setTitleOverlay({ color: '#ffffff', symbolColor: '#1f2329' })
    }
  }, [theme])

  // Informa al main process si hay cambios sin guardar, para que al cerrar la
  // ventana pregunte antes de descartarlos.
  useEffect(() => {
    window.api.setDirtyState(store.docs.some((d) => d.dirty))
  }, [store.docs])

  // Persist the open-document session (paths + page + zoom) so it survives restarts.
  useEffect(() => {
    try {
      const session = {
        activeFile: store.docs.find((d) => d.doc_id === store.activeDocId)?.file_path ?? null,
        docs: store.docs.map((d) => ({
          file_path: d.file_path,
          currentPage: d.currentPage,
          zoom: d.zoom,
          fitMode: d.fitMode,
        })),
      }
      localStorage.setItem('pdfmaster_session', JSON.stringify(session))
      // Snapshot de la última sesión con documentos, para "Reabrir última sesión"
      // (pdfmaster_session queda vacía al cerrar todas las pestañas).
      if (session.docs.length > 0) localStorage.setItem('pdfmaster_session_last', JSON.stringify(session))
    } catch {}
  }, [store.docs, store.activeDocId])

  // Al salir de la app, guarda la última página leída de cada doc abierto
  // ("continuar en pág. X" en recientes; el cierre de pestaña ya lo hace).
  useEffect(() => {
    const onUnload = () => {
      for (const d of usePdfStore.getState().docs) {
        updateRecentMeta(d.file_path, { lastPage: d.currentPage, pageCount: d.page_count })
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Restore the previous session on startup (only if nothing was opened via file association).
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!usePdfStore.getState().restoreSession) return
      if (usePdfStore.getState().docs.length > 0) return
      let session: { activeFile: string | null; docs: { file_path: string; currentPage: number; zoom: number; fitMode: string }[] } | null = null
      try { session = JSON.parse(localStorage.getItem('pdfmaster_session') || 'null') } catch {}
      if (!session?.docs?.length) return
      const { setPage, setZoom, setActiveDoc } = usePdfStore.getState()
      const idByPath: Record<string, string> = {}
      for (const d of session.docs) {
        const id = await openDocument(d.file_path, { silent: true, activate: false })
        if (id) {
          idByPath[d.file_path] = id
          setPage(id, d.currentPage || 0)
          if (typeof d.zoom === 'number' && d.zoom > 0) setZoom(id, d.zoom)
        }
      }
      if (session.activeFile && idByPath[session.activeFile]) setActiveDoc(idByPath[session.activeFile])
    }, 600)
    return () => clearTimeout(t)
  }, [])

  // Health check with auto-restart + document recovery.
  // The backend keeps documents only in memory, so a restart loses every open doc.
  // We therefore (1) use a generous timeout so a busy render isn't mistaken for a
  // crash, (2) only restart after several consecutive failures, and (3) re-open the
  // documents that were open so their pages don't 404 forever after a real restart.
  useEffect(() => {
    let failCount = 0
    let restarting = false

    const recoverDocuments = async () => {
      const prev = usePdfStore.getState().docs.map((d) => ({
        doc_id: d.doc_id,
        file_path: d.file_path,
        currentPage: d.currentPage,
        annotations: d.annotations,
      }))
      const { closeDoc, setPage, setAnnotations } = usePdfStore.getState()
      for (const d of prev) {
        const newId = await openDocument(d.file_path, { silent: true, activate: false })
        if (newId) {
          setPage(newId, d.currentPage)
          if (d.annotations.length > 0) setAnnotations(newId, d.annotations)
        }
        closeDoc(d.doc_id) // drop the now-dead doc_id (backend 404 is ignored)
      }
    }

    const onUnhealthy = () => {
      failCount++
      if (failCount >= 3) setBackendOk(false)
      if (failCount >= 5 && !restarting) {
        restarting = true
        console.warn('[App] Health check failed 5 times — restarting backend...')
        window.api.restartBackend().then(async (res: { success: boolean }) => {
          if (res.success) {
            // Give backend time to bind the port before recovering / re-checking
            await new Promise((r) => setTimeout(r, 3000))
            await recoverDocuments().catch(() => {})
          }
          failCount = 0
          restarting = false
        }).catch(() => { restarting = false })
      }
    }

    const check = () => {
      if (restarting) return
      apiFetch(`/pdf/health`, { method: 'GET', signal: AbortSignal.timeout(12000) })
        .then((r) => {
          if (r.ok) {
            failCount = 0
            setBackendOk(true)
          } else {
            onUnhealthy()
          }
        })
        .catch(() => { onUnhealthy() })
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && readingMode) {
        e.preventDefault()
        store.toggleReadingMode()
        return
      }
      const isMeta = e.ctrlKey || e.metaKey

      // Ctrl+Tab / Ctrl+Shift+Tab: cycle between open documents
      if (isMeta && e.key === 'Tab') {
        e.preventDefault()
        const ds = store.docs
        if (ds.length > 1) {
          const idx = ds.findIndex((d) => d.doc_id === store.activeDocId)
          const next = e.shiftKey ? (idx - 1 + ds.length) % ds.length : (idx + 1) % ds.length
          store.setActiveDoc(ds[next].doc_id)
        }
        return
      }

      // Ctrl+1..8 jump to that tab; Ctrl+9 jumps to the last tab.
      if (isMeta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const ds = store.docs
        if (ds.length > 0) {
          e.preventDefault()
          const target = e.key === '9' ? ds[ds.length - 1] : ds[Math.min(parseInt(e.key) - 1, ds.length - 1)]
          if (target) store.setActiveDoc(target.doc_id)
          return
        }
      }

      // Navigation keys (work even without meta). Con marcas seleccionadas las
      // flechas las desplazan (useKeyboardShortcuts), así que aquí no navegan.
      const activeDoc = store.docs.find((d) => d.doc_id === store.activeDocId)
      const hasSelection = usePdfStore.getState().selectedAnnotationIds.length > 0
      if (!isMeta && activeDoc && !(hasSelection && e.key.startsWith('Arrow'))) {
        switch (e.key) {
          case 'ArrowDown':
          case 'PageDown':
            e.preventDefault()
            store.nextPage(activeDoc.doc_id)
            break
          case 'ArrowUp':
          case 'PageUp':
            e.preventDefault()
            store.prevPage(activeDoc.doc_id)
            break
          case 'Home':
            e.preventDefault()
            store.setPage(activeDoc.doc_id, 0)
            break
          case 'End':
            e.preventDefault()
            store.setPage(activeDoc.doc_id, activeDoc.page_count - 1)
            break
        }
      }

      // Herramientas con una sola tecla (V, H, R, M…). Solo en el visor de página
      // única: el modo continuo y la comparación no dibujan.
      if (!isMeta && activeDoc && !compareMode && !presentationMode && !continuousMode) {
        const target = e.target as HTMLElement
        const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        const tool = TOOL_KEYS[(e.shiftKey ? 'shift+' : '') + e.key.toLowerCase()]
        if (!isEditing && tool) {
          e.preventDefault()
          store.setActiveTool(store.activeTool === tool ? null : tool)
          store.setActiveRibbon('comment')
          return
        }
      }

      if (!isMeta) return

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('app:shortcut-save'))
          break
        case 'o':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('app:shortcut-open'))
          break
        case 'f':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('app:shortcut-search'))
          break
        case 'p':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('app:shortcut-print'))
          break
        case 'w':
          e.preventDefault()
          {
            const activeDocId = store.activeDocId
            if (activeDocId) requestCloseDoc(activeDocId)
          }
          break
        case 'l':
          if (e.shiftKey) {
            e.preventDefault()
            store.toggleSidebar()
          }
          break
        case '=':
        case '+':
          e.preventDefault()
          if (compareMode) { store.setCompareZoom(store.compareZoom + 0.2); break }
          {
            const doc = store.docs.find((d) => d.doc_id === store.activeDocId)
            if (doc) store.setZoom(doc.doc_id, doc.zoom + 0.15)
          }
          break
        case '-':
          e.preventDefault()
          if (compareMode) { store.setCompareZoom(store.compareZoom - 0.2); break }
          {
            const doc = store.docs.find((d) => d.doc_id === store.activeDocId)
            if (doc) store.setZoom(doc.doc_id, doc.zoom - 0.15)
          }
          break
        case '0':
          e.preventDefault()
          {
            const doc = store.docs.find((d) => d.doc_id === store.activeDocId)
            if (doc) {
              store.setZoom(doc.doc_id, 1)
              store.setFitMode(doc.doc_id, 'custom')
            }
          }
          break
      }
      // Fullscreen toggle (F11)
      if (e.key === 'F11') {
        e.preventDefault()
        window.api.toggleFullscreen()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [store, readingMode])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden transition-colors bg-surface">
      {!backendOk && (
        <div className="bg-danger text-white text-mini text-center py-1 px-3 font-medium flex items-center justify-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          Motor PDF desconectado — Guarda tu trabajo y reinicia la aplicación
        </div>
      )}
      {!readingMode && <TopBar />}
      <div className="flex-1 flex overflow-hidden">
        {!readingMode && !compareMode && <ThumbnailPanel />}
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {!readingMode && <Toolbar />}
          {compareMode ? (
            <div className="flex-1 flex overflow-hidden"><ComparisonView /></div>
          ) : (
            continuousMode ? <ContinuousView /> : <Viewer />
          )}
          {!readingMode && !compareMode && <CalibrationBanner />}
          <ProgressBar />
          {!readingMode && !compareMode && <FloatingViewBar />}
          {!readingMode && <StatusBar />}
        </div>
        {!readingMode && aiOpen && <AIPanel onClose={() => setAiOpen(false)} />}
      </div>
      <Toasts />
      <UnsavedDialog />
      {formModal}
      {presentationMode && <PresentationView />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {showStamps && <StampSignatureManager onClose={() => setShowStamps(false)} />}
      {showOrganizer && <PageOrganizer onClose={() => setShowOrganizer(false)} />}
    </div>
  )
}

export default App
