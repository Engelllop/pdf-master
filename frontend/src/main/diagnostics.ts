/**
 * Cuando algo falla en la máquina de otro, lo único que hay es "se me cerró". Los
 * logs existen desde v1.15 pero están en %APPDATA%\pdf-master\logs, que nadie sabe
 * encontrar ni sabe que existe. Esto arma UN archivo de texto con lo que se
 * preguntaría por teléfono: versiones, si el motor responde, la última operación en
 * vuelo y la cola de los logs.
 */

export type DatosDiagnostico = {
  generadoEn: string
  appVersion: string
  motorVersion: string | null
  /** null = no contestó al health en el tiempo dado. */
  motorRespondio: boolean
  plataforma: string
  versiones: Record<string, string>
  rutas: Record<string, string>
  ventanasConCambios: number
  enVuelo: string
  logs: Array<{ nombre: string; contenido: string }>
}

/** Cola del texto, sin cortar a media línea: un log de 5 MB no cabe en un pegado
 * de correo, y lo que importa es lo último que pasó. */
export function colaDeTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto
  const recorte = texto.slice(texto.length - maxCaracteres)
  const salto = recorte.indexOf('\n')
  const limpio = salto >= 0 ? recorte.slice(salto + 1) : recorte
  return `…(recortado: se muestran los últimos ${limpio.length} caracteres)\n${limpio}`
}

export function construirDiagnostico(d: DatosDiagnostico): string {
  const partes: string[] = []
  partes.push('PDF Master — diagnóstico')
  partes.push(`Generado: ${d.generadoEn}`)
  partes.push(`App: ${d.appVersion}`)
  partes.push(`Motor: ${d.motorRespondio ? `responde (versión ${d.motorVersion ?? 'desconocida'})` : 'NO responde al health-check'}`)
  partes.push(`Plataforma: ${d.plataforma}`)
  partes.push(`Versiones: ${Object.entries(d.versiones).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  partes.push(`Ventanas con cambios sin guardar: ${d.ventanasConCambios}`)
  partes.push('')
  partes.push('Rutas:')
  for (const [nombre, ruta] of Object.entries(d.rutas)) partes.push(`  ${nombre}: ${ruta}`)
  partes.push('')
  partes.push('--- Operación en vuelo al generar (inflight.txt) ---')
  partes.push(d.enVuelo || '(ninguna)')
  for (const log of d.logs) {
    partes.push('')
    partes.push(`--- ${log.nombre} ---`)
    partes.push(log.contenido || '(vacío)')
  }
  partes.push('')
  return partes.join('\n')
}

/** `pdf-master-diagnostico-2026-09-04_1530.txt`: ordena solo y no lleva ni rutas ni
 * nombre de archivo del usuario (un diagnóstico se manda por correo). */
export function nombreArchivoDiagnostico(fecha: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0')
  const f = `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
  const h = `${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}`
  return `pdf-master-diagnostico-${f}_${h}.txt`
}
