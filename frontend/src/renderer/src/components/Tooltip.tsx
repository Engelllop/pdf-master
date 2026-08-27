import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
}

const RETARDO_MS = 200
const MARGEN_PANTALLA = 8

export default function Tooltip({ content, children, position = 'bottom', shortcut }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [desvio, setDesvio] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const globoRef = useRef<HTMLDivElement>(null)

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), RETARDO_MS)
  }
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setDesvio(0)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Un tooltip abierto sobre un botón que abre un menú se quedaba flotando ENCIMA del
  // menú recién abierto: el ratón no había salido del botón, así que `onMouseLeave`
  // nunca llegaba. Cualquier clic o Esc lo cierran.
  useEffect(() => {
    if (!visible) return
    const fuera = () => hide()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('mousedown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fuera, true)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [visible])

  // Los tooltips de los extremos se salían de la ventana: con `whitespace-nowrap` y
  // sin tope, un texto largo se convierte en una tira de medio metro anclada al
  // centro del botón. Ahora envuelve, y si aun así asoma, se corre lo justo.
  useLayoutEffect(() => {
    if (!visible || (position !== 'top' && position !== 'bottom')) return
    const el = globoRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const sobraIzq = MARGEN_PANTALLA - r.left
    const sobraDer = r.right - (window.innerWidth - MARGEN_PANTALLA)
    if (sobraIzq > 0) setDesvio(sobraIzq)
    else if (sobraDer > 0) setDesvio(-sobraDer)
  }, [visible, position, content])

  const posClasses = {
    top: 'bottom-full left-1/2 mb-1.5',
    bottom: 'top-full left-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }
  const centrado = position === 'top' || position === 'bottom'

  return (
    <div className="relative inline-flex"
      onMouseEnter={show} onMouseLeave={hide}
      // Navegando con Tab no se veía ni el nombre completo ni el atajo: el tooltip
      // solo existía para el ratón.
      onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div ref={globoRef} role="tooltip"
          style={centrado ? { transform: `translateX(calc(-50% + ${desvio}px))` } : undefined}
          className={`absolute z-tooltip px-2 py-1 bg-fg text-toolbar text-mini rounded-token-sm shadow-token-md border border-border pointer-events-none max-w-[260px] w-max text-left leading-snug ${posClasses[position]}`}>
          {content}
          {shortcut && (
            <kbd className="ml-1.5 px-1 py-px rounded-token-sm bg-toolbar/15 border border-toolbar/30 text-toolbar text-micro font-sans tabular">
              {shortcut}
            </kbd>
          )}
          {/* La flecha se queda pegada al botón aunque el globo se haya corrido. */}
          <div className={`absolute w-1.5 h-1.5 bg-fg border-border rotate-45 ${
            position === 'bottom' ? '-top-0.5 left-1/2 border-t border-l' :
            position === 'top' ? '-bottom-0.5 left-1/2 border-b border-r' :
            position === 'right' ? '-left-0.5 top-1/2 -translate-y-1/2 border-t border-l' :
            '-right-0.5 top-1/2 -translate-y-1/2 border-b border-r'
          }`}
            style={centrado ? { transform: `translateX(calc(-50% - ${desvio}px)) rotate(45deg)` } : undefined} />
        </div>
      )}
    </div>
  )
}
