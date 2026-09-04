import {
  Children, Fragment, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { MoreHorizontal } from 'lucide-react'
import Tooltip from '../Tooltip'

/**
 * Las herramientas del modo comparten fila con los modos, así que ya no pueden
 * envolverse ni cortarse solas: lo que no cabe se va a «Más herramientas». Antes la
 * fila hacía `flex-wrap` (la cinta crecía y empujaba el documento hacia abajo) o
 * `flex-nowrap` con `overflow` (las últimas herramientas del modo Comentar
 * simplemente dejaban de existir en una ventana estrecha, sin ningún aviso).
 *
 * La medida se toma sobre una copia fuera de pantalla que siempre está completa: si
 * se midiera la fila real, ocultar un botón cambiaría el ancho disponible y la
 * cuenta oscilaría entre dos estados en cada frame.
 */

export type ItemMedido = { ancho: number; sep: boolean }
export type Reparto = { compacto: boolean; corte: number }

/** El separador de la cinta. Vive aquí y no en Toolbar porque el reparto necesita
 * reconocerlo en los dos lados: en el DOM para medir (`data-ribbon-sep`) y en el
 * árbol de React para no dejar una raya suelta al final de la fila ni al principio
 * del menú. */
export function RibbonSep() {
  return <div data-ribbon-sep aria-hidden="true" className="w-px h-4 mx-1 bg-border shrink-0" />
}

/** React no aplana los fragments, y `renderRibbon()` devuelve justamente uno: sin
 * esto la cinta entera sería UN item indivisible. */
export function aplanar(nodo: ReactNode): ReactNode[] {
  const salida: ReactNode[] = []
  for (const hijo of Children.toArray(nodo)) {
    if (isValidElement(hijo) && hijo.type === Fragment) {
      salida.push(...aplanar((hijo.props as { children?: ReactNode }).children))
    } else if (hijo !== null && hijo !== '') {
      // Children.toArray ya descarta null/undefined/boolean; queda descartar la
      // cadena vacía, que sí sobrevive y contaría como un item de ancho 0.
      salida.push(hijo)
    }
  }
  return salida
}

/**
 * Índice de corte: cuántos items se quedan en la fila. Si no cabe todo hay que
 * reservar sitio para el botón de desbordamiento, y el corte nunca puede caer
 * justo detrás de un separador (una raya suelta al final de la fila se lee como
 * que algo se rompió, no como que hay más).
 */
export function cuantosCaben(items: ItemMedido[], disponible: number, anchoMas: number): number {
  if (items.length === 0) return 0
  const total = items.reduce((suma, i) => suma + i.ancho, 0)
  if (total <= disponible) return items.length

  const presupuesto = disponible - anchoMas
  let usado = 0
  let corte = 0
  while (corte < items.length && usado + items[corte].ancho <= presupuesto) {
    usado += items[corte].ancho
    corte++
  }
  while (corte > 0 && items[corte - 1].sep) corte--
  return corte
}

/**
 * Dos escalones antes de esconder nada: primero se van las ETIQUETAS de las
 * herramientas (el nombre sigue en el tooltip), y solo si aun así no entran se
 * manda el resto al menú. Al revés —esconder herramientas mientras sobra sitio
 * porque las etiquetas ocupan— el modo Comentar se quedaba con media cinta en un
 * menú en una ventana normal.
 */
export function repartir(conEtiqueta: ItemMedido[], sinEtiqueta: ItemMedido[], disponible: number, anchoMas: number): Reparto {
  const total = (items: ItemMedido[]) => items.reduce((suma, i) => suma + i.ancho, 0)
  if (total(conEtiqueta) <= disponible) return { compacto: false, corte: conEtiqueta.length }
  if (total(sinEtiqueta) <= disponible) return { compacto: true, corte: sinEtiqueta.length }
  return { compacto: true, corte: cuantosCaben(sinEtiqueta, disponible, anchoMas) }
}

export default function RibbonOverflow({ clave, children }: { clave: string; children: ReactNode }) {
  const items = aplanar(children)
  const fila = useRef<HTMLDivElement>(null)
  const medidor = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLDivElement>(null)
  const medidorCompacto = useRef<HTMLDivElement>(null)
  const [reparto, setReparto] = useState<Reparto>({ compacto: false, corte: items.length })
  const [abierto, setAbierto] = useState(false)
  const { compacto, corte } = reparto

  const medir = useCallback(() => {
    const contenedor = fila.current
    const copia = medidor.current
    const copiaCompacta = medidorCompacto.current
    if (!contenedor || !copia || !copiaCompacta) return
    // El gap de la fila entra en la cuenta: doce botones son once huecos.
    const gap = parseFloat(getComputedStyle(contenedor).columnGap) || 0
    const leer = (raiz: HTMLDivElement): ItemMedido[] => [...raiz.children].map((hijo, i) => {
      const el = hijo as HTMLElement
      return {
        ancho: el.offsetWidth + (i === 0 ? 0 : gap),
        sep: el.querySelector('[data-ribbon-sep]') !== null,
      }
    })
    const anchoMas = (botonRef.current?.offsetWidth ?? 32) + gap
    setReparto(repartir(leer(copia), leer(copiaCompacta), contenedor.clientWidth, anchoMas))
  }, [])

  // `clave` es el modo de la cinta: es lo que cambia el juego de herramientas. Medir
  // en cada render obligaría a un reflow por cada clic en una herramienta.
  useLayoutEffect(() => { medir() }, [medir, clave, items.length])

  useEffect(() => {
    const contenedor = fila.current
    if (!contenedor) return
    const ro = new ResizeObserver(() => medir())
    ro.observe(contenedor)
    return () => ro.disconnect()
  }, [medir])

  // Lo escondido deja de estarlo al ensancharse la ventana: un menú abierto que se
  // queda vacío es peor que uno que se cierra solo.
  useEffect(() => { if (corte >= items.length) setAbierto(false) }, [corte, items.length])

  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto])

  if (items.length === 0) return null

  const visibles = items.slice(0, corte)
  // Un separador al principio del menú separa el borde de la primera herramienta.
  let ocultos = items.slice(corte)
  while (ocultos.length > 0 && esSeparador(ocultos[0])) ocultos = ocultos.slice(1)
  const hayOcultos = ocultos.length > 0

  return (
    <div ref={fila} data-ribbon-compacto={compacto || undefined}
      className="relative flex items-center gap-1 min-w-0 flex-1">
      {/* Copia de medida: siempre completa, nunca visible, fuera del orden de
          tabulación y del árbol de accesibilidad. */}
      <div ref={medidor} aria-hidden="true" inert
        className="fixed -left-[9999px] top-0 flex items-center gap-1 pointer-events-none invisible">
        {items.map((item, i) => <span key={i} className="inline-flex items-center">{item}</span>)}
      </div>
      {/* La misma copia, pero sin etiquetas: es el segundo escalón del reparto. */}
      <div ref={medidorCompacto} aria-hidden="true" inert data-ribbon-compacto
        className="fixed -left-[9999px] top-0 flex items-center gap-1 pointer-events-none invisible">
        {items.map((item, i) => <span key={i} className="inline-flex items-center">{item}</span>)}
      </div>

      {visibles}

      {hayOcultos && (
        <div ref={botonRef} className="relative shrink-0">
          <Tooltip content={`Más herramientas (${ocultos.length})`}>
            <button onClick={() => setAbierto((v) => !v)} aria-label="Más herramientas"
              aria-haspopup="dialog" aria-expanded={abierto}
              className={`w-8 h-8 inline-flex items-center justify-center rounded-token-sm transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant ${
                abierto ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg hover:bg-hover'
              }`}>
              <MoreHorizontal size={16} />
            </button>
          </Tooltip>
          {abierto && (
            <>
              <div className="fixed inset-0 z-dropdown" onClick={() => setAbierto(false)} />
              {/* Se cierra con cualquier clic dentro: cada herramienta es una acción
                  suelta y dejar el menú abierto encima del documento estorba. */}
              <div role="group" aria-label="Más herramientas" onClick={() => setAbierto(false)} data-ribbon-menu
                className="menu-pop absolute right-0 top-full mt-2 z-dropdown min-w-[200px] max-h-[60vh] overflow-y-auto
                           flex flex-col items-stretch gap-0.5 p-1.5 rounded-token-lg bg-panel border border-border shadow-token-md">
                {ocultos}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function esSeparador(nodo: ReactNode): boolean {
  return isValidElement(nodo) && nodo.type === RibbonSep
}
