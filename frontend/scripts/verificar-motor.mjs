/**
 * El motor que va a entrar al instalador es el que hay en `resources/backend`, y
 * hasta ahora nada lo miraba en un build local: el .exe estaba versionado en git y se
 * quedó congelado en 1.14.2 mientras el producto iba en 1.22.0, así que
 * `npm run build:win` producía un instalador con un motor OCHO versiones viejo y
 * ningún síntoma hasta que algo fallaba en la máquina de otro.
 *
 * No alcanza con mirar el tamaño (eso solo detecta un binario truncado): se arranca
 * el exe en un puerto libre y se le pregunta su versión por `/pdf/health`, que es lo
 * único que no puede mentir. Se corre antes de electron-builder, en local y en CI.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = join(raiz, 'resources', 'backend')
const exe = join(carpeta, 'pdf-engine.exe')
// Desde que el motor es onedir, el .exe es solo el arranque (11 MB) y el peso esta en
// `_internal/`: mirar solo el exe ya no dice si el build salio completo.
const MIN_BYTES = 60 * 1024 * 1024
const ARRANQUE_MS = 60_000

/** Bytes de todo el arbol del motor. */
function pesoDe(dir) {
  let total = 0
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    total += entrada.isDirectory() ? pesoDe(ruta) : statSync(ruta).size
  }
  return total
}

function morir(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`)
  process.exit(1)
}

const esperado = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf-8')).version

const receta =
  `      cd backend && python -m PyInstaller pdf-engine.spec --noconfirm --clean\n` +
  `      # el CONTENIDO de dist/pdf-engine/, no la carpeta:\n` +
  `      cp -r backend/dist/pdf-engine/. frontend/resources/backend/`

if (!existsSync(exe)) {
  morir(
    `Falta ${exe}.\n` +
    `    El motor ya NO viaja en git: hay que compilarlo antes de empaquetar.\n${receta}`,
  )
}
if (!existsSync(join(carpeta, '_internal'))) {
  morir(
    `Está ${exe} pero no su carpeta _internal/.\n` +
    `    El motor es onedir: sin _internal/ el exe arranca y muere sin sus DLL.\n${receta}`,
  )
}

const bytes = pesoDe(carpeta)
const mb = (bytes / 1024 / 1024).toFixed(1)
if (bytes < MIN_BYTES) {
  morir(`El motor pesa ${mb} MB en total: con PyMuPDF+Pillow ronda los 94, así que falta parte del árbol.`)
}

function puertoLibre() {
  return new Promise((listo, falla) => {
    const srv = createServer()
    srv.once('error', falla)
    srv.listen(0, '127.0.0.1', () => {
      const dir = srv.address()
      const puerto = typeof dir === 'object' && dir ? dir.port : 0
      srv.close(() => listo(puerto))
    })
  })
}

const puerto = await puertoLibre()
console.log(`  · motor onedir: ${mb} MB — arrancándolo en el ${puerto} para preguntarle su versión`)

const motor = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: { ...process.env, PDFMASTER_PORT: String(puerto) },
})

let salida = null
motor.on('exit', (code) => { salida = code })

function matar() {
  if (!motor.pid || salida !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(motor.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch { /* ya murió */ }
}

async function versionDelMotor() {
  const limite = Date.now() + ARRANQUE_MS
  while (Date.now() < limite) {
    if (salida !== null) throw new Error(`el motor murió al arrancar (código ${salida})`)
    try {
      const res = await fetch(`http://127.0.0.1:${puerto}/pdf/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return (await res.json()).version
    } catch { /* todavía no escucha */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`el motor no contestó /pdf/health en ${ARRANQUE_MS / 1000}s`)
}

let version
try {
  version = await versionDelMotor()
} catch (err) {
  matar()
  morir(`No se pudo verificar el motor: ${err.message}`)
} finally {
  matar()
}

if (version !== esperado) {
  morir(
    `El motor dice ${version} y el producto ${esperado}.\n` +
    `    Recompilá el motor antes de empaquetar, o el instalador sale con un motor viejo:\n${receta}`,
  )
}

console.log(`  ✓ motor ${version} al día con el producto\n`)
