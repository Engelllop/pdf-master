import { describe, it, expect, vi } from 'vitest'

// Archivo aparte de `pdfjs.test.ts` a propósito: el caché de documentos es estado de
// módulo, y compartirlo con los tests de render hacía que el orden de ejecución
// decidiera qué había cacheado.
const destroys: string[] = []
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ getPage: vi.fn() }),
    destroy: vi.fn(async () => { destroys.push('x') }),
  })),
}))
const apiFetch = vi.fn(async (_path: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
vi.mock('./api', () => ({ apiFetch: (path: string) => apiFetch(path) }))

import { getPdfDocument } from './pdfjs'

// El caché evictaba en orden de INSERCIÓN. Con MAX_DOCS = 3 y cuatro pestañas
// abiertas, volver a una vieja no la refrescaba, así que la siguiente pestaña nueva
// tiraba justo a esa: se redescargaba `/pdf/raw` y se reparseaba el ArrayBuffer
// completo en cada ida y vuelta entre planos.
describe('caché de documentos PDF.js', () => {
  it('evicta el menos usado, no el más antiguo', async () => {
    await getPdfDocument('a', 1)
    await getPdfDocument('b', 1)
    await getPdfDocument('c', 1)
    expect(apiFetch).toHaveBeenCalledTimes(3)

    await getPdfDocument('a', 1) // acierto: no lo vuelve a pedir y pasa a ser el más usado
    expect(apiFetch).toHaveBeenCalledTimes(3)

    await getPdfDocument('d', 1) // desborda el tope: debe irse 'b'
    expect(apiFetch).toHaveBeenCalledTimes(4)

    await getPdfDocument('a', 1)
    expect(apiFetch).toHaveBeenCalledTimes(4) // 'a' sobrevivió

    await getPdfDocument('b', 1)
    expect(apiFetch).toHaveBeenCalledTimes(5) // 'b' fue el evictado
  })

  // Si el documento se descarta mientras `/pdf/raw` está en vuelo, el loading task
  // todavía no existe: antes se colgaba un `.then` del promise, que nunca corría si el
  // parseo fallaba, y el task se quedaba vivo con su worker.
  it('descartar durante la descarga destruye el task en cuanto nace', async () => {
    let liberar: (() => void) | null = null
    apiFetch.mockImplementationOnce(async () => {
      await new Promise<void>((r) => { liberar = r })
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    })
    const enVuelo = getPdfDocument('w', 1).catch((e: unknown) => e)
    getPdfDocument('w', 2) // una versión nueva invalida la 1 mientras baja
    // El desalojo por tope ya destruyó lo que tenía que destruir; desde aquí, el único
    // destroy que puede sumar es el del task descartado.
    await new Promise((r) => setTimeout(r, 0))
    const antes = destroys.length
    liberar!()
    const err = await enVuelo
    expect((err as DOMException).name).toBe('AbortError')
    expect(destroys.length).toBe(antes + 1)
  })
})
