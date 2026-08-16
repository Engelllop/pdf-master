import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import ViewerEmptyState from './ViewerEmptyState'

describe('portada vacía', () => {
  it('dice que nunca se guarda solo', () => {
    render(<ViewerEmptyState containerRef={createRef()} onDragOver={() => {}} onDrop={() => {}} />)
    expect(screen.getByText(/Nunca se guarda solo/)).toBeTruthy()
    expect(screen.getByText(/Ctrl\+S escribe el PDF/)).toBeTruthy()
    expect(screen.getByText('Marcá sin entregar')).toBeTruthy()
  })
})
