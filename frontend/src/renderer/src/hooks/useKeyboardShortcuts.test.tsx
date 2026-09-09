import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePdfStore, type Annotation } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

const deleteAnnotation = vi.fn()
const cancelDraw = vi.fn()

function abrirDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\plano-a.pdf',
    page_count: 5,
    title: null,
    author: null,
    subject: null,
    page_sizes: Array.from({ length: 5 }, (_, i) => ({ page_num: i, width: 612, height: 792 })),
  })
  return usePdfStore.getState().docs[0]
}

function marca(over: Partial<Annotation> = {}): Annotation {
  return {
    id: over.id ?? crypto.randomUUID(),
    type: 'rect',
    page: 0,
    x: 100,
    y: 100,
    width: 50,
    height: 40,
    color: '#ff0000',
    ...over,
  }
}

function montar(selectedAnnotationId: string | null = null) {
  const doc = usePdfStore.getState().docs[0]
  return renderHook(() =>
    useKeyboardShortcuts(doc, selectedAnnotationId, deleteAnnotation, cancelDraw),
  )
}

/** Un keydown de verdad sobre window, que es donde el hook escucha. */
function teclear(key: string, opts: Partial<KeyboardEventInit> & { target?: HTMLElement } = {}) {
  const { target, ...init } = opts
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => { (target ?? window).dispatchEvent(ev) })
  return ev
}

/** Un input enfocado: el hook tiene que dejar de interpretar teclas como atajos. */
function campoDeTexto() {
  const input = document.createElement('input')
  document.body.appendChild(input)
  return input
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  deleteAnnotation.mockClear()
  cancelDraw.mockClear()
  abrirDoc()
})

describe('sin documento abierto', () => {
  it('no hace nada: ningún atajo puede tocar un documento que no existe', () => {
    usePdfStore.setState({ docs: [], activeDocId: null })
    renderHook(() => useKeyboardShortcuts(undefined, 'a1', deleteAnnotation, cancelDraw))
    teclear('Delete')
    expect(deleteAnnotation).not.toHaveBeenCalled()
  })
})

describe('borrar la selección', () => {
  it('Delete borra las marcas multi-seleccionadas', () => {
    const s = usePdfStore.getState()
    const a = marca(); const b = marca()
    s.addAnnotation('doc-1', a); s.addAnnotation('doc-1', b)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id, b.id]) })
    montar()
    teclear('Delete')
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })

  it('Backspace con una sola marca usa el borrado de una', () => {
    montar('a1')
    teclear('Backspace')
    expect(deleteAnnotation).toHaveBeenCalledWith('doc-1', 'a1')
  })

  it('escribiendo en un campo, Backspace borra texto y NO marcas', () => {
    // Sin esta guarda, corregir el texto de una nota borraba la marca de debajo.
    const input = campoDeTexto()
    montar('a1')
    teclear('Backspace', { target: input })
    expect(deleteAnnotation).not.toHaveBeenCalled()
  })
})

describe('Escape', () => {
  it('suelta herramienta, selección y el trazo a medias', () => {
    act(() => { usePdfStore.getState().setActiveTool('rect') })
    montar()
    teclear('Escape')
    expect(usePdfStore.getState().activeTool).toBeNull()
    expect(cancelDraw).toHaveBeenCalled()
  })
})

describe('ajuste fino con las flechas', () => {
  it('mueve 1 pt, y 10 pt con Shift', () => {
    const s = usePdfStore.getState()
    const a = marca({ x: 100, y: 100 })
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()

    teclear('ArrowRight')
    expect(usePdfStore.getState().docs[0].annotations[0].x).toBe(101)

    teclear('ArrowDown', { shiftKey: true })
    expect(usePdfStore.getState().docs[0].annotations[0].y).toBe(110)
  })

  it('cancela el evento para que la flecha no cambie de página además de mover', () => {
    const s = usePdfStore.getState()
    const a = marca()
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()
    expect(teclear('ArrowLeft').defaultPrevented).toBe(true)
  })

  it('sin nada seleccionado no toca el evento: la flecha sigue siendo cambiar de página', () => {
    montar()
    expect(teclear('ArrowRight').defaultPrevented).toBe(false)
  })

  it('escribiendo en un campo, las flechas mueven el cursor y no la marca', () => {
    const input = campoDeTexto()
    const s = usePdfStore.getState()
    const a = marca({ x: 100 })
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()
    teclear('ArrowRight', { target: input })
    expect(usePdfStore.getState().docs[0].annotations[0].x).toBe(100)
  })
})

