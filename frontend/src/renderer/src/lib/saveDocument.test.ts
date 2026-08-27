import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn(async (_path: string, _init?: RequestInit) => ({ ok: true }) as unknown as Response)
const setDocDirty = vi.fn()
const showToast = vi.fn()
const setDiskState = vi.fn()
const askConfirm = vi.fn(async (_t: string, _m: string, _c?: string) => true)
// El documento del store, que algunos tests cambian para simular el estado en disco.
let docActual: Record<string, unknown> = { doc_id: 'd1', annotations: [{ id: 'a1', type: 'rect' }] }
let otroDoc: Record<string, unknown> | null = null

vi.mock('./api', () => ({ apiFetch: (path: string, init?: RequestInit) => apiFetch(path, init) }))
vi.mock('./uiPrompt', () => ({ askConfirm: (t: string, m: string, c?: string) => askConfirm(t, m, c) }))
vi.mock('../store/usePdfStore', () => ({
  // El módulo real exporta también el predicado de capas ocultas, que `pushAnnotations`
  // usa: el mock tiene que darlo con la misma semántica (capa por defecto «Marcas»).
  esCapaOculta: (doc: { hiddenLayers?: string[] } | undefined, ann: { layer?: string }) =>
    !!doc?.hiddenLayers?.includes(ann.layer || 'Marcas'),
  usePdfStore: {
    getState: () => ({
      docs: otroDoc ? [docActual, otroDoc] : [docActual],
      backupOnSave: false,
      setDocDirty,
      showToast,
      setDiskState,
    }),
  },
}))

import { mismaRuta, pushAnnotations, saveDocument } from './saveDocument'

const rutas = (): string[] => apiFetch.mock.calls.map((c) => c[0])

beforeEach(() => {
  apiFetch.mockClear(); setDocDirty.mockClear(); showToast.mockClear()
  setDiskState.mockClear(); askConfirm.mockClear()
  askConfirm.mockResolvedValue(true)
  docActual = { doc_id: 'd1', annotations: [{ id: 'a1', type: 'rect' }] }
  otroDoc = null
  apiFetch.mockImplementation(async () => ({ ok: true }) as unknown as Response)
})

describe('guardar', () => {
  it('incrusta las marcas y escribe el PDF, sin dejar sidecar', async () => {
    expect(await saveDocument('d1')).toBe(true)
    // El .pdfmaster.json al lado de cada PDF era una segunda copia de las marcas
    // que se desincronizaba: ahora viven dentro del propio PDF.
    expect(rutas().some((r) => r.startsWith('/pdf/annotations/'))).toBe(false)
    // Tras guardar se relee el estado en disco (para no avisar de un cambio externo
    // que fuimos nosotros), así que se comprueban los dos primeros pasos.
    expect(rutas().slice(0, 2)).toEqual(['/pdf/embed/d1', '/pdf/save/d1'])
    expect(setDocDirty).toHaveBeenCalledWith('d1', false)
  })

  it('"guardar como" no limpia el original', async () => {
    expect(await saveDocument('d1', 'C:/tmp/copia.pdf')).toBe(true)
    expect(rutas()[1]).toContain('output_path=C%3A%2Ftmp%2Fcopia.pdf')
    expect(setDocDirty).not.toHaveBeenCalled()
  })

  // El motor guarda igual si no pudo escribir el .bak; callarlo deja al usuario
  // creyendo que tiene respaldo del archivo que acaba de sobrescribir.
  it('avisa cuando el motor no pudo crear la copia .bak', async () => {
    const conFallo = { ok: true, clone: () => ({ json: async () => ({ success: true, backup_failed: true }) }) }
    apiFetch.mockImplementation(async (path: string) =>
      (path.startsWith('/pdf/save/') ? conFallo : { ok: true }) as unknown as Response)
    expect(await saveDocument('d1')).toBe(true)
    expect(showToast).toHaveBeenCalledWith('Guardado, pero no se pudo crear la copia .bak', 'error')
    apiFetch.mockImplementation(async () => ({ ok: true }) as unknown as Response)
  })

  it('un guardado normal no avisa nada', async () => {
    const okConCuerpo = { ok: true, clone: () => ({ json: async () => ({ success: true, backup_failed: false }) }) }
    apiFetch.mockImplementation(async () => okConCuerpo as unknown as Response)
    expect(await saveDocument('d1')).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
    apiFetch.mockImplementation(async () => ({ ok: true }) as unknown as Response)
  })
})

// Un cliente de sincronización (Drive, OneDrive) u otro programa pueden tocar el
// archivo mientras está abierto. Guardar encima se llevaba esos cambios sin decir nada.
describe('el archivo cambió en disco', () => {
  function conEstado(alAbrir: { mtime: number; size: number } | undefined, enDisco: { mtime: number; size: number; missing?: boolean }) {
    docActual = { doc_id: 'd1', file_name: 'plano.pdf', annotations: [{ id: 'a1', type: 'rect' }], diskState: alAbrir }
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/pdf/disk-state/')) {
        return { ok: true, json: async () => enDisco } as unknown as Response
      }
      return { ok: true } as unknown as Response
    })
  }

  it('pregunta antes de sobrescribir y respeta el cancelar', async () => {
    conEstado({ mtime: 1000, size: 500 }, { mtime: 9999, size: 700 })
    askConfirm.mockResolvedValueOnce(false)
    expect(await saveDocument('d1')).toBe(false)
    expect(askConfirm).toHaveBeenCalled()
    expect(rutas().some((r) => r.startsWith('/pdf/save/'))).toBe(false)
  })

  it('si el usuario confirma, guarda igual', async () => {
    conEstado({ mtime: 1000, size: 500 }, { mtime: 9999, size: 700 })
    askConfirm.mockResolvedValueOnce(true)
    expect(await saveDocument('d1')).toBe(true)
    expect(rutas().some((r) => r.startsWith('/pdf/save/'))).toBe(true)
  })

  it('sin cambios no pregunta nada', async () => {
    conEstado({ mtime: 1000, size: 500 }, { mtime: 1000.4, size: 500 })
    expect(await saveDocument('d1')).toBe(true)
    expect(askConfirm).not.toHaveBeenCalled()
  })

  it('«guardar como» no pregunta: no toca el original', async () => {
    conEstado({ mtime: 1000, size: 500 }, { mtime: 9999, size: 700 })
    expect(await saveDocument('d1', 'C:/copia.pdf')).toBe(true)
    expect(askConfirm).not.toHaveBeenCalled()
  })

  it('sin estado de referencia (motor viejo) se guarda como antes', async () => {
    conEstado(undefined, { mtime: 9999, size: 700 })
    expect(await saveDocument('d1')).toBe(true)
    expect(askConfirm).not.toHaveBeenCalled()
  })
})

