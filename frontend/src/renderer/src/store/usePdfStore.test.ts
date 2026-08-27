import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePdfStore, scaleForPage, type Annotation } from './usePdfStore'

const initialState = usePdfStore.getState()

function docInfo(overrides: Partial<{ doc_id: string; file_path: string; page_count: number }> = {}) {
  return {
    doc_id: overrides.doc_id ?? 'doc-1',
    file_path: overrides.file_path ?? 'C:\\planos\\plano-a.pdf',
    page_count: overrides.page_count ?? 10,
    title: null,
    author: null,
    subject: null,
    page_sizes: Array.from({ length: overrides.page_count ?? 10 }, (_, i) => ({
      page_num: i,
      width: 612,
      height: 792,
    })),
  }
}

function ann(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: 'rect',
    page: 0,
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    color: '#ff0000',
    ...overrides,
  }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
})

describe('addDoc', () => {
  it('activa el documento por defecto y deriva file_name de la ruta', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo())
    const state = usePdfStore.getState()
    expect(state.activeDocId).toBe('doc-1')
    expect(state.docs[0].file_name).toBe('plano-a.pdf')
    expect(state.docs[0].dirty).toBe(false)
    expect(state.docs[0].fitMode).toBe('fit-page')
  })

  it('con activate=false mantiene el documento activo previo (apertura masiva en background)', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'a' }))
    s.addDoc(docInfo({ doc_id: 'b', file_path: 'C:\\b.pdf' }), false)
    expect(usePdfStore.getState().activeDocId).toBe('a')
  })

  it('con activate=false pero sin nada abierto, activa igualmente', () => {
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'a' }), false)
    expect(usePdfStore.getState().activeDocId).toBe('a')
  })

  it('rehidrata la escala de medición persistida por ruta de archivo', () => {
    localStorage.setItem(
      'pdfmaster_scales',
      JSON.stringify({ 'C:\\planos\\plano-a.pdf': { pixelsPerUnit: 2.5, unit: 'm' } })
    )
    usePdfStore.getState().addDoc(docInfo())
    expect(usePdfStore.getState().docs[0].measurementScale).toEqual({ pixelsPerUnit: 2.5, unit: 'm' })
  })
})

describe('closeDoc', () => {
  it('elimina el doc, activa el último restante y limpia sus comandos de undo/redo', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'a' }))
    s.addDoc(docInfo({ doc_id: 'b', file_path: 'C:\\b.pdf' }))
    s.addDoc(docInfo({ doc_id: 'c', file_path: 'C:\\c.pdf' }))
    usePdfStore.getState().addAnnotation('c', ann())
    usePdfStore.getState().setActiveDoc('c')

    usePdfStore.getState().closeDoc('c')
    const state = usePdfStore.getState()
    expect(state.docs.map((d) => d.doc_id)).toEqual(['a', 'b'])
    expect(state.activeDocId).toBe('b')
    expect(state.undoStack).toHaveLength(0)
  })

  it('si se cierra un doc inactivo, el activo no cambia', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'a' }))
    s.addDoc(docInfo({ doc_id: 'b', file_path: 'C:\\b.pdf' }))
    usePdfStore.getState().closeDoc('a')
    expect(usePdfStore.getState().activeDocId).toBe('b')
  })

  it('al cerrar el último doc no queda activo', () => {
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'a' }))
    usePdfStore.getState().closeDoc('a')
    expect(usePdfStore.getState().activeDocId).toBeNull()
    expect(usePdfStore.getState().docs).toHaveLength(0)
  })
})

describe('remapDocId (auto-reparación de doc_ids muertos)', () => {
  it('sustituye el id conservando anotaciones, página y zoom; vacía pageCache y sube docVersion', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'old' }))
    const a = ann()
    usePdfStore.getState().addAnnotation('old', a)
    usePdfStore.getState().setPage('old', 3)
    usePdfStore.getState().setZoom('old', 2)
    usePdfStore.getState().cachePage('old', 0, {
      image: 'blob:x', width: 100, height: 100, originalWidth: 612, originalHeight: 792,
    })

    usePdfStore.getState().remapDocId('old', 'new')
    const state = usePdfStore.getState()
    const doc = state.docs[0]
    expect(doc.doc_id).toBe('new')
    // addAnnotation sella createdAt (y el autor si está configurado), así que se
    // compara el contenido original en vez de la identidad exacta del objeto.
    expect(doc.annotations).toHaveLength(1)
    expect(doc.annotations[0]).toMatchObject(a)
    expect(doc.currentPage).toBe(3)
    expect(doc.zoom).toBe(2)
    expect(doc.pageCache.size).toBe(0)
    expect(doc.docVersion).toBe(1)
    expect(state.activeDocId).toBe('new')
  })

  it('remapea los stacks de undo/redo al id nuevo', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'old' }))
    usePdfStore.getState().addAnnotation('old', ann())
    usePdfStore.getState().remapDocId('old', 'new')
    expect(usePdfStore.getState().undoStack[0].docId).toBe('new')
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })
})

describe('navegación de páginas', () => {
  it('setPage clampa al rango [0, page_count-1]', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 5 }))
    usePdfStore.getState().setPage('doc-1', 99)
    expect(usePdfStore.getState().docs[0].currentPage).toBe(4)
    usePdfStore.getState().setPage('doc-1', -3)
    expect(usePdfStore.getState().docs[0].currentPage).toBe(0)
  })

  it('nextPage/prevPage avanzan de a 2 en vista doble y clampan en los extremos', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 5 }))
    usePdfStore.getState().setViewMode('double')
    usePdfStore.getState().nextPage('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(2)
    usePdfStore.getState().nextPage('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(4)
    usePdfStore.getState().nextPage('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(4)
    usePdfStore.getState().prevPage('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(2)
  })

  it('goBack/goForward recorren el historial de navegación', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 20 }))
    usePdfStore.getState().setPage('doc-1', 5)
    usePdfStore.getState().setPage('doc-1', 12)
    usePdfStore.getState().goBack('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(5)
    usePdfStore.getState().goForward('doc-1')
    expect(usePdfStore.getState().docs[0].currentPage).toBe(12)
  })

  it('el historial de navegación es independiente por documento', () => {
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'a', page_count: 20 }))
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'b', file_path: 'C:\\b.pdf', page_count: 20 }))
    usePdfStore.getState().setPage('a', 5)
    usePdfStore.getState().setPage('b', 9)
    usePdfStore.getState().setPage('a', 12)
    usePdfStore.getState().goBack('a')
    const docs = usePdfStore.getState().docs
    expect(docs.find((d) => d.doc_id === 'a')?.currentPage).toBe(5)
    expect(docs.find((d) => d.doc_id === 'b')?.currentPage).toBe(9)
  })
})

