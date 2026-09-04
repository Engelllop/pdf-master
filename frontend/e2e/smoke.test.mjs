/**
 * El único camino que ningún test unitario cubre: la app real arrancando, el motor
 * levantándose solo y un PDF abriéndose de punta a punta. Los tests del renderer
 * corren contra un `fetch` stubeado, así que un motor que no arranca (token, puerto,
 * ruta del exe) pasaba el CI entero en verde.
 *
 * Se corre a mano con `npm run e2e`: necesita el build (`npm run build`) y el venv
 * del motor en `backend/venv`, que en CI no existen. No está en el pipeline a
 * propósito — ver DOCUMENTATION.md, sección Tests.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainJs = join(raiz, 'out', 'main', 'index.js')
const python = join(raiz, '..', 'backend', 'venv', 'Scripts', 'python.exe')
const ARRANQUE = 60_000

/** El motor usa un puerto fijo. Si ya hay uno escuchando (la app instalada abierta,
 * o uno huérfano), el que levante este test no puede bindear y la app le habla al
 * ajeno: 403 por token distinto. Eso no es un fallo del código, así que se salta con
 * el motivo en vez de dar un rojo que no dice nada. */
function puertoOcupado(puerto) {
  return new Promise((listo) => {
    const sock = connect({ host: '127.0.0.1', port: puerto })
    const cerrar = (ocupado) => { sock.destroy(); listo(ocupado) }
    sock.setTimeout(1500)
    sock.on('connect', () => cerrar(true))
    sock.on('error', () => cerrar(false))
    sock.on('timeout', () => cerrar(false))
  })
}

let app
let win
let motivoDeSalto = null

before(async () => {
  if (!existsSync(mainJs)) throw new Error(`Falta ${mainJs}: corré "npm run build" antes del e2e.`)
  if (!existsSync(python)) throw new Error(`Falta ${python}: el e2e levanta el motor de desarrollo desde el venv.`)
  if (await puertoOcupado(8745)) {
    motivoDeSalto = 'el puerto 8745 ya está tomado por otro pdf-engine: cerrá PDF Master y reintentá'
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'pdfmaster-e2e-'))
  const pdf = join(dir, 'plano-e2e.pdf')
  execFileSync(python, ['-c', 'import fitz,sys;d=fitz.open();[d.new_page() for _ in range(3)];d.save(sys.argv[1])', pdf])

  // `cwd` importa: sin empaquetar, el main busca el motor en
  // `process.cwd()/../backend/venv`. El PDF va como argumento, que es el mismo
  // camino que "abrir con" del Explorador.
  app = await electron.launch({ args: [mainJs, pdf], cwd: raiz, timeout: ARRANQUE })
  win = await app.firstWindow({ timeout: ARRANQUE })
})

after(async () => {
  await app?.close()
})

const pestañas = '[aria-label="Documentos abiertos"] [role="tab"]'

test('abre el PDF que le pasan por línea de comandos', async (t) => {
  if (motivoDeSalto) return t.skip(motivoDeSalto)
  await win.waitForSelector(pestañas, { timeout: ARRANQUE })
  assert.match(await win.textContent(pestañas), /plano-e2e/)
})

test('el motor arrancó y rasterizó la primera página', async (t) => {
  if (motivoDeSalto) return t.skip(motivoDeSalto)
  // Sin motor no hay bitmap: esto es exactamente lo que el CI no puede ver con el
  // fetch stubeado.
  await win.waitForSelector('img[alt="Página 1"]', { timeout: ARRANQUE })
  const src = await win.getAttribute('img[alt="Página 1"]', 'src')
  assert.ok(src?.startsWith('blob:'), `la página no se rasterizó: src=${src}`)
})

test('la barra de estado cuenta las tres páginas', async (t) => {
  if (motivoDeSalto) return t.skip(motivoDeSalto)
  assert.equal(await win.inputValue('[aria-label="Página actual"]'), '1')
  const contador = win.locator('[aria-label="Página actual"]').locator('xpath=..')
  assert.match(await contador.innerText(), /\/\s*3/)
})

test('cerrar la pestaña cierra el documento', async (t) => {
  if (motivoDeSalto) return t.skip(motivoDeSalto)
  await win.click('[aria-label^="Cerrar plano-e2e"]')
  await win.waitForSelector(pestañas, { state: 'detached', timeout: 20_000 })
})
