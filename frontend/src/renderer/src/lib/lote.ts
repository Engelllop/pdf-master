import { usePdfStore } from '../store/usePdfStore'
import { correrCola, ResultadoCola } from './batchQueue'

/**
 * Recorrido por lotes con la barra del store y cancelación.
 *
 * El cableado —`startProgress`, `updateProgress` en cada paso, `endProgress` en un
 * `finally`— estaba copiado en `runBatch` y en la búsqueda en todos los documentos, y
 * la copia ya se había desincronizado una vez (la búsqueda corría sin barra ni forma
 * de cortar). El mensaje final NO va acá: «13/60 rotados» y «312 resultados en 60
 * documentos» no se parecen, así que se devuelve el resultado crudo y lo redacta quien
 * llama.
 */
export async function correrLote<T>(
  etiqueta: string,
  items: T[],
  nombre: (item: T) => string,
  op: (item: T, index: number) => Promise<boolean>,
): Promise<ResultadoCola> {
  const { startProgress, updateProgress, endProgress, isCancelRequested } = usePdfStore.getState()
  startProgress(etiqueta, items.length)
  try {
    return await correrCola(items, op, {
      avanzar: (n, item) => updateProgress(n, nombre(item)),
      cancelado: isCancelRequested,
    })
  } finally {
    endProgress()
  }
}
