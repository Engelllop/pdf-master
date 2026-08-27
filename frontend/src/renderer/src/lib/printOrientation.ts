export interface TamanoPagina {
  page_num: number
  width: number
  height: number
}

/** `true` si lo que se va a imprimir es mayoritariamente apaisado.
 *
 * Electron imprime en vertical si no se le dice otra cosa, así que un juego de láminas
 * apaisadas salía girado y encogido a una esquina del papel salvo que el usuario se
 * diera cuenta y lo cambiara en el diálogo. Se decide por mayoría de LAS PÁGINAS QUE SE
 * IMPRIMEN, no del documento: extraer las dos láminas apaisadas de un informe vertical
 * tiene que salir apaisado.
 *
 * Empate (o nada que medir) → vertical, que es lo que hacía antes. */
export function esApaisado(tamanos: TamanoPagina[], paginas?: number[]): boolean {
  const objetivo = paginas?.length
    ? tamanos.filter((t) => paginas.includes(t.page_num))
    : tamanos
  let apaisadas = 0
  let verticales = 0
  for (const t of objetivo) {
    if (!(t.width > 0) || !(t.height > 0)) continue
    if (t.width > t.height) apaisadas++
    else verticales++
  }
  return apaisadas > verticales
}
