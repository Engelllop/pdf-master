/** Pasa la posición del ratón a las unidades LOCALES del overlay de la página.
 *
 * La página se dibuja dentro de un `transform: scale(...)`, así que
 * `getBoundingClientRect()` ya viene escalado: restar `rect.left` sin dividir mezclaba
 * px de pantalla con px del bitmap. El `mousedown` sí llega en locales (`offsetX`, que
 * el navegador des-transforma), así que al mover el ratón la marca pegaba un salto
 * proporcional a la diferencia — visible en cualquier zoom que no cayera justo en un
 * paso de 0.5, o sea casi siempre. Mismo cálculo que ya hacía `TextLayer`. */
export function localPointFromClient(
  el: { getBoundingClientRect(): DOMRect },
  clientX: number,
  clientY: number,
  localWidth: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  const escala = rect.width > 0 && localWidth > 0 ? rect.width / localWidth : 1
  return { x: (clientX - rect.left) / escala, y: (clientY - rect.top) / escala }
}
