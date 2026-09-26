import { describe, it, expect, vi, beforeEach } from 'vitest'

const abiertos: { path: string; silent?: boolean }[] = []
vi.mock('./openDocument', () => ({
  openDocument: vi.fn(async (path: string, opts?: { silent?: boolean }) => {
    abiertos.push({ path, silent: opts?.silent })
    return path.includes('borrado') ? null : `id-${path}`
  }),
}))

import { avisoDeNoReabiertos, esErrorDeCuota, reabrirSesion, loadLastSession, restoreLiveSession, type SessionSnapshot } from './session'
import { usePdfStore } from '../store/usePdfStore'

const initial = usePdfStore.getState()

const snapshot = (docs: SessionSnapshot['docs'], activeFile: string | null = null): SessionSnapshot =>
  ({ activeFile, docs })

beforeEach(() => {
  usePdfStore.setState(initial, true)
  localStorage.clear()
  abiertos.length = 0
  // Los documentos tienen que existir en el store para que setPage/setFitMode apliquen.
  for (const p of ['a.pdf', 'b.pdf']) {
    usePdfStore.getState().addDoc({
      doc_id: `id-${p}`, file_path: p, page_count: 10,
      title: null, author: null, subject: null,
      page_sizes: Array.from({ length: 10 }, (_, i) => ({ page_num: i, width: 600, height: 800 })),
    })
  }
})

const doc = (path: string) => usePdfStore.getState().docs.find((d) => d.file_path === path)!

describe('reabrir una sesión', () => {
  it('restaura página y activa el documento que estaba al frente', async () => {
    const n = await reabrirSesion(snapshot([
      { file_path: 'a.pdf', currentPage: 3, zoom: 1.5, fitMode: 'custom' },
      { file_path: 'b.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' },
    ], 'b.pdf'))
    expect(n).toBe(2)
    expect(doc('a.pdf').currentPage).toBe(3)
    expect(usePdfStore.getState().activeDocId).toBe('id-b.pdf')
  })

  // Las dos copias del restaurador guardaban `fitMode` y ninguna lo aplicaba: una
  // sesión en «ajustar a ancho» volvía con el zoom numérico congelado, que ya no
  // corresponde si la ventana cambió de tamaño entre sesiones.
  it('un modo de ajuste se restaura como modo, no como zoom fijo', async () => {
    await reabrirSesion(snapshot([{ file_path: 'a.pdf', currentPage: 0, zoom: 0.42, fitMode: 'fit-width' }]))
    expect(doc('a.pdf').fitMode).toBe('fit-width')
  })

  it('un zoom a medida se restaura tal cual', async () => {
    await reabrirSesion(snapshot([{ file_path: 'a.pdf', currentPage: 0, zoom: 2, fitMode: 'custom' }]))
    expect(doc('a.pdf').zoom).toBe(2)
    expect(doc('a.pdf').fitMode).toBe('custom')
  })

  it('los archivos que ya no se pueden abrir no cuentan ni rompen el resto', async () => {
    const n = await reabrirSesion(snapshot([
      { file_path: 'borrado.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' },
      { file_path: 'a.pdf', currentPage: 2, zoom: 1, fitMode: 'custom' },
    ]))
    expect(n).toBe(1)
    expect(doc('a.pdf').currentPage).toBe(2)
  })

  it('un snapshot vacío o inválido no abre nada', async () => {
    expect(await reabrirSesion(null)).toBe(0)
    expect(await reabrirSesion(snapshot([]))).toBe(0)
    expect(abiertos.length).toBe(0)
  })

  it('la restauración de arranque va en modo silencioso', async () => {
    localStorage.setItem('pdfmaster_session', JSON.stringify(
      snapshot([{ file_path: 'a.pdf', currentPage: 1, zoom: 1, fitMode: 'custom' }])))
    await restoreLiveSession()
    expect(abiertos).toEqual([{ path: 'a.pdf', silent: true }])
  })

  // En silencio, los archivos movidos o borrados simplemente desaparecían de la sesión.
  it('al arrancar dice cuáles no se pudieron reabrir, en un solo aviso', async () => {
    localStorage.setItem('pdfmaster_session', JSON.stringify(snapshot([
      { file_path: 'C:\\planos\\borrado-1.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' },
      { file_path: 'a.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' },
      { file_path: 'D:/obra/borrado-2.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' },
    ])))
    expect(await restoreLiveSession()).toBe(1)
    const avisos = usePdfStore.getState().toasts
    expect(avisos.length).toBe(1)
    expect(avisos[0].type).toBe('error')
    expect(avisos[0].message).toContain('No se pudieron reabrir 2 documento(s)')
    expect(avisos[0].message).toContain('borrado-1.pdf, borrado-2.pdf')
  })

  it('si se reabrieron todos, no avisa nada', async () => {
    await reabrirSesion(snapshot([{ file_path: 'a.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' }]), { silent: true })
    expect(usePdfStore.getState().toasts.length).toBe(0)
  })

  // Sin `silent`, openDocument ya avisa de cada archivo: un resumen encima sería doble.
  it('sin silent no agrega un segundo aviso', async () => {
    await reabrirSesion(snapshot([{ file_path: 'borrado.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' }]))
    expect(usePdfStore.getState().toasts.length).toBe(0)
  })

  it('con muchos fallidos resume el resto', () => {
    const msg = avisoDeNoReabiertos(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'])!
    expect(msg).toContain('5 documento(s)')
    expect(msg).toContain('a.pdf, b.pdf, c.pdf y 2 más')
    expect(avisoDeNoReabiertos([])).toBeNull()
  })

  it('«reabrir última sesión» lee su propia clave', () => {
    expect(loadLastSession()).toBeNull()
    localStorage.setItem('pdfmaster_session_last', JSON.stringify(
      snapshot([{ file_path: 'b.pdf', currentPage: 0, zoom: 1, fitMode: 'custom' }])))
    expect(loadLastSession()?.docs[0].file_path).toBe('b.pdf')
  })
})

// App.tsx persiste la sesión en cada cambio; solo el almacenamiento lleno merece aviso.
describe('error de cuota', () => {
  it('reconoce el QuotaExceededError y nada más', () => {
    expect(esErrorDeCuota(new DOMException('lleno', 'QuotaExceededError'))).toBe(true)
    expect(esErrorDeCuota(new DOMException('otro', 'SecurityError'))).toBe(false)
    expect(esErrorDeCuota(new Error('QuotaExceededError'))).toBe(false)
  })
})