describe('zoom', () => {
  it('setZoom clampa a [0.1, 8] y pasa fitMode a custom', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setZoom('doc-1', 50)
    expect(usePdfStore.getState().docs[0].zoom).toBe(8)
    usePdfStore.getState().setZoom('doc-1', 0.001)
    expect(usePdfStore.getState().docs[0].zoom).toBe(0.1)
    expect(usePdfStore.getState().docs[0].fitMode).toBe('custom')
  })

  it('computeFitZoom fit-page usa la dimensión más restrictiva', () => {
    usePdfStore.getState().addDoc(docInfo())
    // página 612x792; viewport 660x832 → disponible 612x792 → zoom exacto 1
    const z = usePdfStore.getState().computeFitZoom('doc-1', 0, 'fit-page', 660, 832)
    expect(z).toBeCloseTo(1)
  })
})

describe('anotaciones + undo/redo (command stack)', () => {
  it('addAnnotation marca dirty, apila undo y limpia redo', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann())
    const state = usePdfStore.getState()
    expect(state.docs[0].dirty).toBe(true)
    expect(state.undoStack).toHaveLength(1)
    expect(state.redoStack).toHaveLength(0)
  })

  it('undo restaura el estado anterior y redo lo reaplica', () => {
    usePdfStore.getState().addDoc(docInfo())
    const a1 = ann({ id: 'a1' })
    const a2 = ann({ id: 'a2' })
    usePdfStore.getState().addAnnotation('doc-1', a1)
    usePdfStore.getState().addAnnotation('doc-1', a2)

    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations.map((a) => a.id)).toEqual(['a1'])
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
    usePdfStore.getState().redo()
    usePdfStore.getState().redo()
    expect(usePdfStore.getState().docs[0].annotations.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('una acción nueva tras undo invalida el redoStack', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().undo()
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a2' }))
    expect(usePdfStore.getState().redoStack).toHaveLength(0)
  })

  it('undo/redo con stacks vacíos no rompe nada', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().undo()
    usePdfStore.getState().redo()
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })

  it('updateAnnotation fusiona campos y marca dirty; id inexistente es no-op', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1', color: '#ff0000' }))
    usePdfStore.getState().setDocDirty('doc-1', false)

    usePdfStore.getState().updateAnnotation('doc-1', 'a1', { color: '#00ff00', lineWidth: 4 })
    const doc = usePdfStore.getState().docs[0]
    expect(doc.annotations[0].color).toBe('#00ff00')
    expect(doc.annotations[0].lineWidth).toBe(4)
    expect(doc.annotations[0].x).toBe(10)
    expect(doc.dirty).toBe(true)

    const before = usePdfStore.getState()
    usePdfStore.getState().updateAnnotation('doc-1', 'nope', { color: '#000' })
    expect(usePdfStore.getState()).toBe(before)
  })

  it('deleteAnnotation elimina y deselecciona si estaba seleccionada', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().selectAnnotation('doc-1', 'a1')
    expect(usePdfStore.getState().selectedAnnotationId).toBe('a1')
    usePdfStore.getState().deleteAnnotation('doc-1', 'a1')
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
    expect(usePdfStore.getState().selectedAnnotationId).toBeNull()
  })

  it('getAnnotationsForPage filtra por página', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'p0', page: 0 }))
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'p3', page: 3 }))
    expect(usePdfStore.getState().getAnnotationsForPage('doc-1', 3).map((a) => a.id)).toEqual(['p3'])
  })

  it('selectAnnotation con id inexistente deselecciona', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().selectAnnotation('doc-1', 'fantasma')
    expect(usePdfStore.getState().selectedAnnotationId).toBeNull()
  })
})

describe('reorderPages', () => {
  it('remapea currentPage y las páginas de las anotaciones, y vacía caches', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 3 }))
    usePdfStore.getState().setPage('doc-1', 2)
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1', page: 0 }))
    usePdfStore.getState().cachePage('doc-1', 0, {
      image: 'x', width: 1, height: 1, originalWidth: 612, originalHeight: 792,
    })

    // nueva disposición: [pág2, pág0, pág1]
    usePdfStore.getState().reorderPages('doc-1', [2, 0, 1])
    const doc = usePdfStore.getState().docs[0]
    expect(doc.currentPage).toBe(0)
    expect(doc.annotations[0].page).toBe(1)
    expect(doc.pageCache.size).toBe(0)
    expect(doc.thumbnails.size).toBe(0)
    expect(doc.page_sizes.map((p) => p.page_num)).toEqual([0, 1, 2])
  })
})

describe('búsqueda', () => {
  const results = [
    { page: 0, x: 0, y: 0, width: 10, height: 10 },
    { page: 1, x: 0, y: 0, width: 10, height: 10 },
    { page: 2, x: 0, y: 0, width: 10, height: 10 },
  ]

  it('setSearchResults posiciona el índice en 0 (o -1 si no hay resultados)', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setSearchResults('doc-1', results)
    expect(usePdfStore.getState().docs[0].searchIndex).toBe(0)
    usePdfStore.getState().setSearchResults('doc-1', [])
    expect(usePdfStore.getState().docs[0].searchIndex).toBe(-1)
  })

  it('next/prev dan la vuelta circular', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setSearchResults('doc-1', results)
    usePdfStore.getState().prevSearchResult('doc-1')
    expect(usePdfStore.getState().docs[0].searchIndex).toBe(2)
    usePdfStore.getState().nextSearchResult('doc-1')
    expect(usePdfStore.getState().docs[0].searchIndex).toBe(0)
  })

  it('setSearchQuery resetea resultados e índice', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setSearchResults('doc-1', results)
    usePdfStore.getState().setSearchQuery('doc-1', 'nuevo término')
    const doc = usePdfStore.getState().docs[0]
    expect(doc.searchResults).toHaveLength(0)
    expect(doc.searchIndex).toBe(-1)
  })
})

