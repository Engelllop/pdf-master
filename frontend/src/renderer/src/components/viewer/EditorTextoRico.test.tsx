import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import EditorTextoRico from './EditorTextoRico'
import type { Tramo } from '../../lib/textoRico'

const normal = { font: 'Calibri', size: 11, color: '#000000', bold: false, italic: false }
const INICIAL: Tramo[] = [
  { ...normal, text: 'Hola ' },
  { ...normal, text: 'mundo', bold: true, color: '#ff0000' },
]

function montar(extra: Partial<React.ComponentProps<typeof EditorTextoRico>> = {}) {
  const props = {
    x: 100, y: 100, zoom: 1, wrapperWidth: 800, wrapWidth: 300, minHeight: 20,
    inicial: INICIAL, estiloBase: normal, align: 'left' as const, lineHeight: 1.2,
    fuentes: ['Arial', 'Calibri'], onAlign: vi.fn(), onLineHeight: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn(),
    ...extra,
  }
  const r = render(<EditorTextoRico {...props} />)
  const editor = screen.getByRole('textbox', { name: 'Texto' })
  return { ...r, props, editor }
}

/** Selecciona los caracteres [ini, fin) del editor como lo haría el usuario. */
function seleccionar(editor: HTMLElement, ini: number, fin: number) {
  const nodos: Text[] = []
  const it = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  for (let n = it.nextNode(); n; n = it.nextNode()) nodos.push(n as Text)
  const ubicar = (pos: number) => {
    let acum = 0
    for (const n of nodos) {
      if (pos <= acum + n.data.length) return { n, o: pos - acum }
      acum += n.data.length
    }
    return { n: nodos[nodos.length - 1], o: nodos[nodos.length - 1].data.length }
  }
  const a = ubicar(ini), b = ubicar(fin)
  act(() => {
    window.getSelection()!.setBaseAndExtent(a.n, a.o, b.n, b.o)
    document.dispatchEvent(new Event('selectionchange'))
  })
}

const spans = (editor: HTMLElement) =>
  [...editor.querySelectorAll<HTMLElement>('[data-tr]')].map((s) => [s.textContent, s.dataset.bold === '1', s.dataset.color, s.dataset.size])

describe('EditorTextoRico', () => {
  it('pinta cada tramo con su formato', () => {
    const { editor } = montar()
    const s = [...editor.querySelectorAll<HTMLElement>('[data-tr]')]
    expect(s.map((x) => x.textContent)).toEqual(['Hola ', 'mundo'])
    expect(s[1].style.fontWeight).toBe('700')
    expect(s[1].style.color).toBe('rgb(255, 0, 0)')
    expect(s[0].style.fontFamily).toContain('Calibri')
  })

  it('el tamaño de letra sigue al zoom', () => {
    const { editor } = montar({ zoom: 2 })
    expect(editor.querySelector<HTMLElement>('[data-tr]')!.style.fontSize).toBe('22px')
  })

  it('la negrita se aplica solo a lo seleccionado', () => {
    const { editor } = montar()
    seleccionar(editor, 0, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(spans(editor)).toEqual([['Hola', true, '#000000', '11'], [' ', false, '#000000', '11'], ['mundo', true, '#ff0000', '11']])
  })

  it('con todo en negrita, el botón la quita (como Word)', () => {
    const { editor } = montar()
    seleccionar(editor, 5, 10)
    expect(screen.getByRole('button', { name: 'Negrita' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(spans(editor)).toEqual([['Hola ', false, '#000000', '11'], ['mundo', false, '#ff0000', '11']])
  })

  it('la barra muestra el estado de la selección y «—» si el cuerpo es mixto', () => {
    const { editor } = montar({ inicial: [{ ...normal, text: 'ab' }, { ...normal, text: 'cd', size: 14 }] })
    seleccionar(editor, 0, 2)
    expect(screen.getByLabelText('Tamaño').textContent).toBe('11')
    seleccionar(editor, 0, 4)
    expect(screen.getByLabelText('Tamaño').textContent).toBe('—')
  })

  it('A+ sube cada tramo desde su cuerpo', () => {
    const { editor } = montar({ inicial: [{ ...normal, text: 'ab' }, { ...normal, text: 'cd', size: 14 }] })
    seleccionar(editor, 0, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar tamaño' }))
    expect(spans(editor).map((s) => s[3])).toEqual(['12', '16'])
  })

  it('sin selección, el formato queda pendiente para lo que se escriba', () => {
    const { editor } = montar()
    seleccionar(editor, 5, 5)
    const cursiva = screen.getByRole('button', { name: 'Cursiva' })
    expect(cursiva.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(cursiva)
    expect(cursiva.getAttribute('aria-pressed')).toBe('true')
    // El texto no cambió: solo hay un estado pendiente.
    expect(editor.textContent).toBe('Hola mundo')
  })

  it('el formato pendiente se escribe con la letra siguiente', () => {
    const { editor } = montar()
    seleccionar(editor, 5, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Cursiva' }))
    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', cancelable: true, bubbles: true })
    act(() => { editor.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(editor.textContent).toBe('Hola Xmundo')
    expect([...editor.querySelectorAll<HTMLElement>('[data-tr]')].find((s) => s.textContent === 'X')?.dataset.italic).toBe('1')
  })

  it('Ctrl+Enter confirma con los tramos y Esc cancela', () => {
    const { editor, props } = montar()
    seleccionar(editor, 0, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(props.onCommit).toHaveBeenCalledTimes(1)
    const tramos = (props.onCommit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tramo[]
    expect(tramos.map((t) => [t.text, t.bold])).toEqual([['Hola', true], [' ', false], ['mundo', true]])
  })

  it('Esc cancela y no confirma', () => {
    const { editor, props } = montar()
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('confirmar dos veces (botón y salida de foco) no manda dos ediciones', () => {
    const { editor, props } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(props.onCommit).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Z deshace el formato y Ctrl+Y lo rehace', () => {
    const { editor } = montar()
    seleccionar(editor, 0, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(spans(editor)).toHaveLength(3)
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })
    expect(spans(editor)).toEqual([['Hola ', false, '#000000', '11'], ['mundo', true, '#ff0000', '11']])
    fireEvent.keyDown(editor, { key: 'y', ctrlKey: true })
    expect(spans(editor)).toHaveLength(3)
  })

  it('la alineación y el interlineado se avisan al llamador', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Justificar' }))
    expect(props.onAlign).toHaveBeenCalledWith('justify')
    fireEvent.change(screen.getByRole('combobox', { name: 'Interlineado' }), { target: { value: '1.5' } })
    expect(props.onLineHeight).toHaveBeenCalledWith(1.5)
  })

  it('la fuente elegida se aplica a la selección', () => {
    const { editor } = montar()
    seleccionar(editor, 0, 4)
    fireEvent.change(screen.getByRole('combobox', { name: 'Fuente' }), { target: { value: 'Arial' } })
    expect(editor.querySelector<HTMLElement>('[data-tr]')!.dataset.font).toBe('Arial')
  })
})
