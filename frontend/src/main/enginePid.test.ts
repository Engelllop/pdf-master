import { describe, expect, it } from 'vitest'
import { comandoMatarArbol, comandoTasklist, esNuestroMotor, pidGuardado } from './enginePid'

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
