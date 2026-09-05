/**
 * Banco de pruebas del renderer: monta la interfaz REAL en un navegador, sin
 * Electron y sin motor, con un documento de mentira ya abierto.
 *
 * Existe porque el chrome no se puede mirar de otra forma: la app es Electron, no
 * arranca en un panel de navegador, y los tests corren en jsdom, que no hace
 * layout — así que un desbordamiento que se pisa o un menú que no abre pasan los
 * 558 tests en verde. Con esto se ve, se mide y se prueba a cualquier ancho.
 *
 * `npm run harness` construye y deja `out/renderer/harness.html` listo para servir.
 */
;(() => {
  const noop = () => {}
  const ok = (v) => () => Promise.resolve(v)
  const RUTA = 'C:/planos/A-102 Planta baja.pdf'

  window.api = {
    openFile: ok(RUTA),
    openFiles: ok([RUTA]),
    saveFile: ok(RUTA),
    chooseFolder: ok('C:/planos'),
    toggleFullscreen: ok(undefined),
    setTitleOverlay: ok(undefined),
    restartBackend: ok(undefined),
    newWindow: ok(undefined),
    logError: ok(undefined),
    osUsername: ok('Engell'),
    setUiZoom: ok(undefined),
    showInFolder: noop,
    openFolder: noop,
    getFilePath: () => RUTA,
    readFileBase64: ok(null),
    getApiToken: ok(''),
    exportDiagnostics: ok(null),
    printPdf: ok({ success: true }),
    aiChat: noop,
    aiAbort: noop,
    aiSetKey: ok({ success: true }),
    aiHasKey: ok(true),
    onAiChunk: () => noop,
    onAiDone: () => noop,
    onAiError: () => noop,
    setDirtyState: noop,
    rendererReady: noop,
    onOpenFile: noop,
    removeOpenFileListener: noop,
    onConfirmClose: () => noop,
    forceClose: noop,
  }

  // Motor de mentira: lo justo para que exista un documento y la cinta enseñe TODAS
  // sus herramientas. La página no se rasteriza —eso es pdf.js sobre un PDF real— y
  // no hace falta para mirar el chrome.
  const DOC = {
    doc_id: 'demo-doc',
    file_path: RUTA,
    file_name: 'A-102 Planta baja.pdf',
    page_count: 128,
    current_page: 0,
    page_sizes: Array.from({ length: 128 }, (_, i) => ({ page_num: i, width: 2592, height: 1728 })),
    unmanaged_annots: 0,
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const original = window.fetch.bind(window)
  window.fetch = (entrada, init) => {
    const url = String(typeof entrada === 'string' ? entrada : entrada.url)
    if (!url.includes('localhost:8745')) return original(entrada, init)
    const ruta = url.split('localhost:8745')[1].split('?')[0]

    if (ruta.endsWith('/health')) return Promise.resolve(json({ status: 'ok', version: 'banco', pid: 0 }))
    if (ruta === '/pdf/open') return Promise.resolve(json(DOC))
    if (ruta.startsWith('/pdf/annotations')) return Promise.resolve(json({ annotations: [] }))
    if (ruta.startsWith('/pdf/outline')) return Promise.resolve(json([]))
    if (ruta.startsWith('/pdf/widgets')) return Promise.resolve(json({ widgets: [] }))
    if (ruta.startsWith('/pdf/text')) return Promise.resolve(json({ blocks: [] }))
    if (ruta.startsWith('/pdf/page-info')) {
      return Promise.resolve(json({ page_num: 0, width: 1200, height: 800, original_width: 2592, original_height: 1728 }))
    }
    if (ruta.startsWith('/pdf/dirty')) return Promise.resolve(json({ dirty: false }))
    if (ruta.startsWith('/pdf/ocr-pending')) return Promise.resolve(json({ count: 0, pages: [] }))
    return Promise.resolve(json({}))
  }

  // Abre el documento solo, para no tener que pinchar nada en cada recarga.
  window.addEventListener('load', () => {
    setTimeout(() => {
      const abrir = [...document.querySelectorAll('button')].find((b) => /Abrir PDF/.test(b.textContent || ''))
      abrir?.click()
    }, 300)
  })
})()
