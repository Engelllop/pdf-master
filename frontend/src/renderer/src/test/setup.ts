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

// jsdom no implementa scrollIntoView y varias listas lo usan para seguir la selección.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

// jsdom no trae ResizeObserver y varios componentes miden su hueco con él.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  } as unknown as typeof ResizeObserver
}

// jsdom no implementa la API de blob URLs y el store ahora revoca los bitmaps de
// página al cerrar/reciclar documentos.
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:test')
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()

beforeEach(() => {
  localStorage.clear()
})

// Sin globals de vitest, RTL no registra su auto-cleanup; desmontamos a mano
// para que el DOM no se acumule entre tests de componentes.
//
// Y además se vacía el body: los workers reciclan el mismo jsdom entre archivos, así
// que cualquier nodo que sobreviva a `cleanup` lo sigue viendo `screen` en el archivo
// SIGUIENTE. Con dos `role="dialog"` en el documento, un `findByRole('dialog')`
// reintenta hasta agotar el timeout y el fallo cae en un test que no tiene la culpa —
// y cambia de víctima según el orden de archivos, que a su vez cambia al agregar uno.
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
