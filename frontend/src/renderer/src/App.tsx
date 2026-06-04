import { useEffect, useState } from 'react'
import { usePdfStore } from './store/usePdfStore'
import Toolbar from './components/Toolbar'
import ThumbnailPanel from './components/ThumbnailPanel'
import Viewer from './components/Viewer'
import ToolsPanel from './components/ToolsPanel'
import StatusBar from './components/StatusBar'
import Toasts from './components/Toasts'
import ComparisonView from './components/ComparisonView'

const API_BASE = 'http://localhost:8745'

function App() {
  const store = usePdfStore()
  const { theme, readingMode, compareMode } = store
  const [backendOk, setBackendOk] = useState(true)

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // Health check with auto-restart
  useEffect(() => {
    let failCount = 0
    const check = () => {
      fetch(`${API_BASE}/pdf/health`, { method: 'GET', signal: AbortSignal.timeout(5000) })
        .then((r) => {
          if (r.ok) {
            failCount = 0
            setBackendOk(true)
          } else {
            failCount++
            if (failCount >= 2) setBackendOk(false)
            if (failCount >= 3) {
              console.warn('[App] Health check failed 3 times — restarting backend...')
              window.api.restartBackend().then((res: { success: boolean }) => {
                if (res.success) {
                  // Give backend time to start before next check
                  setTimeout(() => { failCount = 0 }, 3000)
                }
              })
            }
          }
        })
        .catch(() => {
          failCount++
          if (failCount >= 2) setBackendOk(false)
          if (failCount >= 3) {
            console.warn('[App] Health check unreachable 3 times — restarting backend...')
            window.api.restartBackend().then((res: { success: boolean }) => {
              if (res.success) {
                setTimeout(() => { failCount = 0 }, 3000)
              }
            })
          }
        })
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey
      if (!isMeta) return

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault()
          // Trigger save via custom event or direct call
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
        case 'w':
          e.preventDefault()
          {
            const activeDocId = store.activeDocId
            if (activeDocId) store.closeDoc(activeDocId)
          }
          break
        case '=':
        case '+':
          e.preventDefault()
          {
            const doc = store.docs.find((d) => d.doc_id === store.activeDocId)
            if (doc) store.setZoom(doc.doc_id, doc.zoom + 0.15)
          }
          break
        case '-':
          e.preventDefault()
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
  }, [store])

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden transition-colors ${theme === 'dark' ? 'bg-slate-900' : 'bg-gray-100'}`}>
      {!backendOk && (
        <div className="bg-red-600 text-white text-xs text-center py-1 px-3 font-medium">
          ⚠ Motor PDF desconectado — Guarda tu trabajo y reinicia la aplicación
        </div>
      )}
      {!readingMode && <Toolbar />}
      {compareMode ? (
        <div className="flex-1 flex overflow-hidden">
          <ComparisonView />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {!readingMode && <ThumbnailPanel />}
          <Viewer />
          {!readingMode && <ToolsPanel />}
        </div>
      )}
      {!readingMode && <StatusBar />}
      <Toasts />
    </div>
  )
}

export default App
