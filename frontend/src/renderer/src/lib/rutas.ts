/** Windows no distingue mayúsculas ni el sentido de las barras: `C:/Planos/A.pdf` y
 * `c:\planos\a.pdf` son el mismo archivo, y comparar las cadenas tal cual decía que no.
 *
 * Vive aparte de `lib/saveDocument` porque el store también compara rutas (los
 * marcadores se guardan por archivo) y el store no puede importar `saveDocument`, que
 * importa el store. */
export function normalizarRuta(ruta: string): string {
  return ruta.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function mismaRuta(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return normalizarRuta(a) === normalizarRuta(b)
}
