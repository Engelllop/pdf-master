import { usePdfStore } from '../store/usePdfStore'
import { openDocument } from './openDocument'

export interface SessionSnapshot {
  activeFile: string | null
  docs: { file_path: string; currentPage: number; zoom: number; fitMode: string }[]
}

const LAST_KEY = 'pdfmaster_session_last'

/** Última sesión con documentos abiertos (App.tsx la persiste en cada cambio). */
export function loadLastSession(): SessionSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(LAST_KEY) || 'null') as SessionSnapshot | null
    return s?.docs?.length ? s : null
  } catch {
    return null
  }
}

/** Reabre la última sesión respetando página y zoom. Devuelve cuántos se abrieron. */
export async function reopenLastSession(): Promise<number> {
  const session = loadLastSession()
  if (!session) return 0
  const { setPage, setZoom, setActiveDoc } = usePdfStore.getState()
  const idByPath: Record<string, string> = {}
  for (const d of session.docs) {
    const id = await openDocument(d.file_path, { activate: false })
    if (id) {
      idByPath[d.file_path] = id
      setPage(id, d.currentPage || 0)
      if (typeof d.zoom === 'number' && d.zoom > 0) setZoom(id, d.zoom)
    }
  }
  if (session.activeFile && idByPath[session.activeFile]) setActiveDoc(idByPath[session.activeFile])
  return Object.keys(idByPath).length
}
