import { describe, it, expect, vi, beforeEach } from 'vitest'

// Las marcas de la app se pintan en el overlay SVG. Si además PDF.js dibuja las
// anotaciones ya incrustadas en el PDF, cada marca sale DOS veces (con métricas
// distintas: el texto se veía fantasmeado). Por eso el render va con
// annotationMode 0 (AnnotationMode.DISABLE).
const render = vi.fn((_opts: Record<string, unknown>) => ({ promise: Promise.resolve() }))
const getViewport = vi.fn(() => ({ width: 100, height: 100 }))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ getPage: vi.fn(async () => ({ render, getViewport })) }),
    destroy: vi.fn(),
  })),
}))
vi.mock('./api', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
}))

import { renderPdfPage, renderPdfTile } from './pdfjs'

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
