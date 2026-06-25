import { usePdfStore } from '../store/usePdfStore'
import { askForm } from './uiPrompt'

const API_BASE = 'http://localhost:8745'

export interface OpenDocumentOptions {
  password?: string
  activate?: boolean // reserved; addDoc already activates the new doc
  silent?: boolean // suppress recents + toasts (used when re-opening after a backend restart)
}

// Serialize all opens through a single chain. When a tool like PDF Creator opens 60+
// plans at once, firing 60 concurrent open+annotations+outline+render bursts exhausts
// the browser's connection pool and overwhelms the single backend ("Failed to fetch",
// engine restart). Processing them one at a time keeps the app responsive.
let openChain: Promise<unknown> = Promise.resolve()

// Bulk opens (60+ plans) that fail would otherwise spam one error toast per file.
// Coalesce failures within a short window into a single toast.
let failCount = 0
let failTimer: ReturnType<typeof setTimeout> | null = null
function reportOpenFailure() {
  failCount++
  if (failTimer) clearTimeout(failTimer)
  failTimer = setTimeout(() => {
    const { showToast } = usePdfStore.getState()
    showToast(failCount === 1 ? 'No se pudo abrir el PDF' : `No se pudieron abrir ${failCount} PDFs`, 'error')
    failCount = 0
    failTimer = null
  }, 600)
}

// Reabre un documento cuyo doc_id murió (el motor se reinició pero el health-check
// nunca falló, p.ej. otro proceso lo reemplazó) y remapea el id conservando el
// estado local. Se dispara al detectar un 404 en page-info/page-image.
const reopening = new Set<string>()
export async function reopenDeadDoc(docId: string): Promise<string | null> {
  const { docs, remapDocId } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc || reopening.has(docId)) return null
  reopening.add(docId)
  try {
    const res = await fetch(`${API_BASE}/pdf/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: doc.file_path }),
    })
    if (!res.ok) return null
    const data = await res.json()
    remapDocId(docId, data.doc_id)
    return data.doc_id
  } catch {
    return null
  } finally {
    reopening.delete(docId)
  }
}

export function openDocument(filePath: string, opts: OpenDocumentOptions = {}): Promise<string | null> {
  const run = () => openDocumentImpl(filePath, opts)
  const result = openChain.then(run, run)
  openChain = result.catch(() => {})
  return result
}

/**
 * Single entry point for opening a PDF. Every caller (toolbar button, drag & drop,
 * file association, recent files, backend-restart recovery) goes through here so that
 * annotations, outline and the recents list stay consistent.
 * Returns the new doc_id, or null on failure / cancelled password prompt.
 */
async function openDocumentImpl(filePath: string, opts: OpenDocumentOptions): Promise<string | null> {
  const { addDoc, setAnnotations, setOutline, showToast } = usePdfStore.getState()
  try {
    const res = await fetch(`${API_BASE}/pdf/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, password: opts.password }),
    })

    if (res.status === 401) {
      const v = await askForm('PDF protegido', [{ name: 'pwd', label: 'Este PDF requiere contraseña', type: 'password', defaultValue: '' }], 'Abrir')
      const pwd = v ? String(v.pwd) : ''
      if (pwd) return openDocumentImpl(filePath, { ...opts, password: pwd })
      showToast('Se requiere contraseña para abrir el PDF', 'error')
      return null
    }
    if (!res.ok) throw new Error('Error abriendo PDF')

    const data = await res.json()
    const docId = addDoc(data, opts.activate !== false)

    // Load persisted annotations + outline (best-effort, non-blocking failures)
    try {
      const annRes = await fetch(`${API_BASE}/pdf/annotations/${docId}`)
      if (annRes.ok) {
        const annData = await annRes.json()
        setAnnotations(docId, annData.annotations || [])
      }
    } catch {}
    try {
      const outlineRes = await fetch(`${API_BASE}/pdf/outline/${docId}`)
      if (outlineRes.ok) {
        const outlineData = await outlineRes.json()
        setOutline(docId, outlineData || [])
      }
    } catch {}

    if (!opts.silent) {
      try {
        const recents = JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[]
        const updated = [filePath, ...recents.filter((p) => p !== filePath)].slice(0, 10)
        localStorage.setItem('pdfmaster_recent', JSON.stringify(updated))
      } catch {}
    }
    return docId
  } catch {
    if (!opts.silent) reportOpenFailure()
    return null
  }
}
