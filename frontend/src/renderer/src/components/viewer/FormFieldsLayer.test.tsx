import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FormFieldsLayer, { estaEncendido } from './FormFieldsLayer'
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
    // Motor viejo sin `on_state`: se manda «Yes», como siempre.
    expect(onChange).toHaveBeenCalledWith('residencial', 'Yes', 11)
  })

  it('un radio se confirma al marcarlo', () => {
    const onChange = renderLayer([field({ field_name: 'tipo.a', field_type: 'RadioButton', value: 'Off', options: ['Yes'] })])
    fireEvent.click(screen.getByRole('radio'))
    expect(onChange).toHaveBeenCalledWith('tipo.a', 'Yes', 11)
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

  describe('casillas y opciones con su estado activo', () => {
    const radio = (xref: number, on: string, value: string) => field({
      xref, field_name: 'sexo', field_type: 'RadioButton', value, on_state: on, options: [],
    })

    it('tilda la opción elegida aunque su estado no sea Yes (Choice2 de Acrobat)', () => {
      renderLayer([radio(6, 'Choice1', 'Off'), radio(7, 'Choice2', 'Choice2')])
      const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(a.checked).toBe(false)
      expect(b.checked).toBe(true)
    })

    it('elegir una opción manda SU estado activo y su xref, no los de la primera', () => {
      const onChange = renderLayer([radio(6, 'Choice1', 'Off'), radio(7, 'Choice2', 'Off')])
      fireEvent.click(screen.getAllByRole('radio')[1])
      expect(onChange).toHaveBeenCalledWith('sexo', 'Choice2', 7)
    })

    it('una casilla con estado «1» se ve tildada y se puede destildar', () => {
      const onChange = renderLayer([field({ field_name: 'acepto', field_type: 'CheckBox', value: '1', on_state: '1' })])
      const casilla = screen.getByRole('checkbox') as HTMLInputElement
      expect(casilla.checked).toBe(true)
      fireEvent.click(casilla)
      expect(onChange).toHaveBeenCalledWith('acepto', 'Off', 11)
    })

    it('al tildarla manda su estado activo, no «Yes»', () => {
      const onChange = renderLayer([field({ field_name: 'acepto', field_type: 'CheckBox', value: 'Off', on_state: '1' })])
      fireEvent.click(screen.getByRole('checkbox'))
      expect(onChange).toHaveBeenCalledWith('acepto', '1', 11)
    })

    it('estaEncendido compara con el estado activo del widget', () => {
      expect(estaEncendido(radio(1, 'Choice2', 'Choice2'))).toBe(true)
      expect(estaEncendido(radio(1, 'Choice1', 'Off'))).toBe(false)
      expect(estaEncendido(radio(1, 'Choice1', 'Choice2'))).toBe(false)
      expect(estaEncendido(field({ field_type: 'CheckBox', value: 'Yes' }))).toBe(true)
    })
  })

  describe('pulsadores y firmas', () => {
    it('no se dibujan como cuadros de texto editables', () => {
      renderLayer([
        field({ xref: 1, field_name: 'Imprimir', field_type: 'Button', value: '', caption: 'Imprimir' }),
        field({ xref: 2, field_name: 'Firma1', field_type: 'Signature', value: '' }),
      ])
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(screen.getByRole('note', { name: 'Botón Imprimir' }).textContent).toBe('Imprimir')
      expect(screen.getByRole('note', { name: 'Firma Firma1' })).toBeTruthy()
    })
  })

  describe('banderas del campo', () => {
    it('solo lectura: no se edita ni se guarda', () => {
      const onChange = renderLayer([field({ field_flags: 1 })])
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.readOnly).toBe(true)
      fireEvent.change(input, { target: { value: '99' } })
      fireEvent.blur(input)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('casilla, opción y lista de solo lectura quedan deshabilitadas', () => {
      renderLayer([
        field({ xref: 1, field_name: 'c', field_type: 'CheckBox', value: 'Off', field_flags: 1 }),
        field({ xref: 2, field_name: 'r', field_type: 'RadioButton', value: 'Off', field_flags: 1 }),
        field({ xref: 3, field_name: 'l', field_type: 'ComboBox', value: 'a', options: ['a'], field_flags: 1 }),
      ])
      expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
      expect((screen.getByRole('radio') as HTMLInputElement).disabled).toBe(true)
      expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    })

    it('multilínea: es un textarea y Enter no confirma', () => {
      const onChange = renderLayer([field({ field_flags: 4096, value: 'uno' })])
      const area = screen.getByRole('textbox')
      expect(area.tagName).toBe('TEXTAREA')
      area.focus()
      fireEvent.change(area, { target: { value: 'uno\ndos' } })
      fireEvent.keyDown(area, { key: 'Enter' })
      expect(onChange).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(area)
      fireEvent.blur(area)
      expect(onChange).toHaveBeenCalledWith('medidores', 'uno\ndos')
    })

    it('multilínea: Ctrl+Enter confirma', () => {
      const onChange = renderLayer([field({ field_flags: 4096, value: 'uno' })])
      const area = screen.getByRole('textbox')
      area.focus()
      fireEvent.change(area, { target: { value: 'dos' } })
      fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true })
      expect(onChange).toHaveBeenCalledWith('medidores', 'dos')
    })

    it('respeta el largo máximo', () => {
      renderLayer([field({ text_maxlen: 5 })])
      expect((screen.getByRole('textbox') as HTMLInputElement).maxLength).toBe(5)
    })

    it('sin largo máximo no pone límite', () => {
      renderLayer([field({ text_maxlen: 0 })])
      expect((screen.getByRole('textbox') as HTMLInputElement).maxLength).toBe(-1)
    })
  })
})
