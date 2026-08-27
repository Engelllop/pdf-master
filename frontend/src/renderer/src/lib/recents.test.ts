import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearUnpinnedRecents, frequentFolders, fusionarDuplicados, loadRecents,
  removeRecent, setRecentPinned, touchRecent, updateRecentMeta, type RecentEntry,
} from './recents'

const KEY = 'pdfmaster_recent_v2'
const guardar = (entries: RecentEntry[]) => localStorage.setItem(KEY, JSON.stringify(entries))
const rutas = () => loadRecents().map((e) => e.path)

beforeEach(() => { localStorage.clear() })

// Las rutas llegan del cuadro de abrir, de la sesión guardada, de arrastrar y soltar y
// de la línea de comandos, y no coinciden en el formato. Comparándolas como cadenas, el
// mismo plano salía dos veces, cada copia con su miniatura y su chincheta.
describe('el mismo archivo escrito distinto es UNA entrada', () => {
  it('abrirlo con otras barras y mayúsculas no lo duplica', () => {
    guardar([{ path: 'C:/planos/a.pdf', lastOpened: 1000 }])
    touchRecent('C:\\Planos\\A.pdf')
    expect(rutas()).toHaveLength(1)
  })

  it('la entrada se queda con la ruta del último abierto', () => {
    guardar([{ path: 'C:/planos/a.pdf', lastOpened: 1000 }])
    touchRecent('C:\\Planos\\A.pdf')
    expect(rutas()[0]).toBe('C:\\Planos\\A.pdf')
  })

  it('fusionar conserva chincheta, miniatura y página', () => {
    const fusionadas = fusionarDuplicados([
      { path: 'C:/planos/a.pdf', lastOpened: 1000, pinned: true, thumb: 'data:img', pageCount: 12 },
      { path: 'c:\\PLANOS\\a.PDF', lastOpened: 2000, lastPage: 7 },
    ])
    expect(fusionadas).toHaveLength(1)
    expect(fusionadas[0]).toMatchObject({
      path: 'c:\\PLANOS\\a.PDF', lastOpened: 2000, pinned: true,
      thumb: 'data:img', lastPage: 7, pageCount: 12,
    })
  })

  it('archivos distintos no se fusionan', () => {
    const fusionadas = fusionarDuplicados([
      { path: 'C:/planos/a.pdf', lastOpened: 1 },
      { path: 'C:/planos/b.pdf', lastOpened: 2 },
    ])
    expect(fusionadas).toHaveLength(2)
  })

  it('las que ya estaban duplicadas se juntan al cargar', () => {
    guardar([
      { path: 'C:/planos/a.pdf', lastOpened: 1000, pinned: true },
      { path: 'C:\\planos\\a.pdf', lastOpened: 2000, lastPage: 3 },
    ])
    const cargadas = loadRecents()
    expect(cargadas).toHaveLength(1)
    expect(cargadas[0].pinned).toBe(true)
    expect(cargadas[0].lastPage).toBe(3)
  })

  it('marcar, actualizar y borrar aciertan con la otra escritura', () => {
    guardar([{ path: 'C:/planos/a.pdf', lastOpened: 1000 }])
    setRecentPinned('C:\\Planos\\A.pdf', true)
    expect(loadRecents()[0].pinned).toBe(true)
    updateRecentMeta('c:/PLANOS/a.pdf', { lastPage: 5 })
    expect(loadRecents()[0].lastPage).toBe(5)
    removeRecent('C:\\planos\\a.PDF')
    expect(loadRecents()).toHaveLength(0)
  })
})

describe('orden y tope', () => {
  it('las fijadas van primero y no se pierden al limpiar', () => {
    guardar([
      { path: 'C:/a.pdf', lastOpened: 1, pinned: true },
      { path: 'C:/b.pdf', lastOpened: 2 },
    ])
    touchRecent('C:/c.pdf')
    expect(rutas()[0]).toBe('C:/a.pdf')
    clearUnpinnedRecents()
    expect(rutas()).toEqual(['C:/a.pdf'])
  })

  it('las no fijadas se recortan al tope', () => {
    guardar(Array.from({ length: 20 }, (_, i) => ({ path: `C:/p${i}.pdf`, lastOpened: i })))
    touchRecent('C:/nuevo.pdf')
    expect(loadRecents().length).toBeLessThanOrEqual(15)
    expect(rutas()).toContain('C:/nuevo.pdf')
  })
})

describe('carpetas frecuentes', () => {
  // La misma carpeta escrita distinto salía dos veces, con la mitad de cuenta cada una.
  it('la misma carpeta cuenta una vez', () => {
    guardar([
      { path: 'C:/planos/a.pdf', lastOpened: 3 },
      { path: 'C:\\Planos\\b.pdf', lastOpened: 2 },
      { path: 'c:/planos/c.pdf', lastOpened: 1 },
      { path: 'D:/otros/d.pdf', lastOpened: 4 },
    ])
    const carpetas = frequentFolders()
    expect(carpetas).toHaveLength(2)
    expect(carpetas[0].count).toBe(3)
    expect(carpetas[0].name.toLowerCase()).toBe('planos')
  })
})
