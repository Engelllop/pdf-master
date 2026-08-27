import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StatusBar from './StatusBar'
import { usePdfStore } from '../store/usePdfStore'

const initialState = usePdfStore.getState()

function openDoc() {
  usePdfStore.getState().addDoc({
    doc_id: 'doc-1', file_path: 'C:\\a.pdf', page_count: 3,
    title: null, author: null, subject: null,
    page_sizes: Array.from({ length: 3 }, (_, i) => ({ page_num: i, width: 800, height: 600 })),
  })
}

beforeEach(() => {
  usePdfStore.setState(initialState, true)
  localStorage.clear()
})

describe('estado de guardado', () => {
  it('sin documento no promete un guardado automático', () => {
    render(<StatusBar />)
    expect(screen.getByText('Sin documento')).toBeTruthy()
    expect(screen.queryByText(/Sin guardar/)).toBeNull()
  })

  it('con cambios muestra Sin guardar · Ctrl+S y dispara el atajo', () => {
    openDoc()
    usePdfStore.getState().setDocDirty('doc-1', true)
    const save = vi.fn()
    window.addEventListener('app:shortcut-save', save)
    render(<StatusBar />)
    expect(screen.getByRole('button', { name: 'Sin guardar. Guardar con Ctrl+S' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sin guardar. Guardar con Ctrl+S' }))
    expect(save).toHaveBeenCalled()
    window.removeEventListener('app:shortcut-save', save)
  })

  it('mientras guarda no tapa el spinner con Sin guardar', () => {
    openDoc()
    usePdfStore.getState().setDocDirty('doc-1', true)
    usePdfStore.setState({ saveStatus: 'saving' })
    render(<StatusBar />)
    expect(screen.getByText('Guardando...')).toBeTruthy()
    expect(screen.queryByText(/Sin guardar/)).toBeNull()
  })

  it('tras guardar limpio muestra Guardado', () => {
    openDoc()
    usePdfStore.setState({ saveStatus: 'saved' })
    render(<StatusBar />)
    expect(screen.getByText('Guardado')).toBeTruthy()
    expect(screen.queryByText(/Sin guardar/)).toBeNull()
  })
})

describe('chrome de zoom', () => {
  it('los iconos de encuadre y zoom tienen nombre', () => {
    openDoc()
    render(<StatusBar />)
    expect(screen.getByLabelText('Página actual')).toBeTruthy()
    expect(screen.getByLabelText('Alejar')).toBeTruthy()
    expect(screen.getByLabelText('Acercar')).toBeTruthy()
    expect(screen.getByLabelText('Ajustar al ancho')).toBeTruthy()
    expect(screen.getByLabelText('Ajustar página')).toBeTruthy()
    expect(screen.getByLabelText('Scroll continuo')).toBeTruthy()
  })

  it('el porcentaje actual se marca con relleno de tinta, no con color de texto', () => {
    openDoc()
    usePdfStore.getState().setZoom('doc-1', 1, true)
    render(<StatusBar />)
    fireEvent.click(screen.getByLabelText('Nivel de zoom'))
    const current = screen.getByRole('button', { name: '100%' })
    expect(current.className).toMatch(/bg-accent/)
    expect(current.className).toMatch(/text-toolbar/)
    expect(current.className).not.toMatch(/text-accent/)
  })

  it('en Comparar no muestra el zoom del documento oculto', () => {
    openDoc()
    usePdfStore.setState({ compareMode: true })
    render(<StatusBar />)
    expect(screen.getByLabelText('Página actual')).toBeTruthy()
    expect(screen.queryByLabelText('Alejar')).toBeNull()
    expect(screen.queryByLabelText('Nivel de zoom')).toBeNull()
    expect(screen.queryByLabelText('Scroll continuo')).toBeNull()
  })
})

// Un juego de planos mezcla escalas. Si la lámina tiene su propia calibración hay que
// verlo (recalibrar el documento no la toca) y poder devolverla a la del documento: el
// store lo soportaba desde que existe la escala por página, pero no había forma de
// llegar ahí desde la UI.
describe('escala de medición por página', () => {
  it('con la escala del documento no anuncia página ni ofrece quitarla', () => {
    openDoc()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    render(<StatusBar />)
    expect(screen.getByText(/1 m = 10.00 pt/)).toBeTruthy()
    expect(screen.queryByText('usar la del documento')).toBeNull()
  })

  it('con escala propia lo dice y deja volver a la del documento', () => {
    openDoc()
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 10, unit: 'm' })
    usePdfStore.getState().setMeasurementScale('doc-1', { pixelsPerUnit: 2, unit: 'm' }, 0)
    render(<StatusBar />)
    expect(screen.getByText(/1 m = 2.00 pt/)).toBeTruthy()
    expect(screen.getByText(/pág. 1/)).toBeTruthy()

    fireEvent.click(screen.getByText('usar la del documento'))
    expect(usePdfStore.getState().docs[0].pageScales?.[0]).toBeUndefined()
    expect(screen.getByText(/1 m = 10.00 pt/)).toBeTruthy()
  })
})
