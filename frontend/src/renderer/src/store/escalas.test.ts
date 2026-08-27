import { describe, it, expect, beforeEach } from 'vitest'
import { usePdfStore } from './usePdfStore'

// La calibración se guarda por archivo en localStorage. Con la ruta TAL CUAL como
// clave, reabrir el mismo plano con otras barras (recientes, sesión guardada, arrastrar
// y soltar) dejaba las cotas en píxeles: la escala seguía guardada y nadie la
// encontraba. En un takeoff eso no se nota hasta que las cantidades salen mal.
const KEY = 'pdfmaster_scales'
const initialState = usePdfStore.getState()

const abrir = (filePath: string, pages = 2) => {
  usePdfStore.getState().addDoc({
    doc_id: `doc-${Math.random().toString(36).slice(2)}`,
    file_path: filePath, page_count: pages,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: pages }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
  return usePdfStore.getState().docs[usePdfStore.getState().docs.length - 1]
}

const guardado = () => JSON.parse(localStorage.getItem(KEY) || '{}')

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('la calibración sobrevive a otra forma de escribir la ruta', () => {
  it('se encuentra al reabrir con otras barras y mayúsculas', () => {
    const doc = abrir('C:/planos/a.pdf')
    usePdfStore.getState().setMeasurementScale(doc.doc_id, { pixelsPerUnit: 50, unit: 'm' })
    usePdfStore.setState({ docs: [] })
    const reabierto = abrir('C:\\Planos\\A.pdf')
    expect(reabierto.measurementScale).toEqual({ pixelsPerUnit: 50, unit: 'm' })
  })

  it('también la escala por página', () => {
    const doc = abrir('C:/planos/a.pdf')
    usePdfStore.getState().setMeasurementScale(doc.doc_id, { pixelsPerUnit: 10, unit: 'm' }, 1)
    usePdfStore.setState({ docs: [] })
    const reabierto = abrir('c:\\PLANOS\\a.PDF')
    expect(reabierto.pageScales?.[1]).toEqual({ pixelsPerUnit: 10, unit: 'm' })
  })

  it('las escalas guardadas por versiones viejas se siguen leyendo', () => {
    localStorage.setItem(KEY, JSON.stringify({
      'C:\\Planos\\A.pdf': { doc: { pixelsPerUnit: 25, unit: 'm' }, pages: {} },
    }))
    expect(abrir('c:/planos/a.pdf').measurementScale).toEqual({ pixelsPerUnit: 25, unit: 'm' })
  })

  it('el formato viejísimo (la escala suelta) también', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'C:/planos/a.pdf': { pixelsPerUnit: 8, unit: 'ft' } }))
    expect(abrir('C:\\planos\\a.pdf').measurementScale).toEqual({ pixelsPerUnit: 8, unit: 'ft' })
  })

  it('no se acumula una entrada por cada forma de escribir la ruta', () => {
    localStorage.setItem(KEY, JSON.stringify({
      'C:\\Planos\\A.pdf': { doc: { pixelsPerUnit: 25, unit: 'm' }, pages: {} },
    }))
    const doc = abrir('c:/planos/a.pdf')
    usePdfStore.getState().setMeasurementScale(doc.doc_id, { pixelsPerUnit: 30, unit: 'm' })
    expect(Object.keys(guardado())).toHaveLength(1)
    expect(Object.values(guardado())[0]).toMatchObject({ doc: { pixelsPerUnit: 30, unit: 'm' } })
  })

  it('otro archivo no hereda la escala', () => {
    const doc = abrir('C:/planos/a.pdf')
    usePdfStore.getState().setMeasurementScale(doc.doc_id, { pixelsPerUnit: 50, unit: 'm' })
    expect(abrir('C:/planos/b.pdf').measurementScale ?? null).toBeNull()
  })

  it('quitar la calibración borra la entrada', () => {
    const doc = abrir('C:/planos/a.pdf')
    usePdfStore.getState().setMeasurementScale(doc.doc_id, { pixelsPerUnit: 50, unit: 'm' })
    usePdfStore.getState().setMeasurementScale(doc.doc_id, null)
    expect(Object.keys(guardado())).toHaveLength(0)
  })
})
