import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { rutaCarpetaAbrible, rutaImagenLegible, rutaParaMostrarEnCarpeta } from './safePaths'

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
