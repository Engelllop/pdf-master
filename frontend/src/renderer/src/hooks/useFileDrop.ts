import { useCallback, useEffect, useState } from 'react'
import { usePdfStore, type PdfState } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'

export function useFileDrop() {
  const store = usePdfStore() as PdfState
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
    // @ts-ignore
    const filePath = pdf.path as string
    if (!filePath) return
    try {
      const res = await fetch(`${API_BASE}/pdf/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
      })
      if (!res.ok) throw new Error('Error abriendo PDF')
      const data = await res.json()
      store.addDoc(data)
    } catch (err: any) { alert('Error: ' + err.message) }
  }, [])

  // Listen for files opened from main process
  useEffect(() => {
    const handler = (path: string) => {
      fetch(`${API_BASE}/pdf/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: path }),
      })
        .then((res) => res.json())
        .then((data) => store.addDoc(data))
        .catch((err) => alert('Error: ' + err.message))
    }
    window.api.onOpenFile(handler)
    return () => { window.api.removeOpenFileListener() }
  }, [])

  return { isDraggingFile, handleDragOver, handleDragLeave, handleDrop }
}
