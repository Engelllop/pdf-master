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

export function loadRecents(): RecentEntry[] {
  try {
    const v2 = localStorage.getItem(KEY)
    if (v2) return JSON.parse(v2)
    // Migración del formato viejo (array de rutas)
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') as string[]
    const migrated = legacy.map((path, i) => ({ path, lastOpened: Date.now() - i }))
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
  const existing = entries.find((e) => e.path === path)
  const updated: RecentEntry = { ...existing, path, lastOpened: Date.now() }
  const rest = entries.filter((e) => e.path !== path)
  const pinned = rest.filter((e) => e.pinned)
  const unpinned = rest.filter((e) => !e.pinned)
  save(updated.pinned
    ? [updated, ...pinned, ...unpinned.slice(0, MAX_UNPINNED)]
    : [...pinned, updated, ...unpinned.slice(0, MAX_UNPINNED - 1)])
}

export function updateRecentMeta(path: string, meta: Partial<Pick<RecentEntry, 'thumb' | 'lastPage' | 'pageCount'>>) {
  save(loadRecents().map((e) => (e.path === path ? { ...e, ...meta } : e)))
}

export function setRecentPinned(path: string, pinned: boolean) {
  save(loadRecents().map((e) => (e.path === path ? { ...e, pinned } : e)))
}

export function removeRecent(path: string) {
  save(loadRecents().filter((e) => e.path !== path))
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
    const cur = byDir.get(dir)
    if (cur) {
      cur.count++
      cur.lastOpened = Math.max(cur.lastOpened, e.lastOpened)
    } else {
      byDir.set(dir, { dir, name: dir.split(/[\\/]/).pop() || dir, count: 1, lastOpened: e.lastOpened })
    }
  }
  return [...byDir.values()]
    .sort((a, b) => b.count - a.count || b.lastOpened - a.lastOpened)
    .slice(0, max)
}
