import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnnotationDraw } from './useAnnotationDraw'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

// Render a mitad de resolución: 1 px de pantalla = 2 pt PDF
const pageData = { width: 800, height: 600, originalWidth: 1600, originalHeight: 1200 }

function openDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1',
    file_path: 'C:\\planos\\plano-a.pdf',
    page_count: 5,
    title: null,
    author: null,
    subject: null,
    page_sizes: [{ page_num: 0, width: 1600, height: 1200 }],
  })
  return usePdfStore.getState().docs[0]
}

function setup() {
  const activeDoc = openDoc()
  return renderHook(
    ({ doc }) => useAnnotationDraw(doc, pageData),
    { initialProps: { doc: activeDoc } }
  )
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('toPdfCoords', () => {
  it('escala de coordenadas de pantalla a puntos PDF', () => {
    const { result } = setup()
    expect(result.current.toPdfCoords(100, 50)).toEqual({ x: 200, y: 100 })
  })
})

describe('rect: arrastre hacia atrás (regresión v1.2.6)', () => {
  it('normaliza x,y a la esquina superior izquierda y width/height a positivos', async () => {
    usePdfStore.setState({ activeTool: 'rect' })
    const { result } = setup()

    act(() => { result.current.handleMouseDown({ x: 100, y: 100 }) })
    act(() => { result.current.handleMouseMove({ x: 40, y: 30 }) })
    // El preview conserva el signo del delta mientras se arrastra
    expect(result.current.drawPreview?.width).toBe(-120)
    expect(result.current.drawPreview?.height).toBe(-140)

    await act(async () => { await result.current.handleMouseUp() })
    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns).toHaveLength(1)
    expect(anns[0]).toMatchObject({ type: 'rect', x: 80, y: 60, width: 120, height: 140 })
  })
})

describe('count', () => {
  it('cada clic añade una marca con la categoría activa', () => {
    usePdfStore.setState({ activeTool: 'count', countCategory: 'Luminarias', annotationColor: '#ef4444' })
    const { result } = setup()

    act(() => { result.current.handleMouseDown({ x: 100, y: 100 }) })
    act(() => { result.current.handleMouseDown({ x: 200, y: 150 }) })

    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns).toHaveLength(2)
    expect(anns[0]).toMatchObject({ type: 'count', x: 200, y: 200, text: 'Luminarias', color: '#ef4444' })
    expect(anns[1]).toMatchObject({ type: 'count', x: 400, y: 300 })
    // La herramienta sigue activa para seguir contando
    expect(usePdfStore.getState().activeTool).toBe('count')
  })
})

describe('circle', () => {
  it('fuerza el círculo a un cuadrado con el lado menor', async () => {
    usePdfStore.setState({ activeTool: 'circle' })
    const { result } = setup()

    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    act(() => { result.current.handleMouseMove({ x: 110, y: 40 }) })
    await act(async () => { await result.current.handleMouseUp() })

    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns[0]).toMatchObject({ type: 'circle', width: 60, height: 60 })
  })
})

describe('defaults de trazo', () => {
  it('aplica grosor/estilo/opacidad del store y relleno solo en formas', () => {
    usePdfStore.setState({
      activeTool: 'rect',
      annotationLineWidth: 6,
      annotationLineStyle: 'dashed',
      annotationOpacity: 0.8,
      annotationFillColor: '#00ff00',
      annotationFillOpacity: 0.4,
    })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    expect(result.current.drawPreview).toMatchObject({
      lineWidth: 6,
      lineStyle: 'dashed',
      opacity: 0.8,
      fillColor: '#00ff00',
      fillOpacity: 0.4,
    })
  })

  it('el resalte con opacidad 1 no guarda opacity (usa su default de render)', () => {
    usePdfStore.setState({ activeTool: 'highlight', annotationOpacity: 1 })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    expect(result.current.drawPreview?.opacity).toBeUndefined()
  })

  it('la firma fuerza color negro y grosor 3', () => {
    usePdfStore.setState({ activeTool: 'signature', annotationColor: '#ff0000' })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    expect(result.current.drawPreview).toMatchObject({ color: '#000000', lineWidth: 3 })
  })
})

