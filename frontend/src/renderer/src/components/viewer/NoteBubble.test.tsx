import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NoteBubble from './NoteBubble'
import { usePdfStore, type Annotation } from '../../store/usePdfStore'

const initialState = usePdfStore.getState()
const DOC = 'doc-1'

const pageData = { width: 800, height: 600, originalWidth: 800, originalHeight: 600, image: '' }
const toScreen = (x: number, y: number) => ({ x, y })

function noteAnn(extra: Partial<Annotation> = {}): Annotation {
  return { id: 'n1', type: 'note', page: 0, x: 100, y: 120, color: '#fbbf24', text: '', ...extra }
}

function openDocWith(ann: Annotation) {
  usePdfStore.getState().addDoc({
    doc_id: DOC, file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
  usePdfStore.getState().setAnnotations(DOC, [ann])
}

function renderBubble(ann: Annotation, onClose = () => {}) {
  return render(
    <NoteBubble ann={ann} docId={DOC} pageData={pageData} toScreen={toScreen}
      scale={1} wrapperWidth={800} wrapperHeight={600} onClose={onClose} />,
  )
}

const annotations = () => usePdfStore.getState().docs[0].annotations

beforeEach(() => {
  usePdfStore.setState(initialState, true)
})

describe('globo de la nota', () => {
  it('guarda al hacer clic fuera, sin botón de guardar', () => {
    const ann = noteAnn({ text: 'previo' })
    openDocWith(ann)
    renderBubble(ann)
    expect(screen.queryByText('Guardar')).toBeNull()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'revisar esto' } })
    fireEvent.mouseDown(document.body)

    expect(annotations()[0].text).toBe('revisar esto')
  })

  it('descarta la nota si queda vacía', () => {
    const ann = noteAnn()
    openDocWith(ann)
    renderBubble(ann)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.mouseDown(document.body)

    expect(annotations()).toHaveLength(0)
  })

  it('Esc cierra sin tocar lo ya guardado', () => {
    const ann = noteAnn({ text: 'original' })
    openDocWith(ann)
    let closed = false
    renderBubble(ann, () => { closed = true })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'descartado' } })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(closed).toBe(true)
    expect(annotations()[0].text).toBe('original')
  })

  it('el clic de fuera solo cierra: no debe llegar a la página y poner otra nota', () => {
    const ann = noteAnn({ text: 'x' })
    openDocWith(ann)
    renderBubble(ann)

    const outside = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(outside)

    expect(outside.defaultPrevented).toBe(true)
  })

  it('un clic dentro del globo no lo cierra', () => {
    const ann = noteAnn({ text: 'x' })
    openDocWith(ann)
    let closed = false
    renderBubble(ann, () => { closed = true })

    fireEvent.mouseDown(screen.getByRole('textbox'))

    expect(closed).toBe(false)
  })
})
