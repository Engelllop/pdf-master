import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePdfActions } from './usePdfActions'
import { usePdfStore } from '../store/usePdfStore'
import { type Field, type FormValues } from '../components/FormModal'

// El aviso de «el archivo cambió en disco» vive en `lib/saveDocument` y usa el
// `askConfirm` de `lib/uiPrompt`, no el helper que se le inyecta al hook.
const askConfirmPrompt = vi.fn(async (_t: string, _m: string, _c?: string) => true)
vi.mock('../lib/uiPrompt', () => ({
  askConfirm: (t: string, m: string, c?: string) => askConfirmPrompt(t, m, c),
  askForm: vi.fn(async () => null),
}))

const initialState = usePdfStore.getState()

function openDoc(pages = 4) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\a.pdf',
    page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
  return usePdfStore.getState().docs[0]
}

function okFetch(json: unknown = { success: true }) {
  return vi.fn((_path: string, _init?: RequestInit) =>
    Promise.resolve({ ok: true, status: 200, json: async () => json, text: async () => '' } as unknown as Response))
}

// Los mocks llevan la firma real de los helpers: si no, `setup()` la infiere sin
// argumentos y no se pueden inspeccionar los textos con los que se llamó.
const helpers = () => ({
  askForm: vi.fn(async (_t: string, _f: Field[], _s?: string): Promise<FormValues | null> => ({ text: 'CONFIDENCIAL' })),
  askConfirm: vi.fn(async (_t: string, _m: string, _c?: string): Promise<boolean> => true),
  toastActionError: vi.fn(),
})

function setup(h = helpers()) {
  const doc = openDoc()
  const r = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: doc } })
  return { ...r, h, doc }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
  Object.assign(window, { api: {
    saveFile: vi.fn(async () => 'C:\\out.pdf'),
    openFile: vi.fn(async () => 'C:\\img.png'),
    readFileBase64: vi.fn(async () => 'QkFTRTY0'),
    logError: vi.fn(async () => {}),
  } })
})

describe('handleToolClick', () => {
  it('activa y alterna una herramienta no-imagen', async () => {
    const { result } = setup()
    await act(async () => { await result.current.handleToolClick('text') })
    expect(usePdfStore.getState().activeTool).toBe('text')
    await act(async () => { await result.current.handleToolClick('text') })
    expect(usePdfStore.getState().activeTool).toBeNull()
  })

  it('para "image" carga el archivo y deja la herramienta lista', async () => {
    const { result } = setup()
    await act(async () => { await result.current.handleToolClick('image') })
    expect(window.api.openFile).toHaveBeenCalled()
    expect(usePdfStore.getState().activeTool).toBe('image')
    expect(usePdfStore.getState().selectedImageData).toContain('base64,QkFTRTY0')
  })
})

describe('handleWatermark', () => {
  it('pide el texto, llama a /watermark y marca el doc como modificado', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const h = helpers()
    const { result } = setup(h)
    await act(async () => { await result.current.handleWatermark() })
    expect(h.askForm).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pdf/watermark/doc-1'), expect.objectContaining({ method: 'POST' }))
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })

  it('no llama al backend si el usuario cancela el formulario', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const h = { ...helpers(), askForm: vi.fn(async (_t: string, _f: Field[], _s?: string): Promise<FormValues | null> => null) }
    const { result } = setup(h)
    await act(async () => { await result.current.handleWatermark() })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('handleSplit', () => {
  it('para "even" envía los índices de páginas pares (1-based impares en 0-index)', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await act(async () => { await result.current.handleSplit('even') })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.pages).toEqual([1, 3])
  })
})

