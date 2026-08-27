import { mismaRuta, normalizarRuta } from './rutas'

export interface RecentEntry {
  path: string
  lastOpened: number
  pinned?: boolean
  thumb?: string // miniatura de la 1ª página (JPEG data-URL pequeña, ~5 KB)
  lastPage?: number // 0-based, para "continuar donde quedaste"
  pageCount?: number
}

const KEY = 'pdfmaster_recent_v2'
const LEGACY_KEY = 'pdfmaster_recent'
const MAX_UNPINNED = 15

/** Junta las entradas que son el MISMO archivo escrito distinto. Las rutas llegan de
 * sitios que no coinciden en el formato —el cuadro de abrir, la sesión guardada,
 * arrastrar y soltar, los argumentos de la línea de comandos—, y comparándolas como
 * cadenas el mismo plano salía dos veces en la lista, cada copia con su miniatura, su
 * «continuar en pág. X» y su chincheta. Se conserva la ruta tal como la escribió el
 * usuario (es la que se abre); solo la COMPARACIÓN ignora mayúsculas y barras. */
export function fusionarDuplicados(entries: RecentEntry[]): RecentEntry[] {
  const porRuta = new Map<string, RecentEntry>()
  for (const e of entries) {
    if (!e?.path) continue
    const clave = normalizarRuta(e.path)
    const previa = porRuta.get(clave)
    if (!previa) { porRuta.set(clave, e); continue }
    // Gana la más reciente para la ruta y la página; lo demás se rellena con lo que
    // haya, que perder la miniatura o la chincheta al fusionar sería un paso atrás.
    const nueva = e.lastOpened > previa.lastOpened ? e : previa
    const vieja = nueva === e ? previa : e
    porRuta.set(clave, {
      ...vieja, ...nueva,
      pinned: previa.pinned || e.pinned || undefined,
      thumb: nueva.thumb ?? vieja.thumb,
      lastPage: nueva.lastPage ?? vieja.lastPage,
      pageCount: nueva.pageCount ?? vieja.pageCount,
    })
  }
  return [...porRuta.values()]
}

export function loadRecents(): RecentEntry[] {
  try {
    const v2 = localStorage.getItem(KEY)
    if (v2) {
      const guardadas = JSON.parse(v2)
      return Array.isArray(guardadas) ? fusionarDuplicados(guardadas) : []
    }
    // Migración del formato viejo (array de rutas)
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') as string[]
    const migrated = fusionarDuplicados(legacy.map((path, i) => ({ path, lastOpened: Date.now() - i })))
    if (migrated.length > 0) save(migrated)
    return migrated
  } catch {
    return []
  }
}

function save(entries: RecentEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Cuota llena (miniaturas): reintenta sin thumbs antes de rendirse.
    try { localStorage.setItem(KEY, JSON.stringify(entries.map(({ thumb: _t, ...e }) => e))) } catch {}
  }
}

export function touchRecent(path: string) {
  const entries = loadRecents()
  const existing = entries.find((e) => mismaRuta(e.path, path))
  const updated: RecentEntry = { ...existing, path, lastOpened: Date.now() }
  const rest = entries.filter((e) => !mismaRuta(e.path, path))
  const pinned = rest.filter((e) => e.pinned)
  const unpinned = rest.filter((e) => !e.pinned)
  save(updated.pinned
    ? [updated, ...pinned, ...unpinned.slice(0, MAX_UNPINNED)]
    : [...pinned, updated, ...unpinned.slice(0, MAX_UNPINNED - 1)])
}

export function updateRecentMeta(path: string, meta: Partial<Pick<RecentEntry, 'thumb' | 'lastPage' | 'pageCount'>>) {
  save(loadRecents().map((e) => (mismaRuta(e.path, path) ? { ...e, ...meta } : e)))
}

export function setRecentPinned(path: string, pinned: boolean) {
  save(loadRecents().map((e) => (mismaRuta(e.path, path) ? { ...e, pinned } : e)))
}

export function removeRecent(path: string) {
  save(loadRecents().filter((e) => !mismaRuta(e.path, path)))
}

export function clearUnpinnedRecents() {
  save(loadRecents().filter((e) => e.pinned))
}

export interface FrequentFolder {
  dir: string
  name: string
  count: number
  lastOpened: number
}

// Carpetas más usadas, derivadas de los recientes (frecuencia y recencia).
export function frequentFolders(max = 4): FrequentFolder[] {
  const byDir = new Map<string, FrequentFolder>()
  for (const e of loadRecents()) {
    const dir = e.path.replace(/[\\/][^\\/]*$/, '')
    if (!dir) continue
    // Por archivo, no por cadena: `C:\Planos` y `c:/planos` son la misma carpeta y
    // salían como dos «carpetas frecuentes» con la mitad de cuenta cada una.
    const cur = byDir.get(normalizarRuta(dir))
    if (cur) {
      cur.count++
      cur.lastOpened = Math.max(cur.lastOpened, e.lastOpened)
    } else {
      byDir.set(normalizarRuta(dir), { dir, name: dir.split(/[\\/]/).pop() || dir, count: 1, lastOpened: e.lastOpened })
    }
  }
  return [...byDir.values()]
    .sort((a, b) => b.count - a.count || b.lastOpened - a.lastOpened)
    .slice(0, max)
}