describe('pageCache', () => {
  it('evicta la entrada más vieja al superar 100 páginas', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 200 }))
    for (let i = 0; i < 101; i++) {
      usePdfStore.getState().cachePage('doc-1', i, {
        image: `img-${i}`, width: 1, height: 1, originalWidth: 612, originalHeight: 792,
      })
    }
    const doc = usePdfStore.getState().docs[0]
    expect(doc.pageCache.size).toBe(100)
    expect(doc.pageCache.has('0')).toBe(false)
    expect(doc.pageCache.has('100')).toBe(true)
  })
})

describe('escala de medición', () => {
  const guardado = () => JSON.parse(localStorage.getItem('pdfmaster_scales')!)['C:\\planos\\plano-a.pdf']

  it('setMeasurementScale persiste por ruta y se borra al pasar null', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 3, unit: 'cm' })
    // Formato nuevo: escala del documento + las de páginas sueltas.
    expect(guardado()).toEqual({ doc: { pixelsPerUnit: 3, unit: 'cm' }, pages: {} })
    usePdfStore.getState().setMeasurementScale('doc-1', null)
    expect(JSON.parse(localStorage.getItem('pdfmaster_scales')!)).toEqual({})
  })

  it('persiste también las escalas de página', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 3 }))
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 3, unit: 'cm' })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 9, unit: 'cm' }, 2)
    expect(guardado()).toEqual({
      doc: { pixelsPerUnit: 3, unit: 'cm' },
      pages: { 2: { pixelsPerUnit: 9, unit: 'cm' } },
    })
  })

  // Lo guardado por versiones anteriores es la escala suelta, sin envoltorio.
  it('lee el formato viejo como escala del documento', () => {
    localStorage.setItem('pdfmaster_scales', JSON.stringify({
      'C:\\planos\\plano-a.pdf': { pixelsPerUnit: 7, unit: 'm' },
    }))
    usePdfStore.getState().addDoc(docInfo())
    const doc = usePdfStore.getState().docs[0]
    expect(doc.measurementScale).toEqual({ pixelsPerUnit: 7, unit: 'm' })
    expect(doc.pageScales).toEqual({})
  })
})

describe('preferencias de trazo', () => {
  it('clampa grosor y opacidad y los persiste en localStorage', () => {
    usePdfStore.getState().setAnnotationLineWidth(99)
    expect(usePdfStore.getState().annotationLineWidth).toBe(20)
    usePdfStore.getState().setAnnotationOpacity(0)
    expect(usePdfStore.getState().annotationOpacity).toBe(0.05)
    const prefs = JSON.parse(localStorage.getItem('pdfmaster_stroke')!)
    expect(prefs.lineWidth).toBe(20)
    expect(prefs.opacity).toBe(0.05)
  })
})

describe('herramienta pegajosa', () => {
  it('con modo pegajoso, releaseTool mantiene la herramienta activa', () => {
    usePdfStore.getState().setStickyTools(true)
    usePdfStore.getState().setActiveTool('highlight')
    usePdfStore.getState().releaseTool()
    expect(usePdfStore.getState().activeTool).toBe('highlight')
  })

  it('sin modo pegajoso, releaseTool suelta la herramienta', () => {
    usePdfStore.getState().setStickyTools(false)
    usePdfStore.getState().setActiveTool('highlight')
    usePdfStore.getState().releaseTool()
    expect(usePdfStore.getState().activeTool).toBeNull()
  })

  it('las herramientas de un solo uso se sueltan aunque el modo pegajoso esté activo', () => {
    usePdfStore.getState().setStickyTools(true)
    for (const tool of ['image', 'measure_calibrate', 'croparea', 'redactarea']) {
      usePdfStore.getState().setActiveTool(tool)
      usePdfStore.getState().releaseTool()
      expect(usePdfStore.getState().activeTool).toBeNull()
    }
  })

  it('persiste la preferencia en localStorage', () => {
    usePdfStore.getState().setStickyTools(false)
    expect(localStorage.getItem('pdfmaster_sticky_tools')).toBe('0')
    usePdfStore.getState().setStickyTools(true)
    expect(localStorage.getItem('pdfmaster_sticky_tools')).toBe('1')
  })

  it('elegir herramienta sale del scroll continuo (ahí no se puede marcar)', () => {
    usePdfStore.setState({ continuousMode: true })
    usePdfStore.getState().setActiveTool('highlight')
    expect(usePdfStore.getState().continuousMode).toBe(false)
  })

  it('soltar la herramienta no reactiva el scroll continuo', () => {
    usePdfStore.setState({ continuousMode: true })
    usePdfStore.getState().setActiveTool(null)
    expect(usePdfStore.getState().continuousMode).toBe(true)
  })
})

describe('zoom de comparación', () => {
  it('es un solo valor compartido y se acota', () => {
    usePdfStore.getState().setCompareZoom(2)
    expect(usePdfStore.getState().compareZoom).toBe(2)
    usePdfStore.getState().setCompareZoom(50)
    expect(usePdfStore.getState().compareZoom).toBe(8)
    usePdfStore.getState().setCompareZoom(0)
    expect(usePdfStore.getState().compareZoom).toBe(0.1)
  })

  it('vuelve al ajuste al entrar y al salir de comparación', () => {
    usePdfStore.getState().setCompareZoom(3)
    usePdfStore.getState().clearCompare()
    expect(usePdfStore.getState().compareZoom).toBe(1)
    expect(usePdfStore.getState().compareMode).toBe(false)
    usePdfStore.getState().setCompareZoom(3)
    usePdfStore.getState().setCompareDoc('doc-b')
    expect(usePdfStore.getState().compareZoom).toBe(1)
  })
})

