import { describe, it, expect, vi, beforeEach } from 'vitest'

// Las marcas de la app se pintan en el overlay SVG. Si además PDF.js dibuja las
// anotaciones ya incrustadas en el PDF, cada marca sale DOS veces (con métricas
// distintas: el texto se veía fantasmeado). Por eso el render va con
// annotationMode 0 (AnnotationMode.DISABLE).
const render = vi.fn((_opts: Record<string, unknown>) => ({ promise: Promise.resolve() }))
const getViewport = vi.fn((opts: { scale: number }) => ({ width: 612 * opts.scale, height: 792 * opts.scale }))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ getPage: vi.fn(async () => ({ render, getViewport })) }),
    destroy: vi.fn(async () => {}),
  })),
}))
vi.mock('./api', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
}))

import { renderPdfPage, renderPdfTile, renderPdfThumbnail, isDeadDocError } from './pdfjs'

beforeEach(() => {
  render.mockClear()
  // jsdom no implementa canvas.toBlob
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob()) }
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
})

describe('render con PDF.js', () => {
  it('no dibuja las anotaciones nativas al renderizar la página', async () => {
    await renderPdfPage('doc-a', 1, 0, 1)
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0][0]).toMatchObject({ annotationMode: 0 })
  })

  it('tampoco al renderizar un tile de zoom profundo', async () => {
    await renderPdfTile('doc-b', 1, 0, 0, 0, 50, 50, 2)
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0][0]).toMatchObject({ annotationMode: 0 })
  })
})

// El disparador de "reabrir el documento" era `message.includes('404')`, y el propio
// mensaje de error contenía siempre la palabra 404 — cualquier fallo del motor
// (500, timeout) se trataba como doc_id muerto y provocaba una reapertura inútil.
describe('detección de doc_id muerto', () => {
  it('solo un 404 cuenta como documento muerto', () => {
    expect(isDeadDocError(new Error('HTTP 404 en /pdf/raw'))).toBe(true)
    expect(isDeadDocError(new Error('HTTP 500 en /pdf/raw'))).toBe(false)
    expect(isDeadDocError(new Error('Failed to fetch'))).toBe(false)
    expect(isDeadDocError('404')).toBe(false)
  })
})

// El tope de 300 px del lado largo lo aplicaba el motor (`_capped_scale`) y su test
// vivía en pytest. Las miniaturas se rasterizan en local, así que la cobertura viaja
// aquí: sin tope, un plano de 3024 pt daría una miniatura de varios megapíxeles.
describe('miniaturas', () => {
  it('topa el lado largo en 300 px', async () => {
    getViewport.mockImplementationOnce(() => ({ width: 3024, height: 2160 }))
    const r = await renderPdfThumbnail('plano', 1, 0)
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(300)
    expect(r.originalWidth).toBe(3024)
  })
})