describe('draw (dibujo libre)', () => {
  it('acumula puntos y guarda la anotación con >2 puntos', async () => {
    usePdfStore.setState({ activeTool: 'draw' })
    const { result } = setup()

    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    act(() => { result.current.handleMouseMove({ x: 20, y: 20 }) })
    act(() => { result.current.handleMouseMove({ x: 30, y: 25 }) })
    await act(async () => { await result.current.handleMouseUp() })

    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns).toHaveLength(1)
    expect(anns[0].points).toEqual([
      { x: 20, y: 20 },
      { x: 40, y: 40 },
      { x: 60, y: 50 },
    ])
  })

  it('un clic sin arrastre (<3 puntos) no crea anotación', async () => {
    usePdfStore.setState({ activeTool: 'draw' })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    await act(async () => { await result.current.handleMouseUp() })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
  })
})

describe('medición de distancia', () => {
  it('sin calibración guarda en px y avisa con un toast de error', async () => {
    usePdfStore.setState({ activeTool: 'measure_distance' })
    const { result } = setup()

    act(() => { result.current.handleMouseDown({ x: 0, y: 0 }) })
    act(() => { result.current.handleMouseMove({ x: 30, y: 40 }) })
    await act(async () => { await result.current.handleMouseUp() })

    const anns = usePdfStore.getState().docs[0].annotations
    expect(anns[0].measurement).toMatchObject({ unit: 'px' })
    expect(usePdfStore.getState().toasts.some((t) => t.type === 'error')).toBe(true)
  })

  it('con calibración convierte px a la unidad real', async () => {
    usePdfStore.setState({ activeTool: 'measure_distance' })
    const { result, rerender } = setup()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' })
    rerender({ doc: usePdfStore.getState().docs[0] })

    // pantalla (0,0)→(30,40) = PDF (0,0)→(60,80): hipotenusa 100 pt / 2 = 50 m
    act(() => { result.current.handleMouseDown({ x: 0, y: 0 }) })
    act(() => { result.current.handleMouseMove({ x: 30, y: 40 }) })
    await act(async () => { await result.current.handleMouseUp() })

    const m = usePdfStore.getState().docs[0].annotations[0].measurement!
    expect(m.value).toBeCloseTo(50)
    expect(m.unit).toBe('m')
    expect(m.label).toBe('50.00 m')
  })
})

describe('medición de área (shoelace)', () => {
  it('calcula el área real de un polígono calibrado', async () => {
    usePdfStore.setState({ activeTool: 'measure_area' })
    const { result, rerender } = setup()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' })
    rerender({ doc: usePdfStore.getState().docs[0] })

    // Cuadrado PDF de 100x100 pt = (100/2)·(100/2) = 2500 m²
    act(() => { result.current.handleMouseDown({ x: 0, y: 0 }) })
    act(() => { result.current.handleMouseDown({ x: 50, y: 0 }) })
    act(() => { result.current.handleMouseDown({ x: 50, y: 50 }) })
    act(() => { result.current.handleMouseDown({ x: 0, y: 50 }) })
    act(() => { result.current.closeArea() })

    const m = usePdfStore.getState().docs[0].annotations[0].measurement!
    expect(m.value).toBeCloseTo(2500)
    expect(m.unit).toBe('m²')
  })

  it('con menos de 3 puntos no mide y avisa', () => {
    usePdfStore.setState({ activeTool: 'measure_area' })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 0, y: 0 }) })
    act(() => { result.current.handleMouseDown({ x: 50, y: 0 }) })
    act(() => { result.current.closeArea() })
    expect(usePdfStore.getState().docs[0].annotations).toHaveLength(0)
    expect(usePdfStore.getState().toasts.some((t) => t.type === 'error')).toBe(true)
  })
})

describe('cancelDraw', () => {
  it('limpia todo el estado de dibujo en curso', () => {
    usePdfStore.setState({ activeTool: 'rect' })
    const { result } = setup()
    act(() => { result.current.handleMouseDown({ x: 10, y: 10 }) })
    act(() => { result.current.handleMouseMove({ x: 50, y: 50 }) })
    act(() => { result.current.cancelDraw() })
    expect(result.current.drawing).toBe(false)
    expect(result.current.drawPreview).toBeNull()
    expect(result.current.drawPoints).toHaveLength(0)
  })
})

describe('sin herramienta activa', () => {
  it('handleMouseDown no hace nada', () => {
    const { result } = setup()
    let handled = true
    act(() => { handled = result.current.handleMouseDown({ x: 10, y: 10 }) })
    expect(handled).toBe(false)
    expect(result.current.drawing).toBe(false)
  })
})
