import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

// La cabecera de DOCUMENTATION.md se quedó cinco versiones atrás (1.14.0 mientras
// package.json iba en 1.19.0) porque nada la miraba. Esto la ata a la fuente única.
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function versionDelPaquete(): string {
  const pkg = JSON.parse(readFileSync(join(repo, 'frontend', 'package.json'), 'utf-8'))
  return pkg.version
}

describe('versión declarada en la documentación', () => {
  it('la spec declara la misma versión que package.json', () => {
    const doc = readFileSync(join(repo, 'DOCUMENTATION.md'), 'utf-8')
    const declarada = doc.match(/^>\s*Versión:\s*\*\*([\d.]+)\*\*/m)?.[1]
    expect(declarada).toBe(versionDelPaquete())
  })

  it('el changelog registra la versión actual', () => {
    const changelog = readFileSync(join(repo, 'CHANGELOG_SESSION.md'), 'utf-8')
    expect(changelog).toContain(`v${versionDelPaquete()}`)
  })
})
