import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FloatingSelectionBar from './FloatingSelectionBar'
import { usePdfStore, type Annotation } from '../../store/usePdfStore'

const initialState = usePdfStore.getState()
const DOC = 'doc-1'
const pageData = { width: 800, height: 600, originalWidth: 800, originalHeight: 600, image: '' }
const toScreen = (x: number, y: number) => ({ x, y })

function rectAnn(extra: Partial<Annotation> = {}): Annotation {
  return { id: 'a1', type: 'rect', page: 0, x: 40, y: 40, width: 120, height: 80, lineWidth: 2, ...extra }
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  usePdfStore.getState().addDoc({
    doc_id: DOC, file_path: 'C:\\a.pdf', page_count: 1,
    title: null, author: null, subject: null,
    page_sizes: [{ page_num: 0, width: 800, height: 600 }],
  })
})

describe('barra flotante de la selección', () => {
  it('relleno y estilo de línea viven acá, no en PropertiesBar', () => {
    const ann = rectAnn()
    usePdfStore.getState().setAnnotations(DOC, [ann])
    render(
      <FloatingSelectionBar ann={ann} docId={DOC} pageData={pageData} toScreen={toScreen}
        scale={1} wrapperWidth={800} />,
    )
    fireEvent.click(screen.getByLabelText('Rellenar'))
    const filled = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'a1')
    expect(filled?.fillColor).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Línea Discontinua'))
    const dashed = usePdfStore.getState().docs[0].annotations.find((a) => a.id === 'a1')
    expect(dashed?.lineStyle).toBe('dashed')
  })

  it('rotar 90° aplica a la anotación', () => {
    const ann = rectAnn({ rotation: 0 })
    usePdfStore.getState().setAnnotations(DOC, [ann])
    render(
      <FloatingSelectionBar ann={ann} docId={DOC} pageData={pageData} toScreen={toScreen}
        scale={1} wrapperWidth={800} />,
    )
    fireEvent.click(screen.getByLabelText('Rotar 90°'))
    expect(usePdfStore.getState().docs[0].annotations[0].rotation).toBe(90)
  })
})
