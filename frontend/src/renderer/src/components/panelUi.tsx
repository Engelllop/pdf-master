import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  Copy, FilePlus2, RotateCcw, RotateCw, Scissors, Trash2, X, type LucideIcon,
} from 'lucide-react'

/** Piezas compartidas de los paneles. Estaban copiadas panel por panel y habían
 * derivado: las cabeceras no medían lo mismo a los dos lados del visor, el estado
 * vacío tenía cuatro dialectos y el mismo segmentado estaba escrito tres veces. */

// La opacidad entra en la transición porque estas acciones también se usan en filas
// que las revelan al pasar el ratón o al recibir el foco.
const iconBtnBase = 'p-1.5 rounded-token-sm text-muted transition-[color,background-color,opacity] duration-fast ease-token'
/** Acción de icono de una fila o de una cabecera de panel: 14 px de icono con
 * `p-1.5` da un objetivo de 26 px; con `p-1` y 12 px se quedaba en 20. */
export const iconBtn = `${iconBtnBase} hover:text-fg hover:bg-hover`
export const iconBtnDanger = `${iconBtnBase} hover:text-danger hover:bg-hover`

/** Un solo lenguaje de fila elegida: el gris de `--active` y el filo de acento. Los
 * paneles tenían tres (uno con `bg-black/5 dark:bg-white/10`, que se saltaba el token
 * y daba un gris distinto en oscuro). */
export const rowSelected = 'bg-selected border-fg/20'
export const rowIdle = 'border-transparent hover:bg-hover'

/** Cerrar / descartar. `p-1` con un icono de 16 px daba un objetivo de 24 px, por
 * debajo del piso de 32 que DESIGN.md pide para una fila de herramienta. */
export const closeBtn = 'grid place-items-center w-8 h-8 shrink-0 rounded-token-sm text-muted transition-colors duration-fast ease-token hover:text-fg hover:bg-hover'

/** Los tres botones de acción de un diálogo. Estaban escritos a mano en cada archivo y
 * habían derivado en alto (28–35 px), padding y apagado: uno se ponía `disabled` sin
 * bajar la opacidad y otro seguía aclarándose al pasar el ratón estando apagado. */
const btnBase = 'inline-flex items-center justify-center gap-1.5 h-8 shrink-0 rounded-token-sm text-base transition-[filter,background-color] duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed'
export const btnPrimary = `${btnBase} px-4 bg-fg text-panel hover:opacity-90 active:opacity-80 disabled:hover:opacity-100`
export const btnDanger = `${btnBase} px-4 bg-danger text-on-danger hover:opacity-90 active:opacity-80 disabled:hover:opacity-100`
export const btnGhost = `${btnBase} px-3 text-fg hover:bg-hover disabled:hover:bg-transparent`

/** Campo de texto de un diálogo: `border-control` es el contorno que llega al 3:1 que
 * pide WCAG, y `bg-surface` lo despega del panel — con `bg-panel` el campo era un
 * rectángulo del mismo color que su fondo. */
export const fieldInput = 'border border-border-control rounded-token-sm px-2 py-1.5 text-base bg-surface text-fg placeholder:text-muted transition-colors duration-fast ease-token focus:outline-none focus:border-fg'

/** Tecla. Se pintaba con `bg-surface` en el panel de atajos y con `bg-active` en el
 * menú Archivo. `App.css` ya le da cifras tabulares a todo `kbd`. */
export const kbdChip = 'shrink-0 px-1.5 py-0.5 rounded-token-sm border border-border bg-active font-sans text-micro text-muted'

/** Casillas y radios nativos pintan su marca con `accent-color`; sin esto salían con
 * el azul del sistema en vez del de la app. */
export const nativeAccent = { accentColor: 'rgb(var(--fg))' }

