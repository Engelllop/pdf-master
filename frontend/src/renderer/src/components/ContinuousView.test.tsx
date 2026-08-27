import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor, fireEvent } from '@testing-library/react'

// Cada rasterización devuelve un blob URL nuevo; los MB solo se liberan revocándolo.
let nUrl = 0
const renderPdfPage = vi.fn(async (_d: string, _v: number, page: number, scale: number) => ({
  url: `blob:p${page}-z${scale}-${++nUrl}`, width: 612 * scale, height: 792 * scale,
  originalWidth: 612, originalHeight: 792,
}))
const revokePageUrl = vi.fn()
vi.mock('../lib/pdfjs', () => ({
  renderPdfPage: (d: string, v: number, p: number, s: number) => renderPdfPage(d, v, p, s),
  revokePageUrl: (u: string | undefined) => revokePageUrl(u),
  isDeadDocError: () => false,
}))
vi.mock('../lib/openDocument', () => ({ reopenDeadDoc: vi.fn() }))
vi.mock('../lib/api', () => ({
  apiFetch: async (ruta: string) => ({
    ok: true,
    json: async () => (ruta.includes('/pdf/spans/')
      ? { spans: [
          { text: `texto de la página ${Number(ruta.split('/').pop()) + 1}`, x0: 10, y0: 20, x1: 200, y1: 34, size: 12 },
          { text: 'segundo renglón', x0: 10, y0: 40, x1: 180, y1: 54, size: 12 },
        ] }
      : {}),
  }) as unknown as Response,
}))
vi.mock('../hooks/useFormFields', () => ({ useFormFields: () => ({ fields: [] }) }))
vi.mock('../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('../hooks/useFileDrop', () => ({ useFileDrop: () => ({ handleDragOver: () => {}, handleDrop: () => {} }) }))

import ContinuousView from './ContinuousView'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function abrir(pages = 6) {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:/planos/a.pdf',
    page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
}

/** Las escalas con las que se pidió cada rasterización, en orden. */
const escalas = () => renderPdfPage.mock.calls.map((c) => c[3])
const imagenes = (c: HTMLElement) => [...c.querySelectorAll('img')].map((i) => i.getAttribute('src'))

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  nUrl = 0
  renderPdfPage.mockClear()
  revokePageUrl.mockClear()
  vi.useRealTimers()
})

async function montado() {
  abrir()
  const r = render(<ContinuousView />)
  await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0))
  await waitFor(() => expect(imagenes(r.container).length).toBeGreaterThan(0))
  return r
}

// Rasterizar en cada paso de la rueda era volver a hacer la ventana completa por cada
// 0.2 de zoom: de un plano grande, varios MB por página y por paso.
describe('el zoom no rasteriza en cada paso', () => {
  it('espera a que el zoom se quede quieto', async () => {
    await montado()
    renderPdfPage.mockClear()
    await act(async () => {
      usePdfStore.getState().setZoom('doc-1', 1.2)
      usePdfStore.getState().setZoom('doc-1', 1.4)
      usePdfStore.getState().setZoom('doc-1', 1.6)
    })
    expect(renderPdfPage).not.toHaveBeenCalled()
    await waitFor(() => expect(renderPdfPage.mock.calls.length).toBeGreaterThan(0), { timeout: 2000 })
    // Una sola resolución, la final: los pasos intermedios no se rasterizaron.
    expect(new Set(escalas())).toEqual(new Set([1.6]))
  })
})

