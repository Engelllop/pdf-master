/** Normalización para buscar: sin tildes y en minúscula.
 *
 * En una interfaz en español, escribir «pagina», «medicion» o «ingenieria» en un
 * buscador es lo normal — y antes no encontraba «Página», «Medición» ni la carpeta
 * «Ingeniería». Vive acá porque lo necesitan al menos dos buscadores (la paleta de
 * comandos y los recientes del menú Archivo) y el criterio tiene que ser el mismo.
 */

/** La ñ y la ü NO son letras con tilde: en NFD se descomponen igual que una á, así
 * que quitar los diacríticos a ciegas convierte «Año» en «ano» y «Diseño» en
 * «diseno» — y entonces buscar «ano» encuentra los años. Se apartan antes de
 * normalizar y se devuelven después.
 *
 * Los huecos salen del Área de Uso Privado de Unicode (U+E000…): no aparecen en
 * ninguna ruta ni en ningún rótulo, y a diferencia de los caracteres de control se
 * pueden escribir sin pelearse con el linter.
 */
const APARTAR: Array<[string, string]> = [
  ['ñ', '\ue000'], ['Ñ', '\ue001'],
  ['ü', '\ue002'], ['Ü', '\ue003'],
]

export function sinTildes(texto: string): string {
  let t = texto
  for (const [letra, hueco] of APARTAR) t = t.split(letra).join(hueco)
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return t
    .split('\ue000').join('ñ').split('\ue001').join('ñ')
    .split('\ue002').join('ü').split('\ue003').join('ü')
}

/** ¿`aguja` aparece en `pajar`, ignorando tildes y mayúsculas? */
export function contieneSinTildes(pajar: string, aguja: string): boolean {
  return sinTildes(pajar).includes(sinTildes(aguja))
}
