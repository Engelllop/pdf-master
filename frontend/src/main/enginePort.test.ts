import { describe, expect, it } from 'vitest'
import { PUERTOS_A_PROBAR, PUERTO_PREFERIDO, primerPuertoLibre, puertoLibre, rangoDePuertos } from './enginePort'
import { createServer, Server } from 'net'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

describe('rango de puertos del motor', () => {
  it('empieza en el preferido y es consecutivo', () => {
    expect(rangoDePuertos()).toEqual([8745, 8746, 8747, 8748, 8749, 8750, 8751, 8752])
    expect(rangoDePuertos()).toHaveLength(PUERTOS_A_PROBAR)
    expect(rangoDePuertos()[0]).toBe(PUERTO_PREFERIDO)
  })
})

describe('elección del puerto', () => {
  it('se queda en el preferido cuando está libre', async () => {
    const mirados: number[] = []
    const elegido = await primerPuertoLibre(PUERTO_PREFERIDO, 4, async (p) => {
      mirados.push(p)
      return true
    })
    expect(elegido).toBe(PUERTO_PREFERIDO)
    // No se molesta en mirar el resto: el primero libre gana.
    expect(mirados).toEqual([PUERTO_PREFERIDO])
  })

  it('salta al siguiente cuando el preferido lo tiene otro programa', async () => {
    const ocupados = new Set([8745, 8746])
    const elegido = await primerPuertoLibre(8745, 4, async (p) => !ocupados.has(p))
    expect(elegido).toBe(8747)
  })

  it('devuelve null si están todos tomados, en vez de inventar uno', async () => {
    const elegido = await primerPuertoLibre(8745, 4, async () => false)
    expect(elegido).toBeNull()
  })

  it('no mira más puertos de los que se le piden', async () => {
    const mirados: number[] = []
    await primerPuertoLibre(9000, 3, async (p) => {
      mirados.push(p)
      return false
    })
    expect(mirados).toEqual([9000, 9001, 9002])
  })
})

describe('la CSP del renderer autoriza todo el rango', () => {
  // El rango vive en TypeScript y la CSP en un `<meta>` de HTML: subir
  // PUERTOS_A_PROBAR sin tocar el html deja al motor en un puerto al que el renderer
  // no puede hablar, y el síntoma es "no carga nada" sin error de red visible.
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'index.html'),
    'utf-8',
  )
  const directiva = (nombre: string): number[] => {
    const cuerpo = html.match(new RegExp(`${nombre} ([^;"]*)`))?.[1] ?? ''
    return [...cuerpo.matchAll(/http:\/\/localhost:(\d+)/g)].map((m) => Number(m[1]))
  }

  it('connect-src lista exactamente los puertos del rango', () => {
    expect(directiva('connect-src')).toEqual(rangoDePuertos())
  })

  it('img-src lista exactamente los puertos del rango', () => {
    expect(directiva('img-src')).toEqual(rangoDePuertos())
  })
})

describe('sonda real de puertos', () => {
  it('ve ocupado un puerto que alguien está escuchando, y libre al soltarlo', async () => {
    // Con la sonda mockeada en el resto de los tests, nada probaba que `puertoLibre`
    // mire lo que dice mirar: un `createServer` que resolviera siempre `true` habría
    // pasado todo lo de arriba y dejado el fallback muerto.
    const srv: Server = createServer()
    const puerto = await new Promise<number>((listo) => {
      srv.listen(0, '127.0.0.1', () => {
        const dir = srv.address()
        listo(typeof dir === 'object' && dir ? dir.port : 0)
      })
    })

    expect(await puertoLibre(puerto)).toBe(false)

    await new Promise<void>((listo) => srv.close(() => listo()))
    expect(await puertoLibre(puerto)).toBe(true)
  })
})