// Vaciar los bitmaps al cambiar el zoom dejaba TODA la ventana en blanco hasta que
// volviera a rasterizar. El bitmap viejo se estira mientras tanto.
describe('al hacer zoom las páginas no se quedan en blanco', () => {
  it('sigue mostrando el bitmap anterior hasta que llega el nuevo', async () => {
    const r = await montado()
    const antes = imagenes(r.container)
    expect(antes.every((src) => !!src)).toBe(true)

    await act(async () => { usePdfStore.getState().setZoom('doc-1', 2) })
    // Justo después del zoom: geometría nueva y bitmaps viejos, ni un hueco. (La
    // ventana visible se estrecha porque las páginas son más altas, así que se
    // comparan las que siguen en pantalla, no la lista entera.)
    const ahora = imagenes(r.container)
    expect(ahora.length).toBeGreaterThan(0)
    expect(ahora).toEqual(antes.slice(0, ahora.length))

    await waitFor(() => expect(imagenes(r.container)[0]).not.toBe(antes[0]), { timeout: 2000 })
  })

  it('al reemplazarlo libera el bitmap viejo', async () => {
    const r = await montado()
    const antes = imagenes(r.container)
    await act(async () => { usePdfStore.getState().setZoom('doc-1', 2) })
    await waitFor(() => expect(imagenes(r.container)[0]).not.toBe(antes[0]), { timeout: 2000 })
    expect(revokePageUrl).toHaveBeenCalledWith(antes[0])
  })
})

// Otro documento sí invalida los bitmaps: son de otro archivo.
describe('cambiar de documento', () => {
  it('libera los bitmaps del anterior', async () => {
    const r = await montado()
    const antes = imagenes(r.container).filter(Boolean) as string[]
    await act(async () => {
      usePdfStore.getState().addDoc({
        doc_id: 'doc-2', file_path: 'C:/planos/b.pdf', page_count: 2,
        title: null, author: null, subject: null,
        page_sizes: [{ page_num: 0, width: 612, height: 792 }, { page_num: 1, width: 612, height: 792 }],
      })
    })
    for (const url of antes) expect(revokePageUrl).toHaveBeenCalledWith(url)
  })
})

// El scroll continuo no pintaba ninguna coincidencia: buscar te dejaba en la página y a
// buscar a ojo, que en una lámina con doscientas etiquetas es no encontrarlo.
describe('coincidencias de la búsqueda', () => {
  it('las pinta sobre la página, con la actual distinguida', async () => {
    await montado()
    await act(async () => {
      usePdfStore.getState().setSearchResults('doc-1', [
        { page: 0, x: 10, y: 20, width: 40, height: 12 },
        { page: 0, x: 60, y: 90, width: 40, height: 12 },
      ])
      usePdfStore.getState().goToSearchResult('doc-1', 1)
    })
    const hits = [...document.querySelectorAll('[data-search-hit]')]
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.filter((h) => h.getAttribute('data-search-hit') === 'actual')).toHaveLength(1)
  })

  it('sin búsqueda no pinta nada', async () => {
    await montado()
    expect(document.querySelectorAll('[data-search-hit]')).toHaveLength(0)
  })
})

// Pasarse a scroll continuo para LEER era perder el poder copiar un párrafo: la capa de
// texto seleccionable solo existía en el visor de página.
describe('texto seleccionable', () => {
  it('cada página visible trae su texto', async () => {
    const r = await montado()
    await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
    const capas = r.container.querySelectorAll('.pdf-text-layer')
    expect(capas.length).toBe(r.container.querySelectorAll('img').length)
    expect(r.container.textContent).toContain('texto de la página 1')
  })

  it('con una herramienta activa no se come los clics de dibujo', async () => {
    const r = await montado()
    await act(async () => { usePdfStore.getState().setActiveTool('rect') })
    await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
    const span = r.container.querySelector<HTMLElement>('.pdf-text-layer span[data-w]')!
    expect(span.style.pointerEvents).toBe('none')
  })

  it('sin herramienta, el texto sí recibe el ratón', async () => {
    const r = await montado()
    await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
    const span = r.container.querySelector<HTMLElement>('.pdf-text-layer span[data-w]')!
    expect(span.style.pointerEvents).toBe('auto')
  })
})

