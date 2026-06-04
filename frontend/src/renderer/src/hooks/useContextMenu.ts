import { useState, useCallback } from 'react'

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean } | null>(null)

  const openMenu = useCallback((clientX: number, clientY: number) => {
    setContextMenu({ x: clientX, y: clientY, visible: true })
  }, [])

  const closeMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  return { contextMenu, setContextMenu, openMenu, closeMenu }
}