// El id de cada marca viaja en el `name` del XFDF. La importación hacía append a
// ciegas: reimportar el archivo (rev B y después rev C del mismo plano) apilaba una
// copia de cada marca sin cambios — y un id repetido rompe el estado, porque las
// operaciones del store buscan por id y solo encuentran la primera.
describe('importar XFDF', () => {
  const marca = (id: string, y = 10) => ({ id, type: 'highlight', page: 0, x: 10, y, width: 50, height: 12 })

  function conApi(anns: object[]) {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => (path.includes('import-xfdf') ? { annotations: anns } : { success: true }),
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { api: { ...window.api, openFile: vi.fn(async () => 'C:/rev.xfdf'), getApiToken: async () => '' } })
    return fetchMock
  }

  it('reimportar el mismo archivo actualiza, no duplica', async () => {
    conApi([marca('h1'), marca('h2', 40)])
    const { result } = setup()
    await act(async () => { await result.current.handleImportXfdf() })
    expect(usePdfStore.getState().docs[0].annotations.map((a) => a.id)).toEqual(['h1', 'h2'])

    // Segunda pasada del mismo archivo, con h1 movida.
    conApi([{ ...marca('h1', 99) }, marca('h2', 40)])
    const { result: r2 } = setup()
    await act(async () => { await r2.current.handleImportXfdf() })
    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns.map((a) => a.id)).toEqual(['h1', 'h2'])
    expect(anns.find((a) => a.id === 'h1')!.y).toBe(99)
  })

  it('la importación se puede deshacer', async () => {
    conApi([marca('h1'), marca('h2', 40)])
    const { result } = setup()
    await act(async () => { await result.current.handleImportXfdf() })
    expect(usePdfStore.getState().docs[0].annotations.length).toBe(2)
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations.length).toBe(0)
  })

  it('descarta las marcas de páginas que el documento no tiene', async () => {
    conApi([marca('h1'), { ...marca('h9'), page: 99 }])
    const { result } = setup()
    await act(async () => { await result.current.handleImportXfdf() })
    expect(usePdfStore.getState().docs[0].annotations.map((a) => a.id)).toEqual(['h1'])
  })
})

// El OCR de un documento entero son minutos con el motor tomado y no se puede
// cancelar. Antes se arrancaba a ciegas: elegías «todo el documento» en un escaneo de
// 300 láminas y te quedabas mirando una app aparentemente colgada.
describe('OCR de todo el documento', () => {
  function conApi(pendientes: number, opts: { palabras?: number } = {}) {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => {
          if (path.includes('ocr-available')) return { available: true }
          if (path.includes('ocr-pending')) return { count: pendientes, pages: Array.from({ length: pendientes }, (_, i) => i) }
          if (path.includes('make-searchable')) return { words: opts.palabras ?? 12, stash_id: 's1' }
          if (path.includes('/info/')) return { page_count: 4, page_sizes: [{ page_num: 0, width: 800, height: 600 }] }
          return { success: true }
        },
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const conAlcanceDocumento = () => ({
    ...helpers(),
    askForm: vi.fn(async (_t: string, _f: Field[], _s?: string): Promise<FormValues | null> => ({ scope: 'Todo el documento' })),
    askConfirm: vi.fn(async (_t: string, _m: string, _c?: string): Promise<boolean> => true),
  })

  it('avisa cuántas páginas hacen falta y espera confirmación', async () => {
    const fetchMock = conApi(137)
    const h = conAlcanceDocumento()
    const { result } = setup(h)
    await act(async () => { await result.current.handleMakeSearchable() })
    expect(h.askConfirm).toHaveBeenCalled()
    const detalle = String(h.askConfirm.mock.calls[0][1])
    expect(detalle).toContain('137')
    expect(detalle).toContain('Se puede cancelar')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('make-searchable'))).toBe(true)
  })

  it('cancelar a mitad detiene la cola y conserva lo ya reconocido', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => {
          if (path.includes('ocr-available')) return { available: true }
          if (path.includes('ocr-pending')) return { count: 4, pages: [0, 1, 2, 3] }
          if (path.includes('stash-document')) return { success: true, stash_id: 's1' }
          if (path.includes('make-searchable')) {
            // El usuario pulsa cancelar mientras corre la primera página.
            usePdfStore.getState().requestCancel()
            return { words: 5 }
          }
          if (path.includes('/info/')) return { page_count: 4, page_sizes: [{ page_num: 0, width: 800, height: 600 }] }
          return { success: true }
        },
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup(conAlcanceDocumento())
    await act(async () => { await result.current.handleMakeSearchable() })
    const ocrs = fetchMock.mock.calls.filter((c) => String(c[0]).includes('make-searchable'))
    expect(ocrs.length).toBe(1)
    // Un solo paso de deshacer para todo el lote, con el stash tomado al principio.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('stash-document'))).toBe(true)
    expect(usePdfStore.getState().undoStack.length).toBe(1)
  })

  it('si el usuario cancela el aviso, no se llama al motor', async () => {
    const fetchMock = conApi(137)
    const h = { ...conAlcanceDocumento(), askConfirm: vi.fn(async (_t: string, _m: string, _c?: string): Promise<boolean> => false) }
    const { result } = setup(h)
    await act(async () => { await result.current.handleMakeSearchable() })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('make-searchable'))).toBe(false)
  })

  it('si no hay ninguna página sin texto, ni pregunta ni corre nada', async () => {
    const fetchMock = conApi(0)
    const h = conAlcanceDocumento()
    const { result } = setup(h)
    await act(async () => { await result.current.handleMakeSearchable() })
    expect(h.askConfirm).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('make-searchable'))).toBe(false)
  })
})