describe('rutas equivalentes en Windows', () => {
  it('mayúsculas y el sentido de las barras dan el mismo archivo', () => {
    expect(mismaRuta('C:/Planos/A.pdf', 'c:\\planos\\a.pdf')).toBe(true)
    expect(mismaRuta('C:/Planos/A.pdf', 'C:/Planos/B.pdf')).toBe(false)
    expect(mismaRuta(undefined, 'C:/a.pdf')).toBe(false)
  })
})

// «Guardar como» sobre la propia ruta ES sobrescribir el original: saltaba el aviso de
// cambio externo y encima no limpiaba el «sin guardar».
describe('guardar como sobre la propia ruta', () => {
  const conDisco = (enDisco: { mtime: number; size: number }) => {
    docActual = { doc_id: 'd1', file_name: 'plano.pdf', file_path: 'C:/planos/plano.pdf', annotations: [], diskState: { mtime: 1000, size: 500 } }
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/pdf/disk-state/')) return { ok: true, json: async () => enDisco } as unknown as Response
      return { ok: true } as unknown as Response
    })
  }

  it('se trata como sobrescribir: comprueba el disco', async () => {
    conDisco({ mtime: 9999, size: 700 })
    askConfirm.mockResolvedValueOnce(false)
    expect(await saveDocument('d1', 'c:/planos/plano.pdf')).toBe(false)
    expect(String(askConfirm.mock.calls[0][0])).toContain('cambió en disco')
  })

  it('y limpia el «sin guardar» aunque venga por guardar como', async () => {
    conDisco({ mtime: 1000, size: 500 })
    expect(await saveDocument('d1', 'C:/planos/plano.pdf')).toBe(true)
    expect(setDocDirty).toHaveBeenCalledWith('d1', false)
  })
})

// Guardar encima de un archivo que otra pestaña tiene abierto la deja desincronizada.
describe('guardar encima de otra pestaña', () => {
  const dosPestanas = () => {
    docActual = { doc_id: 'd1', file_name: 'a.pdf', file_path: 'C:/planos/a.pdf', annotations: [] }
    otroDoc = { doc_id: 'd2', file_name: 'b.pdf', file_path: 'C:/planos/b.pdf', annotations: [] }
  }

  it('avisa y respeta el cancelar', async () => {
    dosPestanas()
    askConfirm.mockResolvedValueOnce(false)
    expect(await saveDocument('d1', 'c:\\planos\\b.pdf')).toBe(false)
    expect(String(askConfirm.mock.calls[0][0])).toContain('otra pestaña')
    expect(rutas().some((r) => r.startsWith('/pdf/save/'))).toBe(false)
  })

  it('a una ruta que nadie tiene abierta no pregunta', async () => {
    dosPestanas()
    expect(await saveDocument('d1', 'C:/planos/copia.pdf')).toBe(true)
    expect(askConfirm).not.toHaveBeenCalled()
  })
})

// Al imprimir se manda lo que se ve: las capas apagadas se quedan fuera del papel. El
// GUARDADO nunca las excluye — ahí ocultar sería borrar sin decirlo.
describe('subir marcas al motor con capas apagadas', () => {
  const conCapas = () => {
    docActual = {
      doc_id: 'd1', file_name: 'plano.pdf', file_path: 'C:/planos/plano.pdf',
      hiddenLayers: ['Eléctrico'],
      annotations: [
        { id: 'a1', type: 'rect', layer: 'Eléctrico' },
        { id: 'a2', type: 'rect', layer: 'Estructura' },
        { id: 'a3', type: 'rect' },
      ],
    }
  }
  const marcasEnviadas = () => {
    const llamada = apiFetch.mock.calls.find((c) => String(c[0]).startsWith('/pdf/embed/'))!
    return JSON.parse(String((llamada[1] as RequestInit).body)).annotations.map((a: { id: string }) => a.id)
  }

  it('excluyendo capas apagadas manda solo lo visible', async () => {
    conCapas()
    await pushAnnotations('d1', { excluirCapasOcultas: true })
    expect(marcasEnviadas()).toEqual(['a2', 'a3'])
  })

  it('por omisión (guardado) manda todas', async () => {
    conCapas()
    await pushAnnotations('d1')
    expect(marcasEnviadas()).toEqual(['a1', 'a2', 'a3'])
  })

  it('el guardado nunca excluye las ocultas', async () => {
    conCapas()
    expect(await saveDocument('d1')).toBe(true)
    expect(marcasEnviadas()).toEqual(['a1', 'a2', 'a3'])
  })
})
