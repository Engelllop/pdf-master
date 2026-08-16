import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FormFieldsLayer from './FormFieldsLayer'
import { type FormField } from '../../hooks/useFormFields'

const pageData = { width: 800, height: 600, originalWidth: 800, originalHeight: 600, image: '' }

const field = (extra: Partial<FormField> = {}): FormField => ({
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
})
