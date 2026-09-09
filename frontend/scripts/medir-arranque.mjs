/**
 * Mide el arranque del renderer en la app REAL, varias veces, y saca la mediana.
 * No es un test: es una medición para decidir, y las cifras se reportan tal cual.
 */
import { existsSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// `MAIN_JS` permite medir un build alternativo (out-a/, out-b/) sin reconstruir entre
// tandas: es lo unico que hace comparable un A/B cuando la maquina deriva.
const mainJs = process.env.MAIN_JS
  ? resolve(process.env.MAIN_JS)
  : join(raiz, 'out', 'main', 'index.js')
const python = join(raiz, '..', 'backend', 'venv', 'Scripts', 'python.exe')
const VUELTAS = Number(process.env.VUELTAS || 5)
const etiqueta = process.argv[2] || 'sin etiqueta'

if (!existsSync(mainJs)) throw new Error(`falta ${mainJs}`)

const dir = mkdtempSync(join(tmpdir(), 'pdfmaster-medir-'))
const pdf = join(dir, 'plano.pdf')
execFileSync(python, ['-c', 'import fitz,sys;d=fitz.open();[d.new_page(width=2592,height=1728) for _ in range(3)];d.save(sys.argv[1])', pdf])

const medianas = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// `conDoc=0` arranca SIN pasarle un PDF: así el primer pintado no queda detrás del
// arranque del motor (uno o dos segundos), que es lo que enmascaraba todo.
const CON_DOC = process.env.CON_DOC !== '0'
const muestras = { domListo: [], primerPintado: [], listo: [] }

for (let i = 0; i < VUELTAS; i++) {
  const app = await electron.launch({
    args: CON_DOC ? [mainJs, pdf] : [mainJs],
    cwd: raiz, timeout: 60_000,
  })
  const win = await app.firstWindow({ timeout: 60_000 })

  // Primer commit de React: el instante en que el bundle acabó de parsearse,
  // compilarse y ejecutarse. Es lo único que puede mover el tamaño del chunk.
  const primerPintado = await win.evaluate(() => new Promise((listo) => {
    const raiz = document.getElementById('root')
    const ya = () => raiz && raiz.childElementCount > 0
    if (ya()) return listo(performance.now())
    new MutationObserver((_m, obs) => {
      if (ya()) { obs.disconnect(); listo(performance.now()) }
    }).observe(raiz, { childList: true, subtree: true })
  }))

  // Con documento: la página rasterizada (ahí ya hizo falta pdfjs, en chunk aparte).
  // Sin documento: la portada, que es todo lo que hay.
  const selector = CON_DOC ? 'img[alt="Página 1"]' : 'text=/Arrastrá un PDF/'
  await win.waitForSelector(selector, { timeout: 60_000 })
  const listo = await win.evaluate(() => performance.now())

  const domListo = await win.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    return nav?.domContentLoadedEventEnd ?? 0
  })

  muestras.domListo.push(domListo)
  muestras.primerPintado.push(primerPintado)
  muestras.listo.push(listo)
  await app.close()
}

const ms = (n) => `${n.toFixed(0)} ms`
console.log(`\n  ${etiqueta}  (mediana de ${VUELTAS}, ${CON_DOC ? 'con' : 'SIN'} documento)\n`)
console.log(`  ${ms(medianas(muestras.domListo)).padStart(8)}   DOMContentLoaded`)
console.log(`  ${ms(medianas(muestras.primerPintado)).padStart(8)}   primer pintado de React  <-- lo que mueve el tamaño del chunk`)
console.log(`  ${ms(medianas(muestras.listo)).padStart(8)}   ${CON_DOC ? 'página rasterizada' : 'portada en pantalla'}`)
console.log('')
