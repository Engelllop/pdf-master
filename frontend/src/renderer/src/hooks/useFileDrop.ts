import { useCallback, useEffect, useState } from 'react'
import { openDocument } from '../lib/openDocument'
import { usePdfStore } from '../store/usePdfStore'

export function useFileDrop() {
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const hasPdf = Array.from(e.dataTransfer.types).includes('Files')
    if (hasPdf) setIsDraggingFile(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDraggingFile(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDraggingFile(false)
    const files = Array.from(e.dataTransfer.files)
    const pdf = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdf) return
    const filePath = window.api.getFilePath(pdf)
    if (!filePath) return
    await openDocument(filePath)
  }, [])

  // Listen for files opened from main process (file association / second instance).
  // Se abren como pestañas en segundo plano y se activa la última tras un debounce:
  // un "abrir con" de un solo archivo salta a esa pestaña al instante, pero si una
  // herramienta vuelca 60+ planos de golpe la pestaña salta una sola vez (al último)
  // en lugar de re-renderizar en cada archivo.
  useEffect(() => {
    let activateTimer: ReturnType<typeof setTimeout> | null = null
    let pendingId: string | null = null
    const handler = async (path: string) => {
      const id = await openDocument(path, { activate: false })
      if (!id) return
      pendingId = id
      if (activateTimer) clearTimeout(activateTimer)
      activateTimer = setTimeout(() => {
        if (pendingId) usePdfStore.getState().setActiveDoc(pendingId)
        activateTimer = null
        pendingId = null
      }, 350)
    }
    window.api.onOpenFile(handler)
    return () => {
      if (activateTimer) clearTimeout(activateTimer)
      window.api.removeOpenFileListener()
    }
  }, [])

  return { isDraggingFile, handleDragOver, handleDragLeave, handleDrop }
}