describe('metadatos de revisión', () => {
  it('sella autor y fecha al crear la marca, y respeta los que ya vengan puestos', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setAnnotationAuthor('Engell')
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().addAnnotation('doc-1', { ...ann({ id: 'a2' }), author: 'Otro', createdAt: 111 })
    const [a1, a2] = usePdfStore.getState().docs[0].annotations
    expect(a1.author).toBe('Engell')
    expect(a1.createdAt).toBeGreaterThan(0)
    expect(a2.author).toBe('Otro')
    expect(a2.createdAt).toBe(111)
  })

  it('sin autor configurado no añade el campo (no ensucia el sidecar)', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setAnnotationAuthor('')
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    expect('author' in usePdfStore.getState().docs[0].annotations[0]).toBe(false)
  })

  it('updateAnnotation marca modifiedAt', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().updateAnnotation('doc-1', 'a1', { color: '#000000' })
    expect(usePdfStore.getState().docs[0].annotations[0].modifiedAt).toBeGreaterThan(0)
  })

  it('resuelve y reabre una marca', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().setAnnotationStatus('doc-1', 'a1', 'resolved')
    expect(usePdfStore.getState().docs[0].annotations[0].status).toBe('resolved')
    usePdfStore.getState().setAnnotationStatus('doc-1', 'a1', 'open')
    expect(usePdfStore.getState().docs[0].annotations[0].status).toBe('open')
  })

  it('añade y elimina respuestas, ignorando las vacías', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setAnnotationAuthor('Engell')
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().addReply('doc-1', 'a1', '   ')
    expect(usePdfStore.getState().docs[0].annotations[0].replies).toBeUndefined()
    usePdfStore.getState().addReply('doc-1', 'a1', '  Revisar cota  ')
    const reply = usePdfStore.getState().docs[0].annotations[0].replies![0]
    expect(reply.text).toBe('Revisar cota')
    expect(reply.author).toBe('Engell')
    usePdfStore.getState().deleteReply('doc-1', 'a1', reply.id)
    expect(usePdfStore.getState().docs[0].annotations[0].replies).toEqual([])
  })
})

describe('selección múltiple y portapapeles', () => {
  const seed = () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a1' }))
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a2' }))
    usePdfStore.getState().addAnnotation('doc-1', ann({ id: 'a3' }))
  }

  it('toggle suma y resta, y la principal es la última', () => {
    seed()
    usePdfStore.getState().selectAnnotation('doc-1', 'a1')
    usePdfStore.getState().toggleAnnotationSelection('doc-1', 'a2')
    expect(usePdfStore.getState().selectedAnnotationIds).toEqual(['a1', 'a2'])
    expect(usePdfStore.getState().selectedAnnotationId).toBe('a2')
    usePdfStore.getState().toggleAnnotationSelection('doc-1', 'a2')
    expect(usePdfStore.getState().selectedAnnotationIds).toEqual(['a1'])
    expect(usePdfStore.getState().selectedAnnotationId).toBe('a1')
  })

  it('borra varias marcas en un solo paso de undo', () => {
    seed()
    usePdfStore.getState().deleteAnnotations('doc-1', ['a1', 'a3'])
    expect(usePdfStore.getState().docs[0].annotations.map((a) => a.id)).toEqual(['a2'])
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(3)
  })

  it('mueve el grupo desplazando también los puntos', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', {
      ...ann({ id: 'd1' }), type: 'draw', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    })
    usePdfStore.getState().moveAnnotations('doc-1', ['d1'], 5, -3)
    const moved = usePdfStore.getState().docs[0].annotations[0]
    expect(moved.x).toBe(15)
    expect(moved.y).toBe(7)
    expect(moved.points).toEqual([{ x: 5, y: -3 }, { x: 15, y: 7 }])
  })

  it('copia y pega en otra página con ids nuevos', () => {
    seed()
    expect(usePdfStore.getState().copyAnnotations('doc-1', ['a1', 'a2'])).toBe(2)
    expect(usePdfStore.getState().pasteAnnotations('doc-1', 4)).toBe(2)
    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns).toHaveLength(5)
    const pasted = anns.slice(3)
    expect(pasted.every((a) => a.page === 4)).toBe(true)
    expect(pasted.map((a) => a.id)).not.toContain('a1')
    expect(usePdfStore.getState().selectedAnnotationIds).toEqual(pasted.map((a) => a.id))
  })

  it('pega en otro documento (el portapapeles es global)', () => {
    seed()
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'doc-2', file_path: 'C:\\planos\\b.pdf' }))
    usePdfStore.getState().copyAnnotations('doc-1', ['a1'])
    expect(usePdfStore.getState().pasteAnnotations('doc-2', 0)).toBe(1)
    expect(usePdfStore.getState().docs[1].annotations).toHaveLength(1)
  })
})

describe('preferencias de tema y rueda', () => {
  it('el tema "system" resuelve al del sistema y persiste la preferencia', () => {
    usePdfStore.getState().setThemePreference('system')
    expect(usePdfStore.getState().themePreference).toBe('system')
    expect(['dark', 'light']).toContain(usePdfStore.getState().theme)
    expect(localStorage.getItem('pdfmaster_theme_pref')).toBe('system')
  })

  it('setTheme fija la preferencia explícita', () => {
    usePdfStore.getState().setTheme('dark')
    expect(usePdfStore.getState().themePreference).toBe('dark')
    expect(usePdfStore.getState().theme).toBe('dark')
  })

  it('el modo de rueda se persiste', () => {
    usePdfStore.getState().setWheelMode('scroll')
    expect(localStorage.getItem('pdfmaster_wheel_mode')).toBe('scroll')
  })
})

