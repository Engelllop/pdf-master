import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { rutaCarpetaAbrible, rutaDePdfArrastrado, rutaImagenLegible, rutaParaMostrarEnCarpeta } from './safePaths'

const allowed = new Set(['.png', '.jpg'])

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pdfmaster-safe-paths-'))
  const png = join(dir, 'firma.png')
  const txt = join(dir, 'nota.txt')
  writeFileSync(png, 'png')
  writeFileSync(txt, 'txt')
  return { dir, png, txt }
}

describe('rutas seguras para IPC del main process', () => {
  it('solo acepta rutas locales absolutas existentes para mostrar en carpeta', () => {
    const { png } = fixture()
    expect(rutaParaMostrarEnCarpeta(png)).toBe(png)
    expect(rutaParaMostrarEnCarpeta('firma.png')).toBeNull()
    expect(rutaParaMostrarEnCarpeta('https://example.com/a.pdf')).toBeNull()
    expect(rutaParaMostrarEnCarpeta(`${png}\0.exe`)).toBeNull()
  })

  it('openPath queda limitado a carpetas existentes', () => {
    const { dir, png } = fixture()
    expect(rutaCarpetaAbrible(dir)).toBe(dir)
    expect(rutaCarpetaAbrible(png)).toBeNull()
    expect(rutaCarpetaAbrible(join(dir, 'falta'))).toBeNull()
  })

  it('la lectura base64 queda limitada a imagenes permitidas y archivos reales', () => {
    const { dir, png, txt } = fixture()
    const nested = join(dir, 'imagenes')
    mkdirSync(nested)
    expect(rutaImagenLegible(png, allowed)).toBe(png)
    expect(rutaImagenLegible(txt, allowed)).toBeNull()
    expect(rutaImagenLegible(nested, allowed)).toBeNull()
  })
})

describe('el PDF que se suelta sobre la ventana', () => {
  const soloWindows = process.platform === 'win32' ? it : it.skip

  soloWindows('traduce una file:// normal a ruta de Windows', () => {
    expect(rutaDePdfArrastrado('file:///C:/planos/lamina.pdf')).toBe(String.raw`C:\planos\lamina.pdf`)
  })

  soloWindows('decodifica el %23 que `decodeURI` dejaba pasar', () => {
    // «Lámina #3.pdf»: el `replace`+`decodeURI` de antes dejaba el %23 crudo y el
    // archivo no existía con ese nombre, así que no abría nunca.
    expect(rutaDePdfArrastrado('file:///C:/planos/L%C3%A1mina%20%233.pdf'))
      .toBe(String.raw`C:\planos\Lámina #3.pdf`)
  })

  soloWindows('entiende una ruta UNC de la red', () => {
    // Antes salía `servidor\planos\x.pdf` (relativa y sin host): en obra, con los
    // planos en un recurso compartido, arrastrarlos no hacía nada.
    expect(rutaDePdfArrastrado('file://servidor/planos/x.pdf')).toBe(String.raw`\\servidor\planos\x.pdf`)
  })

  it('rechaza lo que no es un PDF local', () => {
    expect(rutaDePdfArrastrado('https://example.com/a.pdf')).toBeNull()
    expect(rutaDePdfArrastrado('file:///C:/planos/notas.txt')).toBeNull()
    expect(rutaDePdfArrastrado('file:///C:/planos/')).toBeNull()
    expect(rutaDePdfArrastrado(undefined)).toBeNull()
    expect(rutaDePdfArrastrado('')).toBeNull()
  })
})
