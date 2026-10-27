import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import Tooltip from '../Tooltip'

/**
 * Piezas de la banda de herramientas. Vivían DENTRO del cuerpo de Toolbar: cada
 * render creaba un tipo de componente nuevo, React desmontaba y remontaba todos los
 * botones de la cinta en cada clic, y un menú abierto perdía el foco. Aquí son
 * componentes de módulo y reciben lo que necesitan por props.
 */

export type RibbonIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

/** Un grupo con nombre: el nombre va en el árbol de accesibilidad y como rótulo al
 * pie del grupo, como en cualquier cinta de escritorio. */
export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="rb-group flex flex-col items-stretch shrink-0 h-full">
      <div className="flex items-center gap-0.5 flex-1 min-h-0">{children}</div>
      <div className="rb-caption text-center text-[10.5px] leading-none pb-1 text-faint whitespace-nowrap">{label}</div>
    </div>
  )
}

const bigBase =
  'rb-btn flex flex-col items-center justify-center gap-1 h-[50px] min-w-[52px] px-1.5 rounded-token-sm ' +
  'text-fg whitespace-nowrap transition-[background-color,color,transform] duration-fast ease-token ' +
  'active:scale-[0.97] active:duration-instant disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'

const stateCls = (active?: boolean, open?: boolean) =>
  active || open ? 'bg-selected text-fg' : 'hover:bg-hover active:bg-active'

/**
 * Botón grande: icono arriba, rótulo abajo. `active` sin valor por defecto a
 * propósito: solo los que SON un interruptor (herramienta, modo) lo pasan, y solo
 * esos llevan aria-pressed.
 */
export function RibbonButton({ icon: Icon, label, tip, shortcut, onClick, active, disabled = false }: {
  icon: RibbonIcon
  label: string
  tip?: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip content={tip || label} shortcut={shortcut}>
      <button type="button" onClick={onClick} disabled={disabled} aria-label={tip || label} aria-pressed={active}
        className={`${bigBase} ${stateCls(active)}`}>
        <Icon size={20} />
        <span className="rb-label text-[11.5px] leading-none">{label}</span>
      </button>
    </Tooltip>
  )
}

/** Botón chico, solo icono: para las galerías (formas, símbolos) que van en dos
 * filas dentro de un grupo. */
export function RibbonSmallButton({ icon: Icon, label, shortcut, onClick, active, disabled = false }: {
  icon: RibbonIcon
  label: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active}
        className={`w-7 h-[23px] inline-flex items-center justify-center rounded-token-sm text-fg transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${stateCls(active)}`}>
        <Icon size={15} />
      </button>
    </Tooltip>
  )
}

/** Rejilla de botones chicos en dos filas. */
export function RibbonGallery({ children }: { children: ReactNode }) {
  return <div className="grid grid-rows-2 grid-flow-col gap-0.5 px-0.5 self-center">{children}</div>
}

/**
 * Botón grande que abre un menú. El menú se pinta en el body: la banda es material
 * (crea contexto de apilamiento) y el reparto la recorta al medir. Cualquier clic en
 * un ítem lo cierra.
 */
export function RibbonMenuButton({ icon: Icon, label, tip, active, disabled = false, children }: {
  icon: RibbonIcon
  label: string
  tip?: string
  active?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  const ancla = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const cerrar = () => setPos(null)
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    window.addEventListener('resize', cerrar)
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('resize', cerrar); window.removeEventListener('keydown', tecla) }
  }, [open])

  const menuRef = useRef<HTMLDivElement>(null)
  // Si el menú se sale por la derecha de la ventana, se corre hacia la izquierda.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !pos) return
    const sobra = el.getBoundingClientRect().right - (window.innerWidth - 8)
    if (sobra > 0) setPos({ top: pos.top, left: Math.max(8, pos.left - sobra) })
  }, [pos])

  const alternar = () => {
    if (open) { setPos(null); return }
    const r = ancla.current?.getBoundingClientRect()
    if (r) setPos({ top: Math.round(r.bottom + 4), left: Math.round(r.left) })
  }

  return (
    <>
      <Tooltip content={tip || label}>
        <button ref={ancla} type="button" onClick={alternar} disabled={disabled}
          aria-label={tip || label} aria-haspopup="menu" aria-expanded={open}
          className={`${bigBase} ${stateCls(active, open)}`}>
          <Icon size={20} />
          <span className="rb-label text-[11.5px] leading-none inline-flex items-center gap-0.5">
            {label}<ChevronDown size={10} className="text-muted" />
          </span>
        </button>
      </Tooltip>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-overlay" onClick={() => setPos(null)} />
          <div ref={menuRef} role="menu" aria-label={label} onClick={() => setPos(null)}
            style={{ top: pos.top, left: pos.left }}
            className="menu-pop fixed z-overlay-menu min-w-[220px] py-1 rounded-token border border-border bg-panel shadow-token-md">
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

export function RibbonMenuItem({ icon: Icon, label, shortcut, onClick, active, disabled = false }: {
  icon: RibbonIcon
  label: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-ui text-left text-fg transition-colors duration-fast disabled:opacity-40 ${
        active ? 'bg-selected' : 'hover:bg-hover'
      }`}>
      <Icon size={15} className="shrink-0 text-muted" />
      <span className="flex-1">{label}</span>
      {shortcut && <kbd className="text-micro text-muted tabular">{shortcut}</kbd>}
    </button>
  )
}

export function RibbonMenuSep() {
  return <div className="h-px my-1 bg-border" aria-hidden="true" />
}
