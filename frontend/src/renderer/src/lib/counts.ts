import { type Annotation } from '../store/usePdfStore'

/** Numera las marcas de conteo por categoría en orden de creación. Se calcula al
 * vuelo (no se guarda en la anotación) para que al borrar una marca el resto se
 * renumere solo y nunca queden huecos. */
// Memo de una sola entrada por identidad del array. En scroll continuo cada página
// visible llamaba a esta función con EL MISMO array de marcas del documento: con un
// plano de miles de conteos eso era un filtro + sort completos por página pintada.
// El store nunca muta el array in situ (siempre lo reemplaza), así que comparar la
// referencia basta para saber si el resultado sigue siendo válido.
let ultimoInput: Annotation[] | null = null
let ultimoOutput: Map<string, number> = new Map()

export function countNumbers(annotations: Annotation[]): Map<string, number> {
  if (ultimoInput === annotations) return ultimoOutput
  const counts = annotations
    .filter((a) => a.type === 'count')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const perCategory = new Map<string, number>()
  const numbers = new Map<string, number>()
  for (const a of counts) {
    const cat = a.text || 'General'
    const n = (perCategory.get(cat) || 0) + 1
    perCategory.set(cat, n)
    numbers.set(a.id, n)
  }
  ultimoInput = annotations
  ultimoOutput = numbers
  return numbers
}