// En continuo, `highlight` caía al camino del rect libre (una caja a ojo sobre el
// texto) y `underline`/`strikethrough` no estaban en ninguna lista: no hacían nada.
describe('resaltar, subrayar y tachar se anclan al texto', () => {
  /** Arrastra sobre la primera página, de (x0,y0) a (x1,y1) en px de pantalla. Cada
   * evento va en su propio `act`: el handler de soltar lee el `preview` de su closure,
   * así que sin dejar re-renderizar entre medias llega con el preview a null y sale. */
  async function arrastrar(r: { container: HTMLElement }, x0: number, y0: number, x1: number, y1: number) {
    const pagina = r.container.querySelector<HTMLElement>('[data-page="0"] .absolute.inset-0')!
    pagina.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792, right: 612, bottom: 792, x: 0, y: 0, toJSON: () => '' }) as DOMRect
    await act(async () => { fireEvent.pointerDown(pagina, { clientX: x0, clientY: y0, pointerId: 1 }) })
    await act(async () => { fireEvent.pointerMove(pagina, { clientX: x1, clientY: y1, pointerId: 1 }) })
    await act(async () => { fireEvent.pointerUp(pagina, { clientX: x1, clientY: y1, pointerId: 1 }) })
  }

  const marcas = () => usePdfStore.getState().docs[0].annotations

  it('deja una marca por renglón, con el rect del renglón', async () => {
    const r = await montado()
    await act(async () => { usePdfStore.getState().setActiveTool('highlight') })
    await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
    await arrastrar(r, 5, 15, 210, 60)
    expect(marcas()).toHaveLength(2)
    expect(marcas().map((a) => a.type)).toEqual(['highlight', 'highlight'])
    // El rect es el del renglón, no el que dibujó la mano.
    expect(marcas()[0].y).toBe(20)
    expect(marcas()[0].height).toBe(14)
  })

  it('subrayar y tachar también marcan (antes no hacían nada)', async () => {
    for (const tool of ['underline', 'strikethrough'] as const) {
      usePdfStore.setState(initialState, true)
      const r = await montado()
      await act(async () => { usePdfStore.getState().setActiveTool(tool) })
      await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
      await arrastrar(r, 5, 15, 210, 30)
      expect(marcas().map((a) => a.type)).toEqual([tool])
      r.unmount()
    }
  })

  // Sin texto debajo no se deja una marca suelta en medio del plano.
  it('sin texto debajo avisa y no marca nada', async () => {
    const r = await montado()
    await act(async () => { usePdfStore.getState().setActiveTool('highlight') })
    await waitFor(() => expect(r.container.querySelector('.pdf-text-layer span')).toBeTruthy())
    await arrastrar(r, 400, 400, 500, 450)
    expect(marcas()).toHaveLength(0)
    expect(usePdfStore.getState().toasts.map((t) => t.message).join(' ')).toContain('se anclan al texto')
  })

  it('un rect libre sigue siendo un rect libre', async () => {
    const r = await montado()
    await act(async () => { usePdfStore.getState().setActiveTool('rect') })
    await arrastrar(r, 400, 400, 500, 450)
    expect(marcas()).toHaveLength(1)
    expect(marcas()[0].type).toBe('rect')
  })
})