describe('progreso cancelable', () => {
  it('avanza, se cancela y se cierra', () => {
    usePdfStore.getState().startProgress('Comprimir', 3)
    expect(usePdfStore.getState().progress).toMatchObject({ label: 'Comprimir', total: 3, canceled: false })
    usePdfStore.getState().updateProgress(2, 'plano-a.pdf')
    expect(usePdfStore.getState().progress?.current).toBe(2)
    expect(usePdfStore.getState().isCancelRequested()).toBe(false)
    usePdfStore.getState().requestCancel()
    expect(usePdfStore.getState().isCancelRequested()).toBe(true)
    usePdfStore.getState().endProgress()
    expect(usePdfStore.getState().progress).toBeNull()
  })

  it('sin progreso activo, cancelar no rompe nada', () => {
    usePdfStore.getState().requestCancel()
    expect(usePdfStore.getState().isCancelRequested()).toBe(false)
  })
})

describe('preferencias de apertura', () => {
  it('el zoom por defecto define el encuadre del documento nuevo', () => {
    usePdfStore.getState().setViewerSize(1000, 800)
    usePdfStore.getState().setDefaultZoomMode('actual')
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'z1' }))
    const doc = usePdfStore.getState().docs.find((d) => d.doc_id === 'z1')!
    expect(doc.zoom).toBe(1)
    expect(doc.fitMode).toBe('custom')

    usePdfStore.getState().setDefaultZoomMode('fit-width')
    usePdfStore.getState().addDoc(docInfo({ doc_id: 'z2' }))
    const doc2 = usePdfStore.getState().docs.find((d) => d.doc_id === 'z2')!
    expect(doc2.fitMode).toBe('fit-width')
    expect(doc2.zoom).toBeCloseTo((1000 - 48) / 612, 5)
  })

  it('clampa el escalado de interfaz y lo persiste', () => {
    usePdfStore.getState().setUiScale(3)
    expect(usePdfStore.getState().uiScale).toBe(1.5)
    usePdfStore.getState().setUiScale(0.1)
    expect(usePdfStore.getState().uiScale).toBe(0.75)
    expect(localStorage.getItem('pdfmaster_ui_scale')).toBe('0.75')
  })

  it('la copia .bak está activada por defecto', () => {
    expect(usePdfStore.getState().backupOnSave).toBe(true)
  })
})

describe('dirty / saveStatus', () => {
  it('setDocDirty(true) resetea saveStatus a idle', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setSaveStatus('saved')
    usePdfStore.getState().setDocDirty('doc-1', true)
    expect(usePdfStore.getState().saveStatus).toBe('idle')
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)
  })
})

describe('bitmaps de página (blob URLs)', () => {
  const bitmap = (image: string) => ({ image, width: 612, height: 792, originalWidth: 612, originalHeight: 792 })

  it('revoca el bitmap desalojado del cache al pasar de 100 páginas', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ page_count: 200 }))
    for (let i = 0; i < 101; i++) usePdfStore.getState().cachePage('doc-1', i, bitmap(`blob:p${i}`))
    expect(revoke).toHaveBeenCalledWith('blob:p0')
    expect(usePdfStore.getState().docs[0].pageCache.size).toBe(100)
    revoke.mockRestore()
  })

  it('revoca los bitmaps del documento al cerrarlo', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().cachePage('doc-1', 0, bitmap('blob:a'))
    usePdfStore.getState().cachePage('doc-1', 1, bitmap('blob:b'))
    revoke.mockClear()
    usePdfStore.getState().closeDoc('doc-1')
    expect(revoke).toHaveBeenCalledWith('blob:a')
    expect(revoke).toHaveBeenCalledWith('blob:b')
    revoke.mockRestore()
  })

  it('revoca los bitmaps al invalidar el cache tras una operación de página', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().cachePage('doc-1', 0, bitmap('blob:antes'))
    revoke.mockClear()

    usePdfStore.getState().invalidatePageCache('doc-1')

    expect(revoke).toHaveBeenCalledWith('blob:antes')
    expect(usePdfStore.getState().docs[0].pageCache.size).toBe(0)
    revoke.mockRestore()
  })

  it('revoca los bitmaps al remapear un doc_id muerto', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().cachePage('doc-1', 0, bitmap('blob:viejo'))
    revoke.mockClear()
    usePdfStore.getState().remapDocId('doc-1', 'doc-2')
    expect(revoke).toHaveBeenCalledWith('blob:viejo')
    expect(usePdfStore.getState().docs[0].pageCache.size).toBe(0)
    revoke.mockRestore()
  })
})

describe('miniaturas (blob URLs)', () => {
  // El Map de miniaturas no tenía tope ni revocado: recorrer el panel de páginas de un
  // documento de 300 páginas dejaba las 300 en RAM, y cerrar la pestaña no devolvía
  // ninguna. Ahora son bitmaps locales de PDF.js (blob:), no base64 del motor.
  it('desaloja la miniatura menos usada al pasar del tope y revoca su blob', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo({ page_count: 300 }))
    for (let i = 0; i < 81; i++) usePdfStore.getState().addThumbnail('doc-1', i, `blob:t${i}`)
    expect(revoke).toHaveBeenCalledWith('blob:t0')
    expect(usePdfStore.getState().docs[0].thumbnails.size).toBe(80)
    revoke.mockRestore()
  })

  it('volver a una miniatura la refresca: la evictada es otra', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 300 }))
    for (let i = 0; i < 80; i++) usePdfStore.getState().addThumbnail('doc-1', i, `blob:t${i}`)
    usePdfStore.getState().addThumbnail('doc-1', 0, 'blob:t0') // la vuelve a ver
    usePdfStore.getState().addThumbnail('doc-1', 80, 'blob:t80')
    const thumbs = usePdfStore.getState().docs[0].thumbnails
    expect(thumbs.has(0)).toBe(true)
    expect(thumbs.has(1)).toBe(false)
  })

  it('revoca las miniaturas al cerrar el documento y al invalidarlas', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addThumbnail('doc-1', 0, 'blob:m0')
    revoke.mockClear()
    usePdfStore.getState().invalidateThumbnails('doc-1')
    expect(revoke).toHaveBeenCalledWith('blob:m0')

    usePdfStore.getState().addThumbnail('doc-1', 1, 'blob:m1')
    revoke.mockClear()
    usePdfStore.getState().closeDoc('doc-1')
    expect(revoke).toHaveBeenCalledWith('blob:m1')
    revoke.mockRestore()
  })

  it('revoca las miniaturas al remapear un doc_id muerto', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addThumbnail('doc-1', 0, 'blob:mv')
    revoke.mockClear()
    usePdfStore.getState().remapDocId('doc-1', 'doc-2')
    expect(revoke).toHaveBeenCalledWith('blob:mv')
    expect(usePdfStore.getState().docs[0].thumbnails.size).toBe(0)
    revoke.mockRestore()
  })
})

