/**
 * Aviso de «actualización lista». Vive aparte de `index.ts` para poder probar la
 * parte que se puede equivocar en silencio: qué botón significa reiniciar. El aviso
 * salta solo, encima de lo que el usuario esté haciendo, así que con trabajo sin
 * guardar el orden de los botones cambia — y con él el índice de la respuesta.
 */
export interface AvisoActualizacion {
  type: 'info' | 'warning'
  title: string
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
}

export function avisoActualizacionLista(version: string, ventanasSucias: number): AvisoActualizacion {
  if (ventanasSucias > 0) {
    return {
      type: 'warning',
      title: 'Actualización lista',
      message: `La versión ${version} se ha descargado.`,
      detail: ventanasSucias === 1
        ? 'Tenés cambios sin guardar. Si reiniciás ahora se pierden: guardá primero (Ctrl+S) y la actualización se instala al salir.'
        : `Tenés cambios sin guardar en ${ventanasSucias} ventanas. Si reiniciás ahora se pierden: guardá primero (Ctrl+S).`,
      buttons: ['Más tarde', 'Reiniciar y descartar los cambios'],
      // El botón por omisión (y el de Esc) es el que NO pierde trabajo: antes un Enter
      // distraído mientras se marcaba un plano reiniciaba la app sin preguntar nada.
      defaultId: 0,
      cancelId: 0,
    }
  }
  return {
    type: 'info',
    title: 'Actualización lista',
    message: `La versión ${version} se ha descargado.`,
    detail: '¿Deseas reiniciar la aplicación ahora para instalarla?',
    buttons: ['Reiniciar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  }
}

/** El índice de «reiniciar» depende del juego de botones, no es fijo. */
export function respuestaEsReiniciar(response: number, ventanasSucias: number): boolean {
  return ventanasSucias > 0 ? response === 1 : response === 0
}
