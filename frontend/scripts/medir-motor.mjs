/**
 * Cuánto tarda el motor desde que se lanza hasta que contesta `/pdf/health`.
 *
 * Es lo que el usuario espera antes de ver la primera página, y hasta ahora nadie lo
 * había medido: se daba por hecho que era «lo que tarda Python». Separa el coste de
 * PyInstaller (descomprimir el onefile en %TEMP% en cada arranque) del de importar
 * fitz y compañía, midiendo también el motor de desarrollo desde el venv.
 *
 *   npm run medir:motor              # el .exe de resources/backend
 *   npm run medir:motor -- --venv    # el de desarrollo (python main.py)
 *   npm run medir:motor -- ruta.exe
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VUELTAS = Number(process.env.VUELTAS || 5)

const args = process.argv.slice(2)
const usarVenv = args.includes('--venv')
const rutaSuelta = args.find((a) => !a.startsWith('--'))

let cmd
let argv
let cwd
let etiqueta
if (usarVenv) {
  cmd = join(raiz, '..', 'backend', 'venv', 'Scripts', 'python.exe')
  argv = ['main.py']
  cwd = join(raiz, '..', 'backend')
  etiqueta = 'motor de desarrollo (python main.py)'
} else {
  cmd = rutaSuelta ? resolve(rutaSuelta) : join(raiz, 'resources', 'backend', 'pdf-engine.exe')
  argv = []
  cwd = undefined
  etiqueta = cmd.replace(/\\/g, '/').split('/').slice(-2).join('/')
}
if (!existsSync(cmd)) throw new Error(`no existe ${cmd}`)

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

const matar = (pid) => {
  try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch { /* ya murió */ }
}

async function unaVuelta() {
  const puerto = await puertoLibre()
  const inicio = process.hrtime.bigint()
  const proc = spawn(cmd, argv, {
    cwd, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, PDFMASTER_PORT: String(puerto) },
  })
  let muerto = false
  proc.on('exit', () => { muerto = true })
  try {
    const limite = Date.now() + 60_000
    while (Date.now() < limite) {
      if (muerto) throw new Error('el motor murió al arrancar')
      try {
        const res = await fetch(`http://127.0.0.1:${puerto}/pdf/health`, { signal: AbortSignal.timeout(1000) })
        if (res.ok) return Number(process.hrtime.bigint() - inicio) / 1e6
      } catch { /* todavía no escucha */ }
      // Sondeo fino: con 400 ms de espera, la medición se redondea a 400.
      await new Promise((r) => setTimeout(r, 15))
    }
    throw new Error('no contestó en 60 s')
  } finally {
    if (proc.pid) matar(proc.pid)
  }
}

const muestras = []
for (let i = 0; i < VUELTAS; i++) muestras.push(await unaVuelta())

const orden = [...muestras].sort((a, b) => a - b)
const ms = (n) => `${n.toFixed(0)} ms`
console.log(`\n  ${etiqueta}  (${VUELTAS} arranques)\n`)
console.log(`  mediana  ${ms(orden[Math.floor(orden.length / 2)])}`)
console.log(`  mínimo   ${ms(orden[0])}`)
console.log(`  máximo   ${ms(orden[orden.length - 1])}`)
console.log(`  todos    ${orden.map((n) => n.toFixed(0)).join(', ')}\n`)