// Arrastrar, redimensionar y girar una marca no apilaban ningún paso de deshacer:
// Ctrl+Z después de mover una cota sin querer deshacía la acción ANTERIOR (podía ser
// borrar una marca en otra página) y la cota se quedaba movida.
describe('deshacer un gesto sobre una marca', () => {
  const marca = (id: string, x: number, y: number): Annotation => ({ id, type: 'rect', page: 0, x, y })

  it('mover y soltar deja UN paso, y Ctrl+Z devuelve la marca a su sitio', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', marca('m1', 10, 10))
    usePdfStore.setState({ undoStack: [], redoStack: [] })

    const antes = usePdfStore.getState().docs[0].annotations
    // Un arrastre son decenas de mousemove: cada uno mueve, ninguno apila.
    for (let i = 0; i < 30; i++) usePdfStore.getState().moveAnnotations('doc-1', ['m1'], 1, 2)
    expect(usePdfStore.getState().undoStack.length).toBe(0)

    usePdfStore.getState().commitAnnotationGesture('doc-1', antes)
    expect(usePdfStore.getState().undoStack.length).toBe(1)

    usePdfStore.getState().undo()
    const m = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'm1')!
    expect([m.x, m.y]).toEqual([10, 10])
  })

  it('rehacer vuelve a aplicar el gesto completo', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', marca('m1', 0, 0))
    usePdfStore.setState({ undoStack: [], redoStack: [] })
    const antes = usePdfStore.getState().docs[0].annotations
    usePdfStore.getState().moveAnnotations('doc-1', ['m1'], 25, 40)
    usePdfStore.getState().commitAnnotationGesture('doc-1', antes)

    usePdfStore.getState().undo()
    usePdfStore.getState().redo()
    const m = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'm1')!
    expect([m.x, m.y]).toEqual([25, 40])
  })

  it('un clic sin arrastre no apila nada', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', marca('m1', 5, 5))
    usePdfStore.setState({ undoStack: [], redoStack: [] })
    const antes = usePdfStore.getState().docs[0].annotations
    usePdfStore.getState().commitAnnotationGesture('doc-1', antes)
    expect(usePdfStore.getState().undoStack.length).toBe(0)
  })

  it('redimensionar (updateAnnotation) también se deshace', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', { ...marca('m1', 0, 0), width: 100, height: 50 })
    usePdfStore.setState({ undoStack: [], redoStack: [] })
    const antes = usePdfStore.getState().docs[0].annotations
    usePdfStore.getState().updateAnnotation('doc-1', 'm1', { width: 300, height: 200 })
    usePdfStore.getState().commitAnnotationGesture('doc-1', antes)
    usePdfStore.getState().undo()
    const m = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'm1')!
    expect([m.width, m.height]).toEqual([100, 50])
  })
})

// Ninguna edición del panel flotante (color, grosor, estilo, fuente, texto de una
// nota) apilaba paso de deshacer. Y los controles continuos —el selector de color y
// el deslizador de opacidad— disparan un evento por píxel: apilar uno por evento
// habría llenado la pila y Ctrl+Z avanzaría de a un tono.
describe('deshacer ediciones de propiedades', () => {
  const marca = (id: string): Annotation => ({ id, type: 'rect', page: 0, x: 0, y: 0, color: '#000000' })

  function conMarca() {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().addAnnotation('doc-1', marca('m1'))
    usePdfStore.setState({ undoStack: [], redoStack: [] })
  }

  it('un ajuste continuo se fusiona en un solo paso y vuelve al valor original', () => {
    conMarca()
    for (const c of ['#111111', '#222222', '#333333', '#f0f0f0']) {
      usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { color: c })
    }
    expect(usePdfStore.getState().undoStack.length).toBe(1)
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations[0].color).toBe('#000000')
  })

  it('propiedades distintas son pasos distintos', () => {
    conMarca()
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { color: '#ff0000' })
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { lineWidth: 5 })
    expect(usePdfStore.getState().undoStack.length).toBe(2)
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations[0].lineWidth).toBeUndefined()
    expect(usePdfStore.getState().docs[0].annotations[0].color).toBe('#ff0000')
  })

  it('pasada la ventana de fusión, el mismo ajuste es un paso nuevo', () => {
    vi.useFakeTimers()
    try {
      conMarca()
      usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { color: '#111111' })
      vi.advanceTimersByTime(2000)
      usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { color: '#222222' })
      expect(usePdfStore.getState().undoStack.length).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('editar el texto de una nota se deshace', () => {
    conMarca()
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { text: 'revisar detalle' })
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations[0].text).toBeUndefined()
  })

  it('una edición invalida el rehacer pendiente', () => {
    conMarca()
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { color: '#ff0000' })
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().redoStack.length).toBe(1)
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'm1', { lineWidth: 3 })
    expect(usePdfStore.getState().redoStack.length).toBe(0)
  })
})

