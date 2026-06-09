import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

// Local error telemetry: forward uncaught errors to the main process log file
// so silent failures (like the original two-PDF bug) leave a trace.
window.addEventListener('error', (e) => {
  try { window.api.logError(`error: ${e.message} @ ${e.filename}:${e.lineno}`) } catch {}
})
window.addEventListener('unhandledrejection', (e) => {
  try { window.api.logError(`unhandledrejection: ${String((e as PromiseRejectionEvent).reason)}`) } catch {}
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