// La escala de medición es por página desde que un juego de planos puede mezclarlas:
// una sola escala en el título del takeoff sería mentira.
describe('exportar mediciones con escalas distintas', () => {
  function docConCotas() {
    openDoc(3)
    usePdfStore.getState().addAnnotation('doc-1', { id: 'm0', type: 'measure_distance', page: 0, x: 0, y: 0, width: 100, height: 0 })
    usePdfStore.getState().addAnnotation('doc-1', { id: 'm1', type: 'measure_distance', page: 1, x: 0, y: 0, width: 100, height: 0 })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 50, unit: 'm' }, 1)
    return usePdfStore.getState().docs[0]
  }

  function cuerpoExportado(fetchMock: ReturnType<typeof okFetch>) {
    const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes('export-measurements'))!
    return JSON.parse(String((llamada[1] as RequestInit).body))
  }

  it('cada fila lleva la escala de SU página y el título no inventa una sola', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { api: { ...window.api, saveFile: vi.fn(async () => 'C:/takeoff.csv'), getApiToken: async () => '' } })
    const doc = docConCotas()
    const h = helpers()
    const { result } = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleExportMeasurements() })

    const cuerpo = cuerpoExportado(fetchMock)
    const porPagina = Object.fromEntries(cuerpo.rows.filter((r: { page: string }) => r.page).map((r: { page: string; escala: string }) => [r.page, r.escala]))
    expect(porPagina['1']).toBe('1 m = 10.00 pt')
    expect(porPagina['2']).toBe('1 m = 50.00 pt')
    expect(cuerpo.title).toContain('varias escalas')
    vi.unstubAllGlobals()
  })

  it('con una sola escala el título la dice', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { api: { ...window.api, saveFile: vi.fn(async () => 'C:/takeoff.csv'), getApiToken: async () => '' } })
    openDoc(2)
    usePdfStore.getState().addAnnotation('doc-1', { id: 'm0', type: 'measure_distance', page: 0, x: 0, y: 0, width: 100, height: 0 })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    const h = helpers()
    const { result } = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: usePdfStore.getState().docs[0] } })
    await act(async () => { await result.current.handleExportMeasurements() })
    expect(cuerpoExportado(fetchMock).title).toContain('1 m = 10.00 pt')
    vi.unstubAllGlobals()
  })
})

// Era la última exportación que se bajaba por un `data:` URL a Descargas: 60 planos =
// 60 cadenas base64 de varios MB en memoria y 60 descargas silenciosas, sin decir a
// dónde iban. El resto de exportaciones ya escribía donde el usuario elige.
describe('exportar a Word por lotes', () => {
  function conCarpeta(carpeta: string | null) {
    const fetchMock = okFetch({ filename: 'x.docx', output_path: 'C:/salida/x.docx' })
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, {
      api: { ...window.api, chooseFolder: vi.fn(async () => carpeta), getApiToken: async () => '' },
    })
    return fetchMock
  }

  it('pregunta la carpeta y el motor escribe cada archivo ahí', async () => {
    const fetchMock = conCarpeta('C:/salida')
    const { result } = setup()  // deja un documento abierto: a.pdf
    await act(async () => { await result.current.handleBatchExportWord() })
    const llamadas = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('export-word'))
    expect(llamadas.length).toBe(1)
    // El separador lo pone el código; lo que importa es que sale en la carpeta elegida
    // y con el nombre del PDF, sin pasar por una descarga.
    const salida = decodeURIComponent(llamadas[0])
    expect(salida).toContain('C:/salida')
    expect(salida).toContain('a.docx')
  })

  it('si se cancela la carpeta no se exporta nada', async () => {
    const fetchMock = conCarpeta(null)
    const { result } = setup()
    await act(async () => { await result.current.handleBatchExportWord() })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('export-word'))).toBe(false)
  })
})

