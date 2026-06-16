import { vi, beforeEach } from 'vitest'

// El store dispara fetch a localhost:8745 (closeDoc, snap-points...); en tests
// no hay backend, así que se stubea para que no haya conexiones reales ni ruido.
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch disabled in tests'))))

beforeEach(() => {
  localStorage.clear()
})
