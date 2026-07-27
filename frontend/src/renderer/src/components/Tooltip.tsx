import { useState, useRef, type ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
}

export default function Tooltip({ content, children, position = 'bottom', shortcut }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 200)
  }
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className={`absolute z-50 px-2 py-1 bg-fg text-toolbar text-xs rounded shadow-lg border border-border whitespace-nowrap pointer-events-none ${posClasses[position]}`}>
          {content}
          {shortcut && (
            <kbd className="ml-1.5 px-1 py-px rounded bg-toolbar/20 border border-toolbar/25 text-toolbar/80 text-[10px] font-sans">
              {shortcut}
            </kbd>
          )}
          <div className={`absolute w-1.5 h-1.5 bg-fg border-border rotate-45 ${
            position === 'bottom' ? '-top-0.5 left-1/2 -translate-x-1/2 border-t border-l' :
            position === 'top' ? '-bottom-0.5 left-1/2 -translate-x-1/2 border-b border-r' :
            position === 'right' ? '-left-0.5 top-1/2 -translate-y-1/2 border-t border-l' :
            '-right-0.5 top-1/2 -translate-y-1/2 border-b border-r'
          }`} />
        </div>
      )}
    </div>
  )
}
