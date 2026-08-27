import { usePdfStore, type FitMode } from '../store/usePdfStore'
import { openDocument } from './openDocument'

export interface SessionSnapshot {
  activeFile: string | null
  docs: { file_path: string; currentPage: number; zoom: number; fitMode: string }[]
}

/** Sesión viva (se vacía al cerrar todas las pestañas) y último snapshot con
 * documentos, que es el que ofrece «Reabrir última sesión». */
const LIVE_KEY = 'pdfmaster_session'
const LAST_KEY = 'pdfmaster_session_last'

function leer(key: string): SessionSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || 'null') as SessionSnapshot | null
    return s?.docs?.length ? s : null
  } catch {
    return null
  }
}

/** Última sesión con documentos abiertos (App.tsx la persiste en cada cambio). */
export function loadLastSession(): SessionSnapshot | null {
  return leer(LAST_KEY)
}

function esModoDeAjuste(v: string): v is FitMode {
  return v === 'fit-width' || v === 'fit-page'
}

/**
 * Reabre los documentos de un snapshot respetando página y zoom. Devuelve cuántos se
 * abrieron.
 *
 * `silent` lo usa el arranque: evita los avisos y el paso por recientes de cada
 * archivo. Estaba duplicado —una copia acá y otra dentro de `App.tsx`, con su propia
 * clave— y las dos habían olvidado aplicar el `fitMode` que ambas persistían: una
 * sesión guardada en «ajustar a ancho» volvía con el zoom numérico congelado, que ya no
 * corresponde si la ventana cambió de tamaño entre sesiones.
 */
export async function reabrirSesion(
  snapshot: SessionSnapshot | null,
  opts: { silent?: boolean } = {},
): Promise<number> {
  if (!snapshot?.docs?.length) return 0
  const { setPage, setZoom, setFitMode, setActiveDoc } = usePdfStore.getState()
  const idByPath: Record<string, string> = {}
  for (const d of snapshot.docs) {
    const id = await openDocument(d.file_path, { activate: false, silent: opts.silent })
    if (!id) continue
    idByPath[d.file_path] = id
    setPage(id, d.currentPage || 0)
    if (esModoDeAjuste(d.fitMode)) {
      // El modo de ajuste se recalcula con el tamaño de ventana de AHORA.
      setFitMode(id, d.fitMode)
    } else if (typeof d.zoom === 'number' && d.zoom > 0) {
      setZoom(id, d.zoom)
    }
  }
  if (snapshot.activeFile && idByPath[snapshot.activeFile]) setActiveDoc(idByPath[snapshot.activeFile])
  return Object.keys(idByPath).length
}

/** Reabre la última sesión guardada (botón «Reabrir última sesión»). */
export async function reopenLastSession(): Promise<number> {
  return reabrirSesion(loadLastSession())
}

/** Restauración automática al arrancar: la sesión viva, sin avisos por archivo. */
export async function restoreLiveSession(): Promise<number> {
  return reabrirSesion(leer(LIVE_KEY), { silent: true })
}
