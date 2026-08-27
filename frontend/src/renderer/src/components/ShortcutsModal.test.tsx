import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ShortcutsModal from './ShortcutsModal'
import { TOOL_KEYS, TOOL_LABELS } from '../lib/tools'

const teclasVisibles = (c: HTMLElement) => [...c.querySelectorAll('kbd')].map((k) => k.textContent)

// La lista de herramientas se escribía a mano y drifteaba con `TOOL_KEYS`, que es lo
// que el atajo global consulta: la tecla P (medir perímetro) existía y no aparecía en
// ningún sitio, así que no había forma de descubrirla.
describe('la lista sale de la fuente única de atajos', () => {
  it('muestra TODAS las teclas de herramienta con su nombre', () => {
    const { container } = render(<ShortcutsModal onClose={() => {}} />)
    const teclas = teclasVisibles(container)
    for (const [tecla, tool] of Object.entries(TOOL_KEYS)) {
      const bonita = tecla.startsWith('shift+')
        ? `Shift+${tecla.slice(6).toUpperCase()}`
        : tecla.toUpperCase()
      expect(teclas, `falta la tecla ${bonita}`).toContain(bonita)
      expect(screen.getAllByText(TOOL_LABELS[tool]).length).toBeGreaterThan(0)
    }
  })

  it('la tecla del perímetro está (era la que faltaba)', () => {
    const { container } = render(<ShortcutsModal onClose={() => {}} />)
    expect(teclasVisibles(container)).toContain('P')
    expect(screen.getByText('Medir perímetro')).toBeTruthy()
  })
})

describe('atajos globales que sí existen en App', () => {
  it('lista Ctrl+P (imprimir), que faltaba', () => {
    const { container } = render(<ShortcutsModal onClose={() => {}} />)
    const teclas = teclasVisibles(container)
    for (const t of ['Ctrl+O', 'Ctrl+S', 'Ctrl+P', 'Ctrl+W', 'Ctrl+K', 'Ctrl+Shift+L', 'F11']) {
      expect(teclas, `falta ${t}`).toContain(t)
    }
  })
})

describe('cerrar', () => {
  it('Esc cierra el panel', () => {
    const onClose = vi.fn()
    render(<ShortcutsModal onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
