import { describe, expect, it } from 'vitest'
import {
  comandoMatarArbol, comandoMotoresDeEstaInstalacion, comandoTasklist, esNuestroMotor,
  pidGuardado, pidsDeLaSalida,
} from './enginePid'

describe('pidfile del motor', () => {
  it('acepta un PID entero positivo y rechaza basura', () => {
    expect(pidGuardado('12345')).toBe(12345)
    expect(pidGuardado(' 12345\n')).toBe(12345)
    expect(pidGuardado('')).toBeNull()
    expect(pidGuardado(null)).toBeNull()
    expect(pidGuardado('0')).toBeNull()
    expect(pidGuardado('-3')).toBeNull()
    expect(pidGuardado('12.5')).toBeNull()
    expect(pidGuardado('pdf-engine')).toBeNull()
  })
})

describe('identificar el proceso antes de matarlo', () => {
  it('reconoce la línea de tasklist del motor', () => {
    const salida = 'pdf-engine.exe                8123 Console                    1     92.404 K\r\n'
    expect(esNuestroMotor(salida, 8123)).toBe(true)
  })

  it('no confunde el aviso de "sin tareas" con un proceso vivo', () => {
    expect(esNuestroMotor('INFO: No tasks are running which match the specified criteria.', 8123)).toBe(false)
    expect(esNuestroMotor('', 8123)).toBe(false)
  })

  it('no acepta un PID distinto ni otra imagen que contenga el número', () => {
    const salida = 'pdf-engine.exe                8123 Console                    1     92.404 K'
    expect(esNuestroMotor(salida, 812)).toBe(false)
    expect(esNuestroMotor('chrome.exe                    8123 Console            1     92.404 K', 8123)).toBe(false)
  })
})

describe('comandos', () => {
  it('filtran por PID e imagen, y matan el árbol', () => {
    expect(comandoTasklist(42)).toBe('tasklist /FI "PID eq 42" /FI "IMAGENAME eq pdf-engine.exe" /NH')
    expect(comandoMatarArbol(42)).toBe('taskkill /F /T /PID 42')
  })
})

describe('el motor viejo que se quedó con el puerto', () => {
  const RUTA = 'C:\\Users\\x\\AppData\\Local\\Programs\\PDF Master\\resources\\backend\\pdf-engine.exe'

  it('filtra por la ruta del ejecutable, no por el nombre de imagen', () => {
    // Barrer por nombre mataba también el motor de OTRA instalación; la ruta
    // identifica exactamente los de esta.
    const cmd = comandoMotoresDeEstaInstalacion(RUTA)
    expect(cmd).toContain(RUTA)
    expect(cmd).toContain("$_.Name -eq 'pdf-engine.exe'")
  })

  it('no mete comillas dobles dentro del -Command: cmd.exe parte el comando', () => {
    const cmd = comandoMotoresDeEstaInstalacion(RUTA)
    const dentro = cmd.slice(cmd.indexOf('-Command "') + '-Command "'.length, -1)
    expect(dentro.includes('"')).toBe(false)
  })

  it('escapa las comillas simples de la ruta', () => {
    expect(comandoMotoresDeEstaInstalacion("C:\\a'b\\pdf-engine.exe")).toContain("a''b")
  })

  it('lee los PID de la salida y no se suicida', () => {
    expect(pidsDeLaSalida('1234\r\n5678\r\n')).toEqual([1234, 5678])
    expect(pidsDeLaSalida('1234\n5678', [5678])).toEqual([1234])
    expect(pidsDeLaSalida('')).toEqual([])
    expect(pidsDeLaSalida('sin procesos')).toEqual([])
  })
})
