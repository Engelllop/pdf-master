import { useState, useCallback, useEffect } from 'react'

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean } | null>(null)

  const openMenu = useCallback((clientX: number, clientY: number) => {
    setContextMenu({ x: clientX, y: clientY, visible: true })
  }, [])

  const closeMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // El menú solo se cerraba al elegir algo: un clic fuera, Esc o mover la rueda lo
  // dejaban clavado sobre el plano, y encima seguía apuntando a la página anterior.
  // Va en fase de captura para adelantarse a los handlers de la página.
  useEffect(() => {
    if (!contextMenu?.visible) return
    const fuera = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[role="menu"]')) return
      closeMenu()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Esc también suelta la herramienta: acá se corta para que la primera pulsación
      // solo cierre el menú.
      e.stopPropagation()
      closeMenu()
    }
    window.addEventListener('mousedown', fuera, true)
    window.addEventListener('contextmenu', fuera, true)
    window.addEventListener('wheel', closeMenu, { passive: true })
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fuera, true)
      window.removeEventListener('contextmenu', fuera, true)
      window.removeEventListener('wheel', closeMenu)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [contextMenu?.visible, closeMenu])

  return { contextMenu, setContextMenu, openMenu, closeMenu }
}
