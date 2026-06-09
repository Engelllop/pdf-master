import { useCallback, useEffect, useState } from 'react'
import { openDocument } from '../lib/openDocument'

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
  // Opened as background tabs so a tool printing 60+ plans at once doesn't render
  // every document — only the first/active one renders; others render when clicked.
  useEffect(() => {
    const handler = (path: string) => { openDocument(path, { activate: false }) }
    window.api.onOpenFile(handler)
    return () => { window.api.removeOpenFileListener() }
  }, [])

  return { isDraggingFile, handleDragOver, handleDragLeave, handleDrop }
}