// La barra de selección múltiple cambia color y estado de varias marcas a la vez y
// tampoco apilaba paso de deshacer (y su selector de color es continuo, igual que el
// de una sola marca).
describe('deshacer ediciones de varias marcas a la vez', () => {
  function conTresMarcas() {
    usePdfStore.getState().addDoc(docInfo())
    for (const id of ['m1', 'm2', 'm3']) {
      usePdfStore.getState().addAnnotation('doc-1', { id, type: 'rect', page: 0, x: 0, y: 0, color: '#000000' })
    }
    usePdfStore.setState({ undoStack: [], redoStack: [] })
  }

  it('un paso para las tres, y Ctrl+Z devuelve el color a todas', () => {
    conTresMarcas()
    usePdfStore.getState().updateAnnotationsUndoable('doc-1', ['m1', 'm2', 'm3'], { color: '#ff0000' })
    expect(usePdfStore.getState().undoStack.length).toBe(1)
    expect(usePdfStore.getState().docs[0].annotations.every((a) => a.color === '#ff0000')).toBe(true)
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations.every((a) => a.color === '#000000')).toBe(true)
  })

  it('el arrastre del selector de color se fusiona en un paso', () => {
    conTresMarcas()
    for (const c of ['#111111', '#222222', '#333333']) {
      usePdfStore.getState().updateAnnotationsUndoable('doc-1', ['m1', 'm2'], { color: c })
    }
    expect(usePdfStore.getState().undoStack.length).toBe(1)
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations[0].color).toBe('#000000')
  })

  it('otra selección no se fusiona con la anterior', () => {
    conTresMarcas()
    usePdfStore.getState().updateAnnotationsUndoable('doc-1', ['m1', 'm2'], { color: '#ff0000' })
    usePdfStore.getState().updateAnnotationsUndoable('doc-1', ['m3'], { color: '#ff0000' })
    expect(usePdfStore.getState().undoStack.length).toBe(2)
  })

  it('marcar como resuelta se puede deshacer', () => {
    conTresMarcas()
    usePdfStore.getState().setAnnotationStatus('doc-1', 'm1', 'resolved')
    expect(usePdfStore.getState().docs[0].annotations[0].status).toBe('resolved')
    usePdfStore.getState().undo()
    expect(usePdfStore.getState().docs[0].annotations[0].status).toBeUndefined()
  })
})

// Un juego de planos mezcla escalas (sitio 1:500, plantas 1:100, detalles 1:20). La
// escala era del DOCUMENTO: calibrar en la lámina de detalles reescribía con esa
// escala las cotas ya tomadas en las plantas, sin avisar.
describe('escala por página', () => {
  const cota = (id: string, page: number): Annotation => ({
    id, type: 'measure_distance', page, x: 0, y: 0, width: 100, height: 0,
  })

  function conCotas() {
    usePdfStore.getState().addDoc(docInfo({ page_count: 3 }))
    usePdfStore.getState().addAnnotation('doc-1', cota('c0', 0))
    usePdfStore.getState().addAnnotation('doc-1', cota('c1', 1))
  }
  const valorDe = (id: string) =>
    usePdfStore.getState().docs[0].annotations.find((a) => a.id === id)!.measurement!.value

  it('calibrar una página no toca las cotas de las otras', () => {
    conCotas()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    expect(valorDe('c0')).toBeCloseTo(10)
    expect(valorDe('c1')).toBeCloseTo(10)

    // La lámina 2 va a otra escala.
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' }, 1)
    expect(valorDe('c1')).toBeCloseTo(50)
    expect(valorDe('c0')).toBeCloseTo(10)
  })

  it('recalibrar el documento respeta las páginas con escala propia', () => {
    conCotas()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' }, 1)
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 5, unit: 'm' })
    expect(valorDe('c0')).toBeCloseTo(20)
    expect(valorDe('c1')).toBeCloseTo(50)
  })

  it('la página sin escala propia usa la del documento', () => {
    const doc = { measurementScale: { pixelsPerUnit: 10, unit: 'm' as const }, pageScales: { 1: { pixelsPerUnit: 2, unit: 'm' as const } } }
    expect(scaleForPage(doc, 0)!.pixelsPerUnit).toBe(10)
    expect(scaleForPage(doc, 1)!.pixelsPerUnit).toBe(2)
    expect(scaleForPage(undefined, 0)).toBeNull()
  })

  it('quitar la escala de una página la devuelve a la del documento', () => {
    conCotas()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' }, 1)
    usePdfStore.getState().setMeasurementScale('doc-1', null, 1)
    expect(usePdfStore.getState().docs[0].pageScales?.[1]).toBeUndefined()
    expect(valorDe('c1')).toBeCloseTo(10)
  })
})

// La recuperación tras un reinicio del motor se apoya en `remapDocId`. La versión vieja
// de la recuperación copiaba a mano página y marcas y perdía el resto; lo que ya cubría
// el describe de arriba (marcas, página, zoom, undo) sigue igual, así que acá van solo
// las dos que se perdían y no estaban cubiertas.
describe('remapDocId conserva el sucio y las escalas por página', () => {
  it('un documento con marcas sin guardar sigue marcado como sucio', () => {
    usePdfStore.getState().addDoc(docInfo({ page_count: 3 }))
    usePdfStore.getState().addAnnotation('doc-1', ann({ page: 1 }))
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 4, unit: 'm' }, 1)
    expect(usePdfStore.getState().docs[0].dirty).toBe(true)

    usePdfStore.getState().remapDocId('doc-1', 'doc-nuevo')

    const d = usePdfStore.getState().docs[0]
    // Sin esto, tras un reinicio del motor un plano con marcas sin guardar dejaba de
    // avisar al cerrar la app.
    expect(d.dirty).toBe(true)
    expect(d.pageScales?.[1]?.pixelsPerUnit).toBe(4)
  })
})