export function PanelHeader({ icon: Icon, title, children }: {
  icon?: LucideIcon
  title: string
  children?: ReactNode
}) {
  return (
    <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-panel shrink-0">
      {Icon && <Icon size={14} className="text-muted shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-micro font-semibold uppercase tracking-wider text-muted">
        {title}
      </span>
      {children}
    </div>
  )
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Andamio de los diálogos modales: scrim, panel, foco inicial, Escape y encierro del
 * Tab. Estaba copiado en cuatro archivos y había derivado — el icono de la cabecera
 * medía 18 px en dos y 16 en otro, y solo uno encerraba el tabulador: en los demás el
 * Tab se escapaba al documento de detrás con `aria-modal` puesto. */
export function DialogShell({ label, panelClass = '', zClass = 'z-dialog', dismissible = true, onClose, children }: {
  label: string
  panelClass?: string
  zClass?: string
  /** `false` mientras corre una operación: cerrar a media impresión deja el trabajo
   * en marcha sin nada en pantalla que lo diga. */
  dismissible?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Sin foco dentro, el Escape del contenedor no llegaba hasta que el usuario clicaba
  // dentro. Solo lo toma si nadie lo pidió ya (un campo con autoFocus, p. ej.).
  useEffect(() => {
    const el = ref.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab') return
    const focos = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])]
      .filter((n) => !n.hasAttribute('disabled'))
    if (focos.length === 0) return
    const primero = focos[0]
    const ultimo = focos[focos.length - 1]
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  return (
    <div className={`overlay-in fixed inset-0 ${zClass} flex items-center justify-center bg-[rgb(var(--scrim)/0.45)] backdrop-blur-[2px]`}
      onClick={() => { if (dismissible) onClose() }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
        className={`panel-in max-w-[92vw] rounded-token border border-border shadow-token-lg bg-panel text-fg focus:outline-none ${panelClass}`}>
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ icon: Icon, iconClass = 'text-muted', title, sticky, onClose, children }: {
  icon?: LucideIcon
  iconClass?: string
  title: string
  sticky?: boolean
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 border-b border-border bg-panel shrink-0 ${sticky ? 'sticky top-0 z-raised' : ''}`}>
      {Icon && <Icon size={16} className={`shrink-0 ${iconClass}`} />}
      <h2 className="flex-1 min-w-0 truncate text-base font-semibold">{title}</h2>
      {children}
      <button onClick={onClose} aria-label="Cerrar" className={`${closeBtn} -mr-1.5`}>
        <X size={16} />
      </button>
    </div>
  )
}

/** Pie de diálogo: la acción primaria SIEMPRE al final (a la derecha), la de escape a
 * su izquierda, y una nota opcional pegada al borde opuesto. */
export function DialogFooter({ note, children }: { note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
      {note && <p className="mr-auto text-micro text-muted">{note}</p>}
      {children}
    </div>
  )
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <Icon size={18} className="text-muted" />
      <p className="text-mini text-muted">{children}</p>
    </div>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-micro text-muted shrink-0">{children}</span>
}

export function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-token border border-border bg-panel px-2 py-1 shrink-0">
      {children}
    </div>
  )
}

/** Interruptor de N estados. El tercer campo de cada opción es el motivo: en una barra
 * densa no cabe explicar, pero al pasar el ratón sí. */
export function SegmentedGroup<T extends string>({ value, options, onChange }: {
  value: T
  options: Array<[T, string, string?]>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-token border border-border bg-surface p-0.5">
      {options.map(([id, etiqueta, porque]) => (
        <button key={id} onClick={() => onChange(id)} title={porque} aria-pressed={value === id}
          className={`px-2 h-6 rounded-token-sm text-micro transition-colors duration-fast ease-token ${
            value === id ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg'
          }`}>
          {etiqueta}
        </button>
      ))}
    </div>
  )
}

/** Las seis acciones de página. Estaban pintadas de dos formas (iconos sueltos en la
 * barra flotante de las miniaturas, icono + texto en el organizador), así que el rojo
 * de Eliminar y el apagado por falta de selección se definían dos veces. En `dense`
 * la etiqueta la lee solo el lector de pantalla. */
export function PageActions({ dense, noSelection, busy, onRotate, onDuplicate, onInsertBlank, onExtract, onDelete }: {
  dense?: boolean
  noSelection: boolean
  busy?: boolean
  onRotate: (degrees: number) => void
  onDuplicate: () => void
  onInsertBlank: () => void
  onExtract: () => void
  onDelete: () => void
}) {
  const cls = `flex items-center gap-1.5 rounded-token text-mini transition-colors duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
    dense ? 'w-8 h-8 justify-center' : 'px-2.5 h-8'
  }`
  const acciones: Array<[LucideIcon, string, string, () => void, boolean]> = [
    [RotateCcw, 'Izq.', 'Rotar 90° izquierda', () => onRotate(-90), noSelection],
    [RotateCw, 'Der.', 'Rotar 90° derecha', () => onRotate(90), noSelection],
    [Copy, 'Duplicar', 'Duplicar página', onDuplicate, noSelection],
    [FilePlus2, 'En blanco', 'Insertar página en blanco después', onInsertBlank, false],
    [Scissors, 'Extraer', 'Extraer a nuevo PDF', onExtract, noSelection],
  ]
  return (
    <>
      {acciones.map(([Icon, etiqueta, titulo, accion, sinSeleccion]) => (
        <button key={titulo} onClick={accion} disabled={busy || sinSeleccion}
          title={titulo} aria-label={titulo}
          className={`${cls} text-fg hover:bg-hover`}>
          <Icon size={14} />
          <span className={dense ? 'sr-only' : ''}>{etiqueta}</span>
        </button>
      ))}
      {/* Seis rellenos iguales no dicen cuál es el peligroso: solo eliminar se tiñe. */}
      <button onClick={onDelete} disabled={busy || noSelection}
        title="Eliminar página(s)" aria-label="Eliminar página(s)"
        className={`${cls} text-danger hover:bg-danger/10`}>
        <Trash2 size={14} />
        <span className={dense ? 'sr-only' : ''}>Eliminar</span>
      </button>
    </>
  )
}
