import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const spans = [
  { text: 'PLANTA BAJA', x0: 10, y0: 100, x1: 90, y1: 112, size: 12 },
  { text: ' (parcial)', x0: 90, y0: 100, x1: 140, y1: 112, size: 12 },
  { text: 'ESCALA 1:100', x0: 10, y0: 130, x1: 95, y1: 142, size: 12 },
]
vi.mock('../../lib/spans', () => ({ getSpans: vi.fn(async () => spans) }))

import TextLayer from './TextLayer'

afterEach(() => { cleanup() })

const dims = { width: 612, height: 792, originalWidth: 612, originalHeight: 792 }

describe('capa de texto seleccionable', () => {
  it('separa renglones para que el copiado no salga pegado', async () => {
    const { container } = render(
      <TextLayer docId="doc-1" page={0} version={0} pageData={dims} active />
    )
    await waitFor(() => expect(screen.getByText('PLANTA BAJA')).toBeTruthy())
    // Un solo salto: los dos trozos del primer renglón comparten línea.
    expect(container.querySelectorAll('br').length).toBe(1)
  })

  it('no captura el puntero cuando hay una herramienta activa', async () => {
    render(<TextLayer docId="doc-1" page={0} version={0} pageData={dims} active={false} />)
    const span = await screen.findByText('ESCALA 1:100')
    expect((span as HTMLElement).style.pointerEvents).toBe('none')
  })
})
