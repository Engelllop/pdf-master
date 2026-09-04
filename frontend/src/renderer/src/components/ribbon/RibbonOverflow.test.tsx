import { Fragment } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import RibbonOverflow, { RibbonSep, aplanar, cuantosCaben, repartir, type ItemMedido } from './RibbonOverflow'

const item = (ancho: number): ItemMedido => ({ ancho, sep: false })
const sep = (ancho = 9): ItemMedido => ({ ancho, sep: true })

describe('aplanar los hijos de la cinta', () => {
  it('desenvuelve el fragment que devuelve renderRibbon', () => {
    // Sin esto la cinta entera sería UN item indivisible y no habría nada que repartir.
    const arbol = (
      <>
        <button>uno</button>
        <button>dos</button>
      </>
    )
    expect(aplanar(arbol)).toHaveLength(2)
  })

  it('desenvuelve fragments anidados y descarta lo que no se pinta', () => {
    const arbol = (
      <>
        <button>uno</button>
        <Fragment>
          <button>dos</button>
          {(0 as number) > 1 && <button>nunca</button>}
          {null}
        </Fragment>
      </>
    )
    expect(aplanar(arbol)).toHaveLength(2)
  })
})

describe('cuántas herramientas entran en la fila', () => {
  it('si cabe todo, no se reserva sitio para el botón', () => {
    expect(cuantosCaben([item(100), item(100)], 250, 32)).toBe(2)
  })

  it('si no cabe todo, el botón de desbordamiento paga su sitio', () => {
    // 300 de ancho menos 32 del botón = 268: entran dos de 100, no tres.
    expect(cuantosCaben([item(100), item(100), item(100), item(100)], 300, 32)).toBe(2)
  })

  it('el corte nunca deja un separador colgando al final', () => {
    // Entrarían dos ítems y el separador, pero una raya suelta al final se lee como
    // que algo se rompió, no como que hay más.
    const items = [item(100), item(100), sep(), item(100), item(100)]
    expect(cuantosCaben(items, 300, 32)).toBe(2)
  })

  it('con una fila diminuta se va todo al menú', () => {
    expect(cuantosCaben([item(100), item(100)], 40, 32)).toBe(0)
  })

  it('sin herramientas no hay nada que repartir', () => {
    expect(cuantosCaben([], 300, 32)).toBe(0)
  })
})

// jsdom no hace layout: se le dan anchos a mano. `data-w` es el ancho natural de
// cada herramienta y la fila mide 300, que es lo que declara el contenedor.
const ANCHO_FILA = 300
let offset: PropertyDescriptor | undefined
let client: PropertyDescriptor | undefined

beforeAll(() => {
  offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      // `data-wc` es el ancho SIN etiqueta: lo que mide la herramienta dentro de la
      // copia compacta, que es el segundo escalón del reparto.
      const compacto = this.closest('[data-ribbon-compacto]') !== null
      const propio = compacto ? this.dataset.wc ?? this.dataset.w : this.dataset.w
      if (propio) return Number(propio)
      // jsdom no hace layout: la envoltura de medida mide lo que miden sus hijos.
      return [...this.children].reduce((n, c) => {
        const hijo = c as HTMLElement
        return n + Number((compacto ? hijo.dataset.wc ?? hijo.dataset.w : hijo.dataset.w) ?? 0)
      }, 0)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    // La fila es el único elemento del componente que se estira.
    get(this: HTMLElement) { return this.className.includes('flex-1') ? ANCHO_FILA : 0 },
  })
})

afterAll(() => {
  if (offset) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offset)
  if (client) Object.defineProperty(HTMLElement.prototype, 'clientWidth', client)
})

// La misma forma que devuelve `renderRibbon()`: un fragment de elementos sueltos.
// Un componente envolvente contaría como UN item, que es justo lo que el reparto no
// puede repartir.
function herramientas(n: number, anchoCompacto = 100) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} data-w="100" data-wc={String(anchoCompacto)}>{`Herramienta ${i + 1}`}</button>
      ))}
    </>
  )
}

describe('los dos escalones del reparto', () => {
  const con = [item(100), item(100), item(100)]
  const sin = [item(40), item(40), item(40)]

  it('con sitio de sobra, las etiquetas se quedan', () => {
    expect(repartir(con, sin, 400, 32)).toEqual({ compacto: false, corte: 3 })
  })

  it('antes de esconder una herramienta se quitan las etiquetas', () => {
    // 300 no da para las tres con etiqueta (300 justo no, porque 300 <= 300 sí…):
    // con 250 no entran con etiqueta y sí sin ella, y no se esconde ninguna.
    expect(repartir(con, sin, 250, 32)).toEqual({ compacto: true, corte: 3 })
  })

  it('solo cuando ni sin etiquetas entran, el resto se va al menú', () => {
    expect(repartir(con, sin, 100, 32)).toEqual({ compacto: true, corte: 1 })
  })
})

describe('el desbordamiento de la cinta', () => {
  it('deja en la fila lo que entra y manda el resto al menú', () => {
    render(<RibbonOverflow clave="comment">{herramientas(6, 100)}</RibbonOverflow>)
    const mas = screen.getByRole('button', { name: 'Más herramientas' })
    expect(mas).toBeTruthy()
    // Las dos copias de medida (con etiqueta y sin ella) están siempre completas,
    // así que una herramienta visible aparece tres veces y una escondida, dos.
    expect(screen.getAllByText('Herramienta 1')).toHaveLength(3)
    expect(screen.getAllByText('Herramienta 6')).toHaveLength(2)
  })

  it('el menú enseña justo las que no entraron', () => {
    render(<RibbonOverflow clave="comment">{herramientas(6, 100)}</RibbonOverflow>)
    fireEvent.click(screen.getByRole('button', { name: 'Más herramientas' }))
    const menu = screen.getByRole('group', { name: 'Más herramientas' })
    expect(menu.querySelectorAll('button')).toHaveLength(4)
    expect(menu.textContent).toContain('Herramienta 3')
    expect(menu.textContent).not.toContain('Herramienta 1')
  })

  it('sin sitio para las etiquetas se apagan, y no se esconde ninguna herramienta', () => {
    // Seis de 100 no entran en 300, pero seis de 40 sí: la fila se queda compacta y
    // completa en vez de mandar cuatro herramientas a un menú.
    render(<RibbonOverflow clave="comment">{herramientas(6, 40)}</RibbonOverflow>)
    expect(screen.queryByRole('button', { name: 'Más herramientas' })).toBeNull()
    const fila = screen.getAllByText('Herramienta 6')[0].closest('[data-ribbon-compacto]')
    expect(fila).toBeTruthy()
  })

  it('si entra todo, el botón no existe', () => {
    render(<RibbonOverflow clave="read">{herramientas(2, 100)}</RibbonOverflow>)
    expect(screen.queryByRole('button', { name: 'Más herramientas' })).toBeNull()
  })

  it('un separador no abre el menú: la primera del menú es una herramienta', () => {
    render(
      <RibbonOverflow clave="comment">
        <>
          <button data-w="100">Uno</button>
          <button data-w="100">Dos</button>
          <RibbonSep />
          <button data-w="100">Tres</button>
          <button data-w="100">Cuatro</button>
        </>
      </RibbonOverflow>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Más herramientas' }))
    const menu = screen.getByRole('group', { name: 'Más herramientas' })
    expect(menu.querySelector('[data-ribbon-sep]')).toBeNull()
    expect(menu.querySelectorAll('button')).toHaveLength(2)
  })
})