// En continuo la marca seleccionada solo recibía un contorno punteado: no se podía
// mover ni redimensionar, así que lo puesto acá solo se ajustaba cambiando de vista.
describe('ajustar una marca ya puesta', () => {
  async function conMarca() {
    abrir()
    // Zoom 1 para que 1 px de pantalla = 1 punto PDF y las coordenadas del test sean
    // las de la marca (el fit por omisión deja un zoom fraccionario).
    usePdfStore.getState().setZoom('doc-1', 1)
    usePdfStore.getState().addAnnotation('doc-1', {
      id: 'a1', type: 'rect', page: 0, x: 100, y: 100, width: 80, height: 40, color: '#ef4444',
    })
    const r = render(<ContinuousView />)
    await waitFor(() => expect(r.container.querySelector('img')).toBeTruthy())
    const capa = r.container.querySelector<HTMLElement>('[data-page="0"] .absolute.inset-0')!
    capa.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792, right: 612, bottom: 792, x: 0, y: 0, toJSON: () => '' }) as DOMRect
    const svg = r.container.querySelector('[data-page="0"] svg')!
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792, right: 612, bottom: 792, x: 0, y: 0, toJSON: () => '' }) as DOMRect
    return { r, capa }
  }

  const marca = () => usePdfStore.getState().docs[0].annotations[0]
  // Crear la marca ya apila un paso, así que se compara contra la base, no contra 0.
  const pasosDeshacer = () => usePdfStore.getState().undoStack.length

  it('pinchar y arrastrar la mueve, en un solo paso de deshacer', async () => {
    const { capa } = await conMarca()
    const base = pasosDeshacer()
    await act(async () => { fireEvent.pointerDown(capa, { clientX: 110, clientY: 110, pointerId: 1 }) })
    expect(usePdfStore.getState().selectedAnnotationId).toBe('a1')
    await act(async () => { fireEvent.mouseMove(window, { clientX: 130, clientY: 140 }) })
    await act(async () => { fireEvent.mouseMove(window, { clientX: 150, clientY: 160 }) })
    await act(async () => { fireEvent.mouseUp(window) })
    expect(marca().x).toBeCloseTo(140, 5)
    expect(marca().y).toBeCloseTo(150, 5)
    expect(pasosDeshacer()).toBe(base + 1)
  })

  it('un clic sin arrastre selecciona y no apila nada que deshacer', async () => {
    const { capa } = await conMarca()
    const base = pasosDeshacer()
    await act(async () => { fireEvent.pointerDown(capa, { clientX: 110, clientY: 110, pointerId: 1 }) })
    await act(async () => { fireEvent.mouseUp(window) })
    expect(usePdfStore.getState().selectedAnnotationId).toBe('a1')
    expect(marca().x).toBe(100)
    expect(pasosDeshacer()).toBe(base)
  })

  it('la seleccionada saca tiradores para redimensionar', async () => {
    const { r, capa } = await conMarca()
    await act(async () => { fireEvent.pointerDown(capa, { clientX: 110, clientY: 110, pointerId: 1 }) })
    await act(async () => { fireEvent.mouseUp(window) })
    // 8 tiradores: cada uno dibuja un cuadrado y una zona sensible mayor.
    const tiradores = r.container.querySelectorAll('[data-page="0"] svg rect[fill="transparent"]')
    expect(tiradores).toHaveLength(8)
  })

  it('arrastrar un tirador cambia el tamaño, no la posición de la esquina opuesta', async () => {
    const { r, capa } = await conMarca()
    await act(async () => { fireEvent.pointerDown(capa, { clientX: 110, clientY: 110, pointerId: 1 }) })
    await act(async () => { fireEvent.mouseUp(window) })
    const tiradores = [...r.container.querySelectorAll('[data-page="0"] svg rect[fill="transparent"]')]
    // El de abajo-derecha ('se') es el quinto de la lista de esquinas. El gesto arranca
    // en la esquina de la propia zona sensible (jsdom no calcula `offsetX`), así que el
    // desplazamiento se mide desde ahí y no desde un número a mano.
    const se = tiradores[4]
    const hx = Number(se.getAttribute('x'))
    const hy = Number(se.getAttribute('y'))
    const base = pasosDeshacer()
    // El gesto arranca en `offsetX + esquina de la zona sensible`, y jsdom (que no
    // calcula layout) devuelve como `offsetX` el propio `clientX`: con el mousedown en
    // 0,0 el arranque es exactamente esa esquina y el desplazamiento es el del move.
    await act(async () => { fireEvent.mouseDown(se, { clientX: 0, clientY: 0 }) })
    await act(async () => { fireEvent.mouseMove(window, { clientX: hx + 30, clientY: hy + 20 }) })
    await act(async () => { fireEvent.mouseUp(window) })
    expect(marca().x).toBe(100)
    expect(marca().y).toBe(100)
    expect(marca().width).toBeGreaterThan(80)
    expect(marca().height).toBeGreaterThan(40)
    expect(pasosDeshacer()).toBe(base + 1)
  })
})