// Mismo caso que el export a Word por lotes: el handler de un documento ya preguntaba
// dónde guardar («era la última operación que elegía la ruta ella sola»), pero el de
// lotes seguía escribiendo `<original>_compressed.pdf` al lado de cada archivo, sin
// preguntar y pisando el de la corrida anterior.
describe('comprimir por lotes', () => {
  function conCarpeta(carpeta: string | null, tamanos = { size_before: 2000000, size_after: 1000000 }) {
    const fetchMock = okFetch(tamanos)
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, {
      api: { ...window.api, chooseFolder: vi.fn(async () => carpeta), getApiToken: async () => '' },
    })
    return fetchMock
  }

  it('escribe en la carpeta elegida y avisa cuánto se ahorró', async () => {
    const fetchMock = conCarpeta('C:/salida')
    const { result } = setup()
    await act(async () => { await result.current.handleBatchCompress() })
    const salida = decodeURIComponent(String(fetchMock.mock.calls.find((c) => String(c[0]).includes('/compress/'))![0]))
    expect(salida).toContain('C:/salida')
    expect(salida).toContain('_comprimido.pdf')
    const avisos = usePdfStore.getState().toasts.map((t) => t.message)
    expect(avisos.some((m) => m.includes('−50 %'))).toBe(true)
  })

  it('dice cuáles quedaron más grandes en vez de cantar victoria', async () => {
    conCarpeta('C:/salida', { size_before: 1000000, size_after: 1200000 })
    const { result } = setup()
    await act(async () => { await result.current.handleBatchCompress() })
    const avisos = usePdfStore.getState().toasts.map((t) => t.message)
    expect(avisos.some((m) => m.includes('sin ganancia') && m.includes('ya estaban optimizados'))).toBe(true)
  })

  it('si se cancela la carpeta no se comprime nada', async () => {
    const fetchMock = conCarpeta(null)
    const { result } = setup()
    await act(async () => { await result.current.handleBatchCompress() })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/compress/'))).toBe(false)
  })
})

// «Guardar con contraseña» escribe ENCIMA del original (y encima cifrado) por su propio
// camino: era la única ruta de guardado sin el aviso de «el archivo cambió en disco».
describe('guardar con contraseña sobre un archivo que cambió', () => {
  function conDisco(enDisco: { mtime: number; size: number }) {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => (path.includes('disk-state') ? enDisco : { success: true }),
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const conClave = () => ({
    ...helpers(),
    askForm: vi.fn(async (_t: string, _f: Field[], _s?: string): Promise<FormValues | null> => ({ user: 'clave123', owner: '' })),
  })

  it('pregunta y no escribe si el usuario cancela', async () => {
    const fetchMock = conDisco({ mtime: 9999, size: 700 })
    const doc = openDoc()
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    askConfirmPrompt.mockClear()
    askConfirmPrompt.mockResolvedValueOnce(false)
    const h = conClave()
    const { result } = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleSaveWithPassword() })
    expect(String(askConfirmPrompt.mock.calls[0]?.[0])).toContain('cambió en disco')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('save-password'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('sin cambios en disco guarda sin preguntar y refresca la referencia', async () => {
    const fetchMock = conDisco({ mtime: 1000, size: 500 })
    const doc = openDoc()
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    askConfirmPrompt.mockClear()
    const h = conClave()
    const { result } = renderHook(({ d }) => usePdfActions(d, h), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleSaveWithPassword() })
    expect(askConfirmPrompt).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('save-password'))).toBe(true)
    // Se relee el estado DESPUÉS de escribir: si no, el próximo Ctrl+S avisaría de un
    // cambio externo que fuimos nosotros.
    const consultas = fetchMock.mock.calls.filter((c) => String(c[0]).includes('disk-state')).length
    expect(consultas).toBeGreaterThanOrEqual(2)
    vi.unstubAllGlobals()
  })
})

// El cuadro de guardar deja elegir el PROPIO archivo del documento. Comprimir y quitar
// contraseña escriben ahí sin pasar por `saveDocument`, así que se saltaban el aviso de
// cambio en disco.
describe('escribir sobre el propio archivo desde otra operación', () => {
  function conDisco(enDisco: { mtime: number; size: number }, destino: string) {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => (path.includes('disk-state') ? enDisco : { success: true, size_before: 100, size_after: 90 }),
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { api: { ...window.api, saveFile: vi.fn(async () => destino), getApiToken: async () => '' } })
    return fetchMock
  }

  it('comprimir sobre el original pregunta y respeta el cancelar', async () => {
    const fetchMock = conDisco({ mtime: 9999, size: 700 }, 'C:/planos/a.pdf')
    const doc = openDoc()
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    askConfirmPrompt.mockClear()
    askConfirmPrompt.mockResolvedValueOnce(false)
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleCompress() })
    expect(String(askConfirmPrompt.mock.calls[0]?.[0])).toContain('cambió en disco')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/compress/'))).toBe(false)
    vi.unstubAllGlobals()
  })

  it('comprimir a otra ruta no pregunta nada', async () => {
    const fetchMock = conDisco({ mtime: 9999, size: 700 }, 'C:/planos/copia.pdf')
    const doc = openDoc()
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    askConfirmPrompt.mockClear()
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleCompress() })
    expect(askConfirmPrompt).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/compress/'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('quitar contraseña sobre el original también pasa por el aviso', async () => {
    const fetchMock = conDisco({ mtime: 9999, size: 700 }, 'c:/planos/a.pdf')
    const doc = openDoc()
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    askConfirmPrompt.mockClear()
    askConfirmPrompt.mockResolvedValueOnce(false)
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleRemovePassword() })
    expect(askConfirmPrompt).toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('remove-password'))).toBe(false)
    vi.unstubAllGlobals()
  })
})

