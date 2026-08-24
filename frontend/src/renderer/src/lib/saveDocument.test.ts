import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn(async () => ({ ok: true }) as unknown as Response)
const setDocDirty = vi.fn()

vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...(args as [])) }))
vi.mock('../store/usePdfStore', () => ({
  usePdfStore: {
    getState: () => ({
      docs: [{ doc_id: 'd1', annotations: [{ id: 'a1', type: 'rect' }] }],
      backupOnSave: false,
      setDocDirty,
    }),
  },
}))

import { saveDocument } from './saveDocument'

const rutas = (): string[] => apiFetch.mock.calls.map((c) => c[0] as unknown as string)

beforeEach(() => { apiFetch.mockClear(); setDocDirty.mockClear() })

describe('guardar', () => {
  it('incrusta las marcas y escribe el PDF, sin dejar sidecar', async () => {
    expect(await saveDocument('d1')).toBe(true)
    // El .pdfmaster.json al lado de cada PDF era una segunda copia de las marcas
    // que se desincronizaba: ahora viven dentro del propio PDF.
    expect(rutas().some((r) => r.startsWith('/pdf/annotations/'))).toBe(false)
    expect(rutas()).toEqual(['/pdf/embed/d1', '/pdf/save/d1'])
    expect(setDocDirty).toHaveBeenCalledWith('d1', false)
  })

  it('"guardar como" no limpia el original', async () => {
    expect(await saveDocument('d1', 'C:/tmp/copia.pdf')).toBe(true)
    expect(rutas()[1]).toContain('output_path=C%3A%2Ftmp%2Fcopia.pdf')
    expect(setDocDirty).not.toHaveBeenCalled()
  })
})
