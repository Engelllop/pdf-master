export type UnsavedChoice = 'save' | 'discard' | 'cancel'

/** Puente para que `closeDocument.ts` (fuera de React) abra el mismo diálogo de
 * cambios sin guardar que usa el cierre de la ventana. Sin esto, cerrar una
 * pestaña sacaba el `window.confirm()` nativo de Windows. */
type Handler = (docIds: string[]) => Promise<UnsavedChoice>

let handler: Handler | null = null

export function registerUnsavedHandler(h: Handler): void { handler = h }

export function askUnsaved(docIds: string[]): Promise<UnsavedChoice> {
  return handler ? handler(docIds) : Promise.resolve('cancel')
}
