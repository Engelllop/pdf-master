import { createServer } from 'net'

/** El puerto de siempre. Se sigue intentando primero: es el que conocen los motores
 * huérfanos de versiones anteriores (y el que mira el e2e), así que moverse sin
 * necesidad rompería el `liberarPuertoDeMotoresViejos` que los limpia. */
export const PUERTO_PREFERIDO = 8745

/** Cuántos puertos consecutivos se miran antes de rendirse. El renderer solo puede
 * hablar con los que la CSP de `index.html` autoriza: si esto sube, esa lista
 * también. */
export const PUERTOS_A_PROBAR = 8

export function rangoDePuertos(
  desde: number = PUERTO_PREFERIDO,
  cuantos: number = PUERTOS_A_PROBAR,
): number[] {
  return Array.from({ length: cuantos }, (_, i) => desde + i)
}

/** ¿Se puede bindear 127.0.0.1:puerto ahora mismo? Se pregunta bindeando de verdad y
 * soltando: un `connect` que falla no distingue "libre" de "hay algo que no acepta
 * conexiones", y es el bind el que va a hacer el motor. */
export function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((listo) => {
    const srv = createServer()
    srv.once('error', () => listo(false))
    srv.once('listening', () => srv.close(() => listo(true)))
    srv.listen(puerto, '127.0.0.1')
  })
}

/**
 * Primer puerto del rango que esté libre, o null si están todos tomados.
 *
 * La sonda se inyecta para poder probar la elección sin abrir sockets.
 */
export async function primerPuertoLibre(
  desde: number = PUERTO_PREFERIDO,
  cuantos: number = PUERTOS_A_PROBAR,
  libre: (puerto: number) => Promise<boolean> = puertoLibre,
): Promise<number | null> {
  for (const puerto of rangoDePuertos(desde, cuantos)) {
    if (await libre(puerto)) return puerto
  }
  return null
}
