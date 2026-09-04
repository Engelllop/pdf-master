import { describe, expect, it } from 'vitest'
import { colaDeTexto, construirDiagnostico, nombreArchivoDiagnostico, type DatosDiagnostico } from './diagnostics'

const base: DatosDiagnostico = {
  generadoEn: '2026-09-04T21:30:00.000Z',
  appVersion: '1.19.0',
  motorVersion: '1.19.0',
  motorRespondio: true,
  plataforma: 'win32 10.0.26200 x64',
  versiones: { electron: '43.0.0', chrome: '140.0.0', node: '22.0.0' },
  rutas: { logs: 'C:\\Users\\x\\AppData\\Roaming\\pdf-master\\logs' },
  ventanasConCambios: 2,
  enVuelo: '[a1b2c3d4] POST /pdf/save/abc',
  logs: [{ nombre: 'backend.log', contenido: 'linea 1\nlinea 2' }],
}

describe('informe de diagnóstico', () => {
  it('incluye lo que se pregunta por teléfono', () => {
    const txt = construirDiagnostico(base)
    expect(txt).toContain('App: 1.19.0')
    expect(txt).toContain('responde (versión 1.19.0)')
    expect(txt).toContain('Ventanas con cambios sin guardar: 2')
    expect(txt).toContain('[a1b2c3d4] POST /pdf/save/abc')
    expect(txt).toContain('--- backend.log ---')
    expect(txt).toContain('linea 2')
  })

  it('dice claramente cuando el motor no contesta', () => {
    const txt = construirDiagnostico({ ...base, motorRespondio: false, motorVersion: null })
    expect(txt).toContain('NO responde al health-check')
  })

  it('no deja huecos mudos cuando no hay nada en vuelo ni en el log', () => {
    const txt = construirDiagnostico({ ...base, enVuelo: '', logs: [{ nombre: 'backend.1.log', contenido: '' }] })
    expect(txt).toContain('(ninguna)')
    expect(txt).toContain('(vacío)')
  })
})

describe('cola de los logs', () => {
  it('devuelve el texto entero si cabe', () => {
    expect(colaDeTexto('corto', 100)).toBe('corto')
  })

  it('recorta por el final y no parte una línea a la mitad', () => {
    const texto = 'primera linea larga\nsegunda\ntercera\n'
    const cola = colaDeTexto(texto, 20)
    expect(cola).toContain('(recortado')
    expect(cola).toContain('tercera')
    expect(cola).not.toContain('primera linea larga')
    expect(cola.split('\n').slice(1).join('\n')).not.toMatch(/^[a-z]*inea/)
  })
})

describe('nombre del archivo', () => {
  it('ordena solo y no lleva rutas', () => {
    expect(nombreArchivoDiagnostico(new Date(2026, 8, 4, 15, 30))).toBe('pdf-master-diagnostico-2026-09-04_1530.txt')
    expect(nombreArchivoDiagnostico(new Date(2026, 0, 9, 7, 5))).toBe('pdf-master-diagnostico-2026-01-09_0705.txt')
  })
})
