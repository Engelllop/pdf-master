import { type Annotation } from '../store/usePdfStore'

/** Numera las marcas de conteo por categoría en orden de creación. Se calcula al
 * vuelo (no se guarda en la anotación) para que al borrar una marca el resto se
 * renumere solo y nunca queden huecos. */
export function countNumbers(annotations: Annotation[]): Map<string, number> {
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
  return numbers
}
