/**
 * Barrido de los PDF temporales de impresión.
 *
 * Para imprimir se escribe una copia del documento —CON las marcas sin guardar— en
 * %TEMP%, y se borra en el callback de impresión. Si la app muere con el cuadro de
 * impresión abierto (o el motor se cae en medio), el archivo queda ahí para siempre:
 * copias de planos confidenciales acumulándose en la carpeta temporal del usuario.
 * Nadie limpiaba las de sesiones anteriores.
 */
export const PREFIJO_TEMP_IMPRESION = 'pdfmaster-print-'

/** Una hora: si el cuadro de impresión lleva más que eso abierto, el archivo ya no
 * hace falta (y el barrido corre al arrancar, no mientras se imprime). */
export const EDAD_MAXIMA_MS = 60 * 60 * 1000

export function esTempDeImpresion(nombre: string): boolean {
  return nombre.startsWith(PREFIJO_TEMP_IMPRESION) && nombre.toLowerCase().endsWith('.pdf')
}

export function debeBorrarse(nombre: string, mtimeMs: number, ahora: number, edadMaximaMs = EDAD_MAXIMA_MS): boolean {
  if (!esTempDeImpresion(nombre)) return false
  // Un reloj adelantado (o un archivo con fecha futura) no puede volver el temporal
  // inmortal ni borrar el que se está usando ahora mismo.
  return ahora - mtimeMs >= edadMaximaMs
}
