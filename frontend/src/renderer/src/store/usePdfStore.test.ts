import { describe, it, expect, beforeEach } from 'vitest'
import { usePdfStore, type Annotation } from './usePdfStore'

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
  it('setMeasurementScale persiste por ruta y se borra al pasar null', () => {
    usePdfStore.getState().addDoc(docInfo())
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 3, unit: 'cm' })
    expect(JSON.parse(localStorage.getItem('pdfmaster_scales')!)['C:\\planos\\plano-a.pdf'])
      .toEqual({ pixelsPerUnit: 3, unit: 'cm' })
    usePdfStore.getState().setMeasurementScale('doc-1', null)
    expect(JSON.parse(localStorage.getItem('pdfmaster_scales')!)).toEqual({})
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

  it('la copia .bak está desactivada por defecto', () => {
    expect(usePdfStore.getState().backupOnSave).toBe(false)
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
