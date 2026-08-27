import { describe, it, expect, beforeEach, vi } from 'vitest'

// Los marcadores se persisten en localStorage pero iban indexados por `doc_id`, que el
// motor asigna en cada sesión: al reabrir la app el archivo tenía otro id y ningún
// marcador volvía a aparecer — se guardaban para siempre y no se veían nunca.

/** Store recién importado, para probar lo que se lee de localStorage al arrancar. */
async function storeReciente() {
  vi.resetModules()
  const mod = await import('./usePdfStore')
  return mod.usePdfStore
}

beforeEach(() => {
  localStorage.clear()
})

describe('los marcadores sobreviven al reinicio', () => {
  it('se leen de localStorage al arrancar', async () => {
    localStorage.setItem('pdfmaster_bookmarks', JSON.stringify([
      { id: 'b1', filePath: 'C:/planos/a.pdf', page: 3, label: 'Página 4' },
    ]))
    const store = await storeReciente()
    expect(store.getState().bookmarks).toEqual([
      { id: 'b1', filePath: 'C:/planos/a.pdf', page: 3, label: 'Página 4' },
    ])
  })

  it('añadir escribe en localStorage con la ruta del archivo', async () => {
    const store = await storeReciente()
    store.getState().addBookmark({ id: 'b1', filePath: 'C:/planos/a.pdf', page: 3, label: 'Página 4' })
    const guardado = JSON.parse(localStorage.getItem('pdfmaster_bookmarks') || '[]')
    expect(guardado).toHaveLength(1)
    expect(guardado[0].filePath).toBe('C:/planos/a.pdf')
    expect(guardado[0]).not.toHaveProperty('docId')
  })

  it('borrar lo quita también de localStorage', async () => {
    const store = await storeReciente()
    store.getState().addBookmark({ id: 'b1', filePath: 'C:/planos/a.pdf', page: 3, label: 'x' })
    store.getState().addBookmark({ id: 'b2', filePath: 'C:/planos/a.pdf', page: 8, label: 'y' })
    store.getState().removeBookmark('b1')
    const guardado = JSON.parse(localStorage.getItem('pdfmaster_bookmarks') || '[]')
    expect(guardado.map((b: { id: string }) => b.id)).toEqual(['b2'])
  })

  // Los de versiones viejas no se pueden recuperar: no dicen a qué archivo apuntaban.
  // Ya eran invisibles, así que se descartan en vez de acumularse.
  it('descarta los que venían indexados por doc_id', async () => {
    localStorage.setItem('pdfmaster_bookmarks', JSON.stringify([
      { id: 'viejo', docId: 'sesion-muerta', page: 0, label: 'no se puede mapear' },
      { id: 'nuevo', filePath: 'C:/planos/a.pdf', page: 1, label: 'ok' },
    ]))
    const store = await storeReciente()
    expect(store.getState().bookmarks.map((b) => b.id)).toEqual(['nuevo'])
  })

  it('un localStorage corrupto no rompe el arranque', async () => {
    localStorage.setItem('pdfmaster_bookmarks', '{no es json')
    const store = await storeReciente()
    expect(store.getState().bookmarks).toEqual([])
  })

  it('un valor que no es lista tampoco', async () => {
    localStorage.setItem('pdfmaster_bookmarks', '{"a":1}')
    const store = await storeReciente()
    expect(store.getState().bookmarks).toEqual([])
  })
})
