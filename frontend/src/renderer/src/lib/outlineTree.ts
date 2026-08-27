import type { OutlineItem } from '../store/usePdfStore'

/** El índice del PDF es un árbol, así que una entrada se identifica por su ruta:
 * `[0, 2]` = la tercera hija de la primera raíz. Sin esto solo se podía AÑADIR al
 * final: una entrada mal puesta (o el índice equivocado de un PDF ajeno) no había
 * forma de quitarla ni de renombrarla desde la app. */
export type RutaIndice = number[]

function editarEnRuta(
  items: OutlineItem[],
  ruta: RutaIndice,
  cambio: (hermanos: OutlineItem[], i: number) => OutlineItem[],
): OutlineItem[] {
  const [i, ...resto] = ruta
  if (i === undefined || i < 0 || i >= items.length) return items
  if (resto.length === 0) return cambio(items, i)
  const hijo = items[i]
  return items.map((it, j) =>
    j === i ? { ...hijo, children: editarEnRuta(hijo.children || [], resto, cambio) } : it,
  )
}

/** Quita la entrada de esa ruta. Se lleva sus hijas: en el TOC de un PDF el nivel
 * cuelga del padre, así que dejarlas huérfanas las subiría de nivel y el índice
 * quedaría distinto del que el usuario ve. */
export function borrarEnRuta(items: OutlineItem[], ruta: RutaIndice): OutlineItem[] {
  return editarEnRuta(items, ruta, (hermanos, i) => hermanos.filter((_, j) => j !== i))
}

export function renombrarEnRuta(items: OutlineItem[], ruta: RutaIndice, titulo: string): OutlineItem[] {
  return editarEnRuta(items, ruta, (hermanos, i) =>
    hermanos.map((it, j) => (j === i ? { ...it, title: titulo } : it)),
  )
}

/** Título de la entrada en esa ruta (para el diálogo de renombrar y el de borrar). */
export function tituloEnRuta(items: OutlineItem[], ruta: RutaIndice): string {
  let nodo: OutlineItem | undefined
  let nivel = items
  for (const i of ruta) {
    nodo = nivel[i]
    if (!nodo) return ''
    nivel = nodo.children || []
  }
  return nodo?.title ?? ''
}

/** Cuántas entradas cuelgan de esa ruta, ella incluida: el aviso de borrado dice
 * cuántas se van, que borrar un capítulo con veinte hijas no es lo mismo que borrar
 * una línea. */
export function cuantasCuelgan(items: OutlineItem[], ruta: RutaIndice): number {
  let nodo: OutlineItem | undefined
  let nivel = items
  for (const i of ruta) {
    nodo = nivel[i]
    if (!nodo) return 0
    nivel = nodo.children || []
  }
  const contar = (n: OutlineItem): number =>
    1 + (n.children || []).reduce((acc, h) => acc + contar(h), 0)
  return nodo ? contar(nodo) : 0
}
