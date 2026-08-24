import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FormFieldsLayer from './FormFieldsLayer'
import { type FormField } from '../../hooks/useFormFields'
import { askConfirm } from '../../lib/uiPrompt'

vi.mock('../../lib/uiPrompt', () => ({
  askConfirm: vi.fn(() => Promise.resolve(true)),
  askForm: vi.fn(),
}))

const pageData = { width: 800, height: 600, originalWidth: 800, originalHeight: 600, image: '' }

const field = (extra: Partial<FormField> = {}): FormField => ({
  xref: 11,
  field_name: 'medidores',
  field_type: 'Text',
  rect: { x: 10, y: 20, width: 120, height: 18 },
  value: '12',
  options: [],
  ...extra,
})

function renderLayer(fields: FormField[], onChange = vi.fn()) {
  render(<FormFieldsLayer fields={fields} pageData={pageData} onChange={onChange} />)
  return onChange
}

describe('campos de formulario', () => {
  it('escribir no guarda en cada tecla (un POST por pulsación se comía letras)', () => {
    const onChange = renderLayer([field()])
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '13' } })

    expect(onChange).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('13')
  })

  it('guarda al salir del campo', () => {
    const onChange = renderLayer([field()])
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '14' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('medidores', '14')
  })

  it('no guarda si el valor no cambió', () => {
    const onChange = renderLayer([field()])
    fireEvent.blur(screen.getByRole('textbox'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape devuelve el valor original', () => {
    const onChange = renderLayer([field()])
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect((input as HTMLInputElement).value).toBe('12')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cada widget anuncia el nombre del campo', () => {
    renderLayer([
      field(),
      field({ xref: 12, field_name: 'residencial', field_type: 'CheckBox', value: 'Off' }),
    ])
    expect(screen.getByRole('textbox', { name: 'medidores' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'residencial' })).toBeTruthy()
  })

  it('las casillas guardan en el acto (son una sola acción)', () => {
    const onChange = renderLayer([field({ field_name: 'residencial', field_type: 'CheckBox', value: 'Off' })])
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith('residencial', 'Yes')
  })

  it('un radio se confirma al marcarlo', () => {
    const onChange = renderLayer([field({ field_name: 'tipo.a', field_type: 'RadioButton', value: 'Off', options: ['Yes'] })])
    fireEvent.click(screen.getByRole('radio'))
    expect(onChange).toHaveBeenCalledWith('tipo.a', 'Yes')
  })

  it('sin campos no pinta capa (no debe tapar el clic sobre la página)', () => {
    const { container } = render(<FormFieldsLayer fields={[]} pageData={pageData} onChange={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('en modo layout no rellena: el campo se selecciona para mover o borrar', async () => {
    const onTransform = vi.fn()
    vi.mocked(askConfirm).mockResolvedValueOnce(true)
    render(<FormFieldsLayer fields={[field()]} pageData={pageData} onChange={vi.fn()}
      layoutMode onTransform={onTransform} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Campo medidores' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar campo' }))
    await waitFor(() => expect(onTransform).toHaveBeenCalledWith(11, { delete: true }))
  })

  it('cancelar el confirm de borrar no elimina el campo', async () => {
    const onTransform = vi.fn()
    vi.mocked(askConfirm).mockResolvedValueOnce(false)
    render(<FormFieldsLayer fields={[field()]} pageData={pageData} onChange={vi.fn()}
      layoutMode onTransform={onTransform} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Campo medidores' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar campo' }))
    await waitFor(() => expect(askConfirm).toHaveBeenCalled())
    expect(onTransform).not.toHaveBeenCalled()
  })
})
