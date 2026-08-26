import { useEffect, useRef, useState } from 'react'
import { X, Printer } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { pushAnnotations } from '../lib/saveDocument'
import { parsePageRanges } from '../lib/pageRange'

interface PrintDialogProps {
  docId: string
  pageCount: number
  currentPage: number
  onClose: () => void
}

export default function PrintDialog({ docId, pageCount, currentPage, onClose }: PrintDialogProps) {
  const { showToast } = useStoreSlice('showToast')
  const [mode, setMode] = useState<'all' | 'current' | 'range'>('all')
  const [range, setRange] = useState('')
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    const pageRanges =
      mode === 'all' ? undefined
      : mode === 'current' ? `${currentPage + 1}`
      : range.trim()
    if (mode === 'range') {
      if (!pageRanges) { showToast('Indica un rango de páginas', 'info'); return }
      if (!parsePageRanges(pageRanges, pageCount)) {
        showToast(`Rango inválido. Usá números entre 1 y ${pageCount}, por ejemplo «1-5, 8»`, 'error')
        return
      }
    }
    setPrinting(true)
    try {
      // Las marcas viven en el store hasta que se guarda; sin subirlas al motor la
      // impresión salía sin ellas (y sin avisar).
      await pushAnnotations(docId)
      const res = await window.api.printPdf(docId, { pageRanges, copies })
      if (res?.success) { showToast('Enviado a la impresora', 'success'); onClose() }
      else if (res?.reason === 'cancelled') onClose()
      else showToast('No se pudo imprimir', 'error')
    } catch {
      showToast('No se pudo imprimir', 'error')
    } finally {
      setPrinting(false)
    }
  }

  // El diálogo no tomaba el foco al abrirse: su Escape (onKeyDown del contenedor) no
  // hacía nada hasta que el usuario clicara dentro.
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { dialogRef.current?.focus() }, [])

  const radio = (val: typeof mode, label: string) => (
    <label className="flex items-center gap-2 text-base cursor-pointer text-fg">
      <input type="radio" name="print-mode" checked={mode === val} onChange={() => setMode(val)} />
      {label}
    </label>
  )

  return (
    <div className="overlay-in fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Imprimir" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
        className="panel-in w-[360px] max-w-[92vw] rounded-lg border shadow-2xl bg-panel border-border text-fg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Printer size={18} className="text-fg" />
          <h2 className="text-base font-semibold flex-1">Imprimir</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1 rounded transition-colors hover:bg-hover text-muted">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="space-y-2">
            {radio('all', `Todo el documento (${pageCount} pág.)`)}
            {radio('current', `Página actual (${currentPage + 1})`)}
            <div className="flex items-center gap-2">
              {radio('range', 'Rango:')}
              <input type="text" value={range} placeholder="ej. 1-5, 8"
                onChange={(e) => { setRange(e.target.value); setMode('range') }}
                className="flex-1 border border-border rounded px-2 py-1 text-base bg-panel text-fg focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-base">
            <span className="text-muted">Copias</span>
            <input type="number" min={1} max={99} value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border border-border rounded px-2 py-1 text-center bg-panel text-fg focus:outline-none focus:border-accent" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-base rounded text-fg hover:bg-hover transition-colors">Cancelar</button>
          <button onClick={handlePrint} disabled={printing}
            className="px-4 py-1.5 text-base rounded bg-fg text-toolbar hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
            <Printer size={14} /> {printing ? 'Imprimiendo…' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}