// Comprimir y quitar la contraseña escriben un PDF completo, y lo hacían con el
// documento del motor: las marcas del store se quedaban fuera del archivo. Comprimiendo
// encima del propio original, además, se perdían.
describe('las otras escrituras también llevan las marcas', () => {
  function conMarca(destino: string) {
    const fetchMock = vi.fn((_path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => ({ success: true, size_before: 100, size_after: 90 }),
      } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)
    Object.assign(window, { api: { ...window.api, saveFile: vi.fn(async () => destino), chooseFolder: vi.fn(async () => 'C:/salida'), getApiToken: async () => '' } })
    openDoc(2)
    usePdfStore.getState().addAnnotation('doc-1', { id: 'r1', type: 'rect', page: 0, x: 10, y: 10, width: 50, height: 20 })
    return { fetchMock, doc: usePdfStore.getState().docs[0] }
  }

  const rutas = (fetchMock: { mock: { calls: unknown[][] } }): string[] =>
    fetchMock.mock.calls.map((c) => String(c[0]))

  // El orden importa: subir las marcas DESPUÉS de escribir no sirve de nada.
  const subeAntesDe = (fetchMock: { mock: { calls: unknown[][] } }, op: string): boolean => {
    const r = rutas(fetchMock)
    const embed = r.findIndex((x) => x.includes('/pdf/embed/'))
    const escritura = r.findIndex((x) => x.includes(op))
    return embed >= 0 && escritura >= 0 && embed < escritura
  }

  it('comprimir sube las marcas antes de escribir', async () => {
    const { fetchMock, doc } = conMarca('C:/planos/copia.pdf')
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleCompress() })
    expect(subeAntesDe(fetchMock, '/compress/')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('comprimir por lotes sube las de cada documento', async () => {
    const { fetchMock, doc } = conMarca('C:/planos/copia.pdf')
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleBatchCompress() })
    expect(subeAntesDe(fetchMock, '/compress/')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('extraer páginas sube las marcas antes de escribir', async () => {
    const { fetchMock, doc } = conMarca('C:/planos/extracto.pdf')
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleSplit('even') })
    expect(subeAntesDe(fetchMock, '/split/')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('quitar la contraseña sube las marcas antes de escribir', async () => {
    const { fetchMock, doc } = conMarca('C:/planos/sin_clave.pdf')
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleRemovePassword() })
    expect(subeAntesDe(fetchMock, '/remove-password/')).toBe(true)
    vi.unstubAllGlobals()
  })

  // Si el usuario cancela el aviso de sobrescritura no se escribe NADA, ni se toca la
  // cola del motor.
  it('cancelando el aviso no se sube ni se escribe', async () => {
    const { fetchMock, doc } = conMarca('C:/planos/a.pdf')
    usePdfStore.getState().setDiskState('doc-1', { mtime: 1000, size: 500 })
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve({
        ok: true, status: 200, text: async () => '',
        json: async () => (path.includes('disk-state') ? { mtime: 9999, size: 700 } : { success: true }),
      } as unknown as Response))
    askConfirmPrompt.mockClear()
    askConfirmPrompt.mockResolvedValueOnce(false)
    const { result } = renderHook(({ d }) => usePdfActions(d, helpers()), { initialProps: { d: doc } })
    await act(async () => { await result.current.handleCompress() })
    expect(rutas(fetchMock).some((r) => r.includes('/pdf/embed/'))).toBe(false)
    expect(rutas(fetchMock).some((r) => r.includes('/compress/'))).toBe(false)
    vi.unstubAllGlobals()
  })
})