// El rótulo de una cota se calculaba al crearla (y al recalibrar), pero no al
// redimensionarla: estirabas la cota y seguía mostrando los metros de antes. Peor que
// no mostrar nada, porque el número parece bueno.
describe('redimensionar una medición recalcula su valor', () => {
  function conCota() {
    usePdfStore.getState().addDoc(docInfo({ page_count: 2 }))
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    usePdfStore.getState().addAnnotation('doc-1', {
      id: 'c1', type: 'measure_distance', page: 0, x: 0, y: 0, width: 100, height: 0,
      measurement: { value: 10, unit: 'm', label: '10.00 m' },
    })
  }
  const cota = () => usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'c1')!

  it('al cambiar el ancho, el valor y el rótulo siguen la geometría', () => {
    conCota()
    usePdfStore.getState().updateAnnotation('doc-1', 'c1', { width: 250 })
    expect(cota().measurement!.value).toBeCloseTo(25)
    expect(cota().measurement!.label).toContain('25')
  })

  it('también por el camino deshacible', () => {
    conCota()
    usePdfStore.getState().updateAnnotationUndoable('doc-1', 'c1', { width: 50 })
    expect(cota().measurement!.value).toBeCloseTo(5)
  })

  it('usa la escala de SU página', () => {
    conCota()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' }, 0)
    usePdfStore.getState().updateAnnotation('doc-1', 'c1', { width: 100 })
    expect(cota().measurement!.value).toBeCloseTo(50)
  })

  it('un cambio que no es geometría no toca la medición', () => {
    conCota()
    usePdfStore.getState().updateAnnotation('doc-1', 'c1', { color: '#00ff00' })
    expect(cota().measurement!.label).toBe('10.00 m')
  })

  it('desplazar no cambia el valor (la geometría se mueve entera)', () => {
    conCota()
    usePdfStore.getState().moveAnnotations('doc-1', ['c1'], 40, 25)
    expect(cota().measurement!.value).toBeCloseTo(10)
  })

  it('una marca que no es medición se queda como está', () => {
    conCota()
    usePdfStore.getState().addAnnotation('doc-1', { id: 'r1', type: 'rect', page: 0, x: 0, y: 0, width: 10, height: 10 })
    usePdfStore.getState().updateAnnotation('doc-1', 'r1', { width: 999 })
    const r = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'r1')!
    expect(r.measurement).toBeUndefined()
  })
})

describe('herramienta fija', () => {
  it('el conteo se queda puesto aunque las herramientas sean de un solo uso', () => {
    usePdfStore.getState().setStickyTools(false)
    usePdfStore.getState().setActiveTool('count')
    usePdfStore.getState().releaseTool()
    expect(usePdfStore.getState().activeTool).toBe('count')
  })

  it('las demás sí se sueltan tras cada marca', () => {
    usePdfStore.getState().setStickyTools(false)
    usePdfStore.getState().setActiveTool('rect')
    usePdfStore.getState().releaseTool()
    expect(usePdfStore.getState().activeTool).toBeNull()
  })

  it('con la herramienta fija, ninguna se suelta sola', () => {
    usePdfStore.getState().setStickyTools(true)
    usePdfStore.getState().setActiveTool('rect')
    usePdfStore.getState().releaseTool()
    expect(usePdfStore.getState().activeTool).toBe('rect')
  })
})

describe('recalibrar la escala', () => {
  it('recalcula las mediciones que ya estaban puestas', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo())
    s.addAnnotation('doc-1', {
      id: 'm1', type: 'measure_distance', page: 0, x: 0, y: 0, width: 30, height: 40,
      color: '#000', measurement: { value: 50, unit: 'px', label: '50.0 px' },
    })

    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    expect(usePdfStore.getState().docs[0].annotations[0].measurement).toEqual(
      { value: 5, unit: 'm', label: '5.00 m' })

    // Calibrar mal y volver a calibrar: la cota vieja tiene que corregirse.
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 5, unit: 'm' })
    expect(usePdfStore.getState().docs[0].annotations[0].measurement).toEqual(
      { value: 10, unit: 'm', label: '10.00 m' })
  })

  it('no toca las marcas que no son mediciones', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo())
    s.addAnnotation('doc-1', ann({ id: 'r1' }))
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    expect(usePdfStore.getState().docs[0].annotations[0].measurement).toBeUndefined()
  })
})

describe('deshacer con varias pestañas', () => {
  it('Ctrl+Z deshace en el documento que se está viendo, no en el último tocado', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'plano-a' }))
    s.addDoc(docInfo({ doc_id: 'plano-b' }))

    usePdfStore.getState().addAnnotation('plano-b', ann({ id: 'en-b' }))
    usePdfStore.getState().addAnnotation('plano-a', ann({ id: 'en-a' }))

    // Se está viendo B; su última marca es 'en-b' aunque el último comando sea de A.
    usePdfStore.getState().setActiveDoc('plano-b')
    usePdfStore.getState().undo()

    const porId = Object.fromEntries(usePdfStore.getState().docs.map((d) => [d.doc_id, d.annotations]))
    expect(porId['plano-b']).toHaveLength(0)
    expect(porId['plano-a'].map((a) => a.id)).toEqual(['en-a'])
  })

  it('sin nada que deshacer en el documento activo, no toca los otros', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'plano-a' }))
    s.addDoc(docInfo({ doc_id: 'plano-b' }))
    usePdfStore.getState().addAnnotation('plano-a', ann({ id: 'en-a' }))

    usePdfStore.getState().setActiveDoc('plano-b')
    usePdfStore.getState().undo()

    expect(usePdfStore.getState().docs.find((d) => d.doc_id === 'plano-a')!.annotations).toHaveLength(1)
    expect(usePdfStore.getState().undoStack).toHaveLength(1)
  })

  it('rehacer también respeta el documento activo', () => {
    const s = usePdfStore.getState()
    s.addDoc(docInfo({ doc_id: 'plano-a' }))
    s.addDoc(docInfo({ doc_id: 'plano-b' }))
    usePdfStore.getState().addAnnotation('plano-a', ann({ id: 'en-a' }))
    usePdfStore.getState().setActiveDoc('plano-a')
    usePdfStore.getState().undo()

    usePdfStore.getState().setActiveDoc('plano-b')
    usePdfStore.getState().redo()
    expect(usePdfStore.getState().docs.find((d) => d.doc_id === 'plano-a')!.annotations).toHaveLength(0)

    usePdfStore.getState().setActiveDoc('plano-a')
    usePdfStore.getState().redo()
    expect(usePdfStore.getState().docs.find((d) => d.doc_id === 'plano-a')!.annotations).toHaveLength(1)
  })
})
