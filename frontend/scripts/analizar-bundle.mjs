/**
 * ¿Qué hay dentro del bundle del renderer?
 *
 * Vite dice cuánto pesa el chunk pero no de qué está hecho, así que dividirlo era
 * adivinar. Esto atribuye los bytes GENERADOS a cada archivo fuente decodificando el
 * sourcemap, y los agrupa por paquete o por carpeta del proyecto. Sin dependencias
 * nuevas: el VLQ de los mappings son treinta líneas.
 *
 *   npm run analizar:bundle          # analiza out/renderer/assets/*.js
 *   npm run analizar:bundle -- ruta.js
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALOR = new Map([...B64].map((c, i) => [c, i]))

/** Decodifica un segmento VLQ base64 en su lista de enteros con signo. */
function decodificarSegmento(texto) {
  const salida = []
  let resultado = 0
  let desplazamiento = 0
  for (const ch of texto) {
    const digito = VALOR.get(ch)
    if (digito === undefined) return salida
    const continuar = digito & 32
    resultado += (digito & 31) << desplazamiento
    if (continuar) {
      desplazamiento += 5
      continue
    }
    const negativo = resultado & 1
    resultado >>= 1
    salida.push(negativo ? (resultado === 0 ? -0x80000000 : -resultado) : resultado)
    resultado = 0
    desplazamiento = 0
  }
  return salida
}

/**
 * Bytes generados por archivo fuente.
 *
 * Cada mapping dice «la columna X de esta línea generada viene de tal fuente». El
 * tramo entre un mapping y el siguiente se le carga a esa fuente; lo que no está
 * mapeado (el runtime que inyecta el bundler, los helpers) va a «sin mapear».
 */
function bytesPorFuente(codigo, mapa) {
  const lineas = codigo.split('\n')
  const porFuente = new Array(mapa.sources.length).fill(0)
  let sinMapear = 0

  let fuente = 0
  for (const [nLinea, grupo] of mapa.mappings.split(';').entries()) {
    const largoLinea = (lineas[nLinea] ?? '').length + 1 // +1 por el \n
    if (!grupo) {
      sinMapear += largoLinea
      continue
    }
    let colGenerada = 0
    let colAnterior = null
    let fuenteAnterior = null
    for (const segmento of grupo.split(',')) {
      const campos = decodificarSegmento(segmento)
      if (campos.length === 0) continue
      colGenerada += campos[0]
      if (campos.length >= 4) fuente += campos[1]
      if (colAnterior !== null) {
        const tramo = colGenerada - colAnterior
        if (fuenteAnterior === null) sinMapear += tramo
        else porFuente[fuenteAnterior] += tramo
      } else if (colGenerada > 0) {
        sinMapear += colGenerada // lo que va antes del primer mapping de la línea
      }
      colAnterior = colGenerada
      fuenteAnterior = campos.length >= 4 ? fuente : fuenteAnterior
    }
    // La cola de la línea, del último mapping al final.
    const cola = largoLinea - (colAnterior ?? 0)
    if (cola > 0) {
      if (fuenteAnterior === null) sinMapear += cola
      else porFuente[fuenteAnterior] += cola
    }
  }
  return { porFuente, sinMapear }
}

/** Etiqueta con la que se agrupa: el paquete de node_modules, o la carpeta del repo. */
function grupoDe(ruta) {
  const limpia = ruta.replace(/\\/g, '/')
  const nm = limpia.lastIndexOf('node_modules/')
  if (nm !== -1) {
    const resto = limpia.slice(nm + 'node_modules/'.length).split('/')
    return resto[0].startsWith('@') ? `${resto[0]}/${resto[1]}` : resto[0]
  }
  const src = limpia.indexOf('/src/renderer/src/')
  if (src !== -1) {
    const resto = limpia.slice(src + '/src/renderer/src/'.length).split('/')
    return resto.length > 1 ? `src/${resto[0]}/` : 'src/ (raíz)'
  }
  return limpia.split('/').slice(-2).join('/')
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

function analizar(js) {
  const mapa = `${js}.map`
  if (!existsSync(mapa)) {
    console.error(`\n  ✗ Falta ${mapa}.\n    Construí con sourcemap:  $env:ANALIZAR_BUNDLE=1; npm run build\n`)
    process.exit(1)
  }
  const codigo = readFileSync(js, 'utf-8')
  const { porFuente, sinMapear } = bytesPorFuente(codigo, JSON.parse(readFileSync(mapa, 'utf-8')))
  const src = JSON.parse(readFileSync(mapa, 'utf-8')).sources

  const grupos = new Map()
  porFuente.forEach((bytes, i) => {
    if (bytes <= 0) return
    const g = grupoDe(src[i])
    grupos.set(g, (grupos.get(g) ?? 0) + bytes)
  })
  if (sinMapear > 0) grupos.set('(sin mapear: runtime del bundler)', sinMapear)

  const total = codigo.length
  const filas = [...grupos.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n  ${js.split(/[\\/]/).pop()} — ${kb(total)}\n`)
  for (const [nombre, bytes] of filas) {
    const pct = ((bytes / total) * 100).toFixed(1).padStart(5)
    console.log(`  ${pct}%  ${kb(bytes).padStart(10)}  ${nombre}`)
  }

  // Los archivos gordos de uno en uno: es lo que dice QUÉ partir.
  const propios = porFuente
    .map((bytes, i) => ({ bytes, ruta: src[i] }))
    .filter((f) => f.bytes > 12 * 1024)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)
  if (propios.length) {
    console.log('\n  Archivos de más de 12 kB en el bundle:\n')
    for (const { bytes, ruta } of propios) {
      console.log(`  ${kb(bytes).padStart(10)}  ${ruta.replace(/\\/g, '/').replace(/^.*\/src\/renderer\/src\//, 'src/').replace(/^.*node_modules\//, 'nm/')}`)
    }
  }
  console.log('')
}

const pedidos = process.argv.slice(2)
if (pedidos.length > 0) {
  for (const p of pedidos) analizar(resolve(p))
} else {
  const dir = join(raiz, 'out', 'renderer', 'assets')
  const jss = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.js')) : []
  if (jss.length === 0) {
    console.error('\n  ✗ No hay chunks en out/renderer/assets. Construí primero.\n')
    process.exit(1)
  }
  for (const f of jss) analizar(join(dir, f))
}
