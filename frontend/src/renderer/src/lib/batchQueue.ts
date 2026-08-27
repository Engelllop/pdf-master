/**
 * Cola secuencial con progreso y cancelación.
 *
 * El motor tiene un solo worker de fitz, así que todo lo que toca varios documentos va
 * de a uno. Ese recorrido —avisar el progreso, mirar si el usuario canceló, contar lo
 * que salió bien— estaba escrito en `runBatch` y NO en la búsqueda en todos los
 * documentos, que se comía minutos sin barra ni forma de cortar.
 */
export interface ControlCola<T> {
  /** Posición ya procesada (0 = arrancando el primero) y el elemento en curso. */
  avanzar: (procesados: number, item: T) => void
  cancelado: () => boolean
}

export interface ResultadoCola {
  /** Cuántos devolvieron true. */
  ok: number
  /** Cuántos se procesaron, salieran bien o mal (menos que el total si se canceló). */
  hechos: number
  cancelado: boolean
}

export async function correrCola<T>(
  items: T[],
  op: (item: T, index: number) => Promise<boolean>,
  ctrl: ControlCola<T>,
): Promise<ResultadoCola> {
  let ok = 0
  let hechos = 0
  for (const [i, item] of items.entries()) {
    // Se mira ANTES de empezar cada uno: lo ya procesado se conserva.
    if (ctrl.cancelado()) return { ok, hechos, cancelado: true }
    ctrl.avanzar(i, item)
    if (await op(item, i)) ok++
    hechos++
    ctrl.avanzar(hechos, item)
  }
  return { ok, hechos, cancelado: false }
}