describe('atajos con Ctrl', () => {
  it('Ctrl+A selecciona las marcas de la página actual, no las de todo el documento', () => {
    const s = usePdfStore.getState()
    const enPagina = marca({ page: 0 })
    s.addAnnotation('doc-1', enPagina)
    s.addAnnotation('doc-1', marca({ page: 3 }))
    montar()
    teclear('a', { ctrlKey: true })
    expect(usePdfStore.getState().selectedAnnotationIds).toEqual([enPagina.id])
  })

  it('Ctrl+A sin marcas en la página no toca el evento (deja el "seleccionar todo" del sistema)', () => {
    montar()
    expect(teclear('a', { ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('Ctrl+C copia al portapapeles de marcas sin borrar nada', () => {
    const s = usePdfStore.getState()
    const a = marca()
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()
    teclear('c', { ctrlKey: true })
    expect(usePdfStore.getState().annotationClipboard).toHaveLength(1)
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(1)
  })

  it('Ctrl+X copia Y borra', () => {
    const s = usePdfStore.getState()
    const a = marca()
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()
    teclear('x', { ctrlKey: true })
    expect(usePdfStore.getState().annotationClipboard).toHaveLength(1)
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })

  it('Ctrl+V pega en la página que se está viendo, no en la de origen', () => {
    const s = usePdfStore.getState()
    const a = marca({ page: 0 })
    s.addAnnotation('doc-1', a)
    act(() => {
      usePdfStore.getState().selectAnnotations('doc-1', [a.id])
      usePdfStore.getState().copyAnnotations('doc-1', [a.id])
      usePdfStore.getState().setPage('doc-1', 2)
    })
    montar()
    teclear('v', { ctrlKey: true })
    const paginas = usePdfStore.getState().docs[0].annotations.map((x) => x.page)
    expect(paginas).toContain(2)
  })

  it('Ctrl+V con el portapapeles vacío no hace nada', () => {
    montar()
    expect(teclear('v', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })

  it('Ctrl+D duplica sin pisar el portapapeles del usuario... pero sí duplica', () => {
    const s = usePdfStore.getState()
    const a = marca()
    s.addAnnotation('doc-1', a)
    act(() => { usePdfStore.getState().selectAnnotations('doc-1', [a.id]) })
    montar()
    teclear('d', { ctrlKey: true })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(2)
  })

  it('Ctrl+Z deshace y Ctrl+Shift+Z rehace', () => {
    const s = usePdfStore.getState()
    s.addAnnotation('doc-1', marca())
    montar()
    teclear('z', { ctrlKey: true })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
    teclear('z', { ctrlKey: true, shiftKey: true })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(1)
  })

  it('Ctrl+Y también rehace (el atajo de Windows)', () => {
    const s = usePdfStore.getState()
    s.addAnnotation('doc-1', marca())
    montar()
    teclear('z', { ctrlKey: true })
    teclear('y', { ctrlKey: true })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(1)
  })

  it('escribiendo en un campo, Ctrl+Z es deshacer del texto y no de las marcas', () => {
    const input = campoDeTexto()
    const s = usePdfStore.getState()
    s.addAnnotation('doc-1', marca())
    montar()
    teclear('z', { ctrlKey: true, target: input })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(1)
  })

  it('Cmd (metaKey) vale igual que Ctrl', () => {
    const s = usePdfStore.getState()
    s.addAnnotation('doc-1', marca())
    montar()
    teclear('z', { metaKey: true })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })
})

describe('limpieza', () => {
  it('al desmontar deja de escuchar: dos visores no pueden borrar dos veces', () => {
    montar('a1').unmount()
    teclear('Delete')
    expect(deleteAnnotation).not.toHaveBeenCalled()
  })
})
