/**
 * El arranque hacía `taskkill /F /IM pdf-engine.exe`: eso mata TODOS los motores de
 * la máquina, incluido el de otra instalación, el de otro usuario de la misma sesión
 * o el que otra ventana de la app acababa de levantar. Aquí el motor deja su PID en
 * un archivo y solo se mata ese, y solo si el PID sigue siendo un pdf-engine.exe
 * (Windows recicla PIDs, y matar el PID equivocado es peor que dejar el puerto
 * ocupado).
 */

export const IMAGEN_MOTOR = 'pdf-engine.exe'

/** Contenido del pidfile → PID utilizable, o null si está vacío/corrupto. */
export function pidGuardado(contenido: string | null | undefined): number | null {
  if (!contenido) return null
  const pid = Number(contenido.trim())
  if (!Number.isInteger(pid) || pid <= 0) return null
  return pid
}

/**
 * `tasklist /FI "PID eq N" /FI "IMAGENAME eq pdf-engine.exe" /NH` imprime una línea
 * con la imagen y el PID cuando hay coincidencia; cuando no la hay imprime
 * "INFO: No tasks are running..." (o su traducción), que NO es un error de proceso:
 * hay que distinguirlo de la línea real o se acaba matando lo que sea que tenga ese
 * PID ahora.
 */
export function esNuestroMotor(salidaTasklist: string, pid: number): boolean {
  if (!salidaTasklist) return false
  return salidaTasklist
    .split(/\r?\n/)
    .some((linea) => {
      const l = linea.trim()
      if (!l || /^INFO:/i.test(l)) return false
      if (!l.toLowerCase().includes(IMAGEN_MOTOR)) return false
      return new RegExp(`(^|\\s)${pid}(\\s|$)`).test(l)
    })
}

export function comandoTasklist(pid: number): string {
  return `tasklist /FI "PID eq ${pid}" /FI "IMAGENAME eq ${IMAGEN_MOTOR}" /NH`
}

/** `/T` se lleva el árbol: pdf-engine.exe es PyInstaller onefile, así que el
 * bootloader lanza un hijo y matar solo al padre dejaba el puerto ocupado. */
export function comandoMatarArbol(pid: number): string {
  return `taskkill /F /T /PID ${pid}`
}
