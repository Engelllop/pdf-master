/**
 * Deja `out/renderer/harness.html` servible: copia el stub del preload y engancha
 * el script antes del bundle. Se regenera en cada build porque electron-vite limpia
 * `out/` entero.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const salida = join(aqui, '..', '..', 'out', 'renderer')

copyFileSync(join(aqui, 'api-stub.js'), join(salida, 'api-stub.js'))

const html = readFileSync(join(salida, 'index.html'), 'utf-8')
  // La CSP del renderer solo deja `script-src 'self'`, y aquí hace falta cargar el
  // stub antes del bundle. Es un archivo local de desarrollo: fuera.
  .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '<!-- CSP fuera: banco de pruebas local -->')
  .replace('<script type="module"', '<script src="./api-stub.js"></script>\n    <script type="module"')

writeFileSync(join(salida, 'harness.html'), html, 'utf-8')
console.log('banco listo: out/renderer/harness.html')
