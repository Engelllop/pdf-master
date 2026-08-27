import { describe, it, expect } from 'vitest'
import { debeBorrarse, esTempDeImpresion, EDAD_MAXIMA_MS } from './tempSweep'

const AHORA = 1_700_000_000_000

describe('barrido de temporales de impresión', () => {
  it('reconoce solo los propios', () => {
    expect(esTempDeImpresion('pdfmaster-print-123.pdf')).toBe(true)
    expect(esTempDeImpresion('pdfmaster-print-123.PDF')).toBe(true)
    expect(esTempDeImpresion('plano-entregado.pdf')).toBe(false)
    expect(esTempDeImpresion('pdfmaster-print-123.tmp')).toBe(false)
  })

  // Lo importante: no tocar el temporal del cuadro de impresión que está abierto
  // ahora mismo, y sí el que quedó de una sesión que se murió.
  it('borra el viejo y respeta el recién creado', () => {
    expect(debeBorrarse('pdfmaster-print-1.pdf', AHORA - EDAD_MAXIMA_MS - 1, AHORA)).toBe(true)
    expect(debeBorrarse('pdfmaster-print-1.pdf', AHORA - 1000, AHORA)).toBe(false)
  })

  it('nunca borra un archivo ajeno, por viejo que sea', () => {
    expect(debeBorrarse('contrato-firmado.pdf', 0, AHORA)).toBe(false)
  })

  it('una fecha futura (reloj adelantado) no borra nada', () => {
    expect(debeBorrarse('pdfmaster-print-1.pdf', AHORA + 5_000_000, AHORA)).toBe(false)
  })
})
