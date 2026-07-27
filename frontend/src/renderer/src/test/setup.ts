import { vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// El store dispara fetch a localhost:8745 (closeDoc, snap-points...); en tests
// no hay backend, así que se stubea para que no haya conexiones reales ni ruido.
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch disabled in tests'))))

// El preload de Electron no existe en jsdom: se stubea lo que el store llama
// directamente (el resto de window.api lo mockean los tests que lo necesiten).
vi.stubGlobal('api', undefined)
Object.defineProperty(window, 'api', {
  configurable: true,
  writable: true,
  value: {
    setUiZoom: vi.fn(() => Promise.resolve()),
    logError: vi.fn(() => Promise.resolve()),
    osUsername: vi.fn(() => Promise.resolve('')),
  },
})

beforeEach(() => {
  localStorage.clear()
})

// Sin globals de vitest, RTL no registra su auto-cleanup; desmontamos a mano
// para que el DOM no se acumule entre tests de componentes.
afterEach(() => {
  cleanup()
})
