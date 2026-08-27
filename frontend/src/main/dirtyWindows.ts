/**
 * Estado «hay cambios sin guardar» POR VENTANA.
 *
 * Era una única bandera global (`hasUnsavedChanges`) para toda la app, y la app abre
 * varias ventanas ("Nueva ventana"). Cada renderer avisa su propio estado, así que
 * la última en hablar mandaba: abrir una ventana nueva y limpia apagaba la bandera y
 * cerrar la ventana con el plano marcado ya NO preguntaba nada — el trabajo se perdía
 * en silencio. Lo mismo al elegir «cerrar sin guardar» en una ventana: apagaba la
 * bandera de las otras.
 */
const dirtyPorVentana = new Map<number, boolean>()

export function setWindowDirty(windowId: number, dirty: boolean): void {
  if (dirty) dirtyPorVentana.set(windowId, true)
  else dirtyPorVentana.delete(windowId)
}

export function isWindowDirty(windowId: number): boolean {
  return dirtyPorVentana.get(windowId) === true
}

/** Al cerrarse la ventana: los ids de BrowserWindow no se reciclan, pero dejar la
 * entrada hace crecer el Map durante toda la sesión. */
export function forgetWindow(windowId: number): void {
  dirtyPorVentana.delete(windowId)
}

/** Cuántas ventanas tienen trabajo sin guardar. Lo consulta el auto-updater: ofrecer
 * «Reiniciar ahora» y quitar la app con un plano marcado a medias es justo lo que el
 * producto llama fatal. */
export function dirtyWindowCount(): number {
  return dirtyPorVentana.size
}
