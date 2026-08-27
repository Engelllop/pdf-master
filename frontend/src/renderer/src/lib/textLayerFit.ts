/**
 * Ajuste horizontal de la capa de texto invisible.
 *
 * La fuente del PDF no es la del navegador, así que el ancho natural del texto nunca
 * coincide con el del span original: sin corregirlo el texto se desborda y la
 * selección tapa lo que no es. Igual que PDF.js, se mide el ancho real y se corrige
 * con `scaleX`.
 *
 * Vive aparte del componente porque el ORDEN importa y es fácil de romper sin darse
 * cuenta: el bucle original hacía escritura → medición → escritura por cada span, y
 * cada medición después de una escritura fuerza al navegador a recalcular el layout
 * de la capa entera. En una lámina con mucho texto son cientos de reflows sincrónicos
 * en cada cambio de zoom (y en `useLayoutEffect`, o sea antes de pintar: el zoom se
 * sentía trabado). Agrupando las escrituras y luego las mediciones, son N reflows → 1.
 */
export interface SpanAjustable {
  dataset: { w?: string }
  style: { transform: string }
  getBoundingClientRect: () => { width: number }
}

export function ajustarEscalaHorizontal(spans: ArrayLike<SpanAjustable>, hostScale: number): void {
  const escala = hostScale || 1
  const n = spans.length
  if (n === 0) return

  // 1) Todas las escrituras juntas: una sola invalidación de layout.
  for (let i = 0; i < n; i++) spans[i].style.transform = ''

  // 2) Todas las mediciones juntas: la primera provoca el reflow y las demás ya leen
  //    un layout limpio, porque entre ellas no se escribe nada.
  const naturales = new Array<number>(n)
  for (let i = 0; i < n; i++) naturales[i] = spans[i].getBoundingClientRect().width / escala

  // 3) Y las correcciones al final, que no necesitan volver a medir.
  for (let i = 0; i < n; i++) {
    const objetivo = Number(spans[i].dataset.w)
    if (!objetivo) continue
    if (naturales[i] > 0.5) spans[i].style.transform = `scaleX(${objetivo / naturales[i]})`
  }
}
