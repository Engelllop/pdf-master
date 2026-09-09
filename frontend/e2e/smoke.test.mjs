/**
 * El único camino que ningún test unitario cubre: la app real arrancando, el motor
 * levantándose solo y un PDF abriéndose de punta a punta. Los tests del renderer
 * corren contra un `fetch` stubeado, así que un motor que no arranca (token, puerto,
 * ruta del exe) pasaba el CI entero en verde.
 *
 * Corre en CI (job `e2e`) y a mano con `npm run e2e`. Necesita el build
 * (`npm run build`) y el venv del motor en `backend/venv`.
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

/** El motor ya NO usa un puerto fijo: si el 8745 está tomado (la app instalada
 * abierta, o un huérfano) se muda al siguiente libre del rango, así que este test
 * corre igual — y de paso eso es justo lo que prueba. Solo se salta si están tomados
 * los ocho, que ahí sí no hay dónde arrancar. */
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
  const RANGO = Array.from({ length: 8 }, (_, i) => 8745 + i)
  const libres = []
  for (const p of RANGO) if (!(await puertoOcupado(p))) libres.push(p)
  if (libres.length === 0) {
    motivoDeSalto = `los puertos ${RANGO[0]}-${RANGO.at(-1)} están todos tomados: no hay dónde arrancar el motor`
    return
  }
  if (libres[0] !== 8745) console.log(`  (el 8745 está tomado: el motor debería mudarse al ${libres[0]})`)

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

// Nueve vistas y paneles pasaron a `React.lazy` para sacarlos del chunk de arranque.
// Un `import()` que no resuelva en el renderer empaquetado (ruta del chunk, CSP,
// file://) no rompe el arranque: rompe el panel, y solo cuando alguien lo abre. Los
// tests de jsdom no lo ven porque ahí no hay chunks. Así que se abren de verdad.
const paneles = [
  { nombre: 'paleta de comandos', abrir: (w) => w.keyboard.press('Control+k'), selector: '[aria-label="Paleta de comandos"]' },
  { nombre: 'panel de atajos', abrir: (w) => w.keyboard.press('F1'), selector: 'text=/Atajos/i' },
  { nombre: 'ajustes', abrir: (w) => evento(w, 'app:show-settings'), selector: '[aria-label="Ajustes"]' },
  { nombre: 'sellos y firmas', abrir: (w) => evento(w, 'app:show-stamps'), selector: 'text=/firma/i' },
  { nombre: 'organizar páginas', abrir: (w) => evento(w, 'app:page-organizer'), selector: '[aria-label="Organizar páginas"]' },
  { nombre: 'asistente IA', abrir: (w) => evento(w, 'app:ai-open'), selector: 'text=/Anthropic/i' },
]

const evento = (w, nombre) => w.evaluate((n) => window.dispatchEvent(new CustomEvent(n)), nombre)

for (const { nombre, abrir, selector } of paneles) {
  test(`el panel en diferido «${nombre}» abre de verdad`, async (t) => {
    if (motivoDeSalto) return t.skip(motivoDeSalto)
    await abrir(win)
    await win.waitForSelector(selector, { timeout: 20_000 })
    // Escape para no dejarlo tapando al siguiente. No se espera a que desaparezca:
    // no todos cierran con Escape (el asistente se cierra por su botón) y esperar el
    // timeout de los que no costaba veinte segundos por panel.
    await win.keyboard.press('Escape')
  })
}

test('cerrar la pestaña cierra el documento', async (t) => {
  if (motivoDeSalto) return t.skip(motivoDeSalto)
  await win.click('[aria-label^="Cerrar plano-e2e"]')
  await win.waitForSelector(pestañas, { state: 'detached', timeout: 20_000 })
})
