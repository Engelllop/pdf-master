import { useEffect, useRef, useState } from 'react'
import { X, Printer } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { pushAnnotations } from '../lib/saveDocument'
import { expandPageRanges, parsePageRanges } from '../lib/pageRange'
import { esApaisado } from '../lib/printOrientation'

interface PrintDialogProps {
  docId: string
  pageCount: number
  currentPage: number
  onClose: () => void
}

export default function PrintDialog({ docId, pageCount, currentPage, onClose }: PrintDialogProps) {
  const { showToast, docs } = useStoreSlice('showToast', 'docs')
  const doc = docs.find((d) => d.doc_id === docId)
  // Marcas que están en una capa apagada: se ven en el archivo pero no en pantalla, así
  // que imprimirlas sin avisar sorprende. Por omisión se imprime lo que se ve.
  const ocultas = (doc?.hiddenLayers || [])
  const marcasOcultas = ocultas.length
    ? doc!.annotations.filter((a) => ocultas.includes(a.layer || 'Marcas')).length
    : 0
  const [omitirOcultas, setOmitirOcultas] = useState(true)
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
    // Las páginas que van al papel, para decidir la orientación con ELLAS y no con todo
    // el documento: extraer las dos láminas apaisadas de un informe vertical tiene que
    // salir apaisado.
    const paginas = mode === 'all' ? undefined
      : mode === 'current' ? [currentPage]
      : expandPageRanges(parsePageRanges(pageRanges || '', pageCount) || [])
    setPrinting(true)
    try {
      // Las marcas viven en el store hasta que se guarda; sin subirlas al motor la
      // impresión salía sin ellas (y sin avisar).
      await pushAnnotations(docId, { excluirCapasOcultas: marcasOcultas > 0 && omitirOcultas })
      const res = await window.api.printPdf(docId, {
        pageRanges, copies,
        landscape: esApaisado(doc?.page_sizes || [], paginas),
      })
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
    <div className="overlay-in fixed inset-0 z-dialog flex items-center justify-center bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Imprimir" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
        className="panel-in w-[360px] max-w-[92vw] rounded-token border shadow-token-lg bg-panel border-border text-fg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Printer size={18} className="text-fg" />
          <h2 className="text-base font-semibold flex-1">Imprimir</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1 rounded-token-sm transition-colors hover:bg-hover text-muted">
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
                className="flex-1 border border-border rounded-token-sm px-2 py-1 text-base bg-panel text-fg focus:outline-none focus:border-accent" />
            </div>
          </div>

          {marcasOcultas > 0 && (
            <label className="flex items-start gap-2 text-mini cursor-pointer text-fg">
              <input type="checkbox" checked={omitirOcultas}
                onChange={(e) => setOmitirOcultas(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
              <span>
                No imprimir las capas apagadas
                <span className="text-muted"> ({marcasOcultas} marca(s) oculta(s) en pantalla)</span>
              </span>
            </label>
          )}

          <div className="flex items-center gap-2 text-base">
            <span className="text-muted">Copias</span>
            <input type="number" min={1} max={99} value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border border-border rounded-token-sm px-2 py-1 text-center bg-panel text-fg focus:outline-none focus:border-accent" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-base rounded-token-sm text-fg hover:bg-hover transition-colors">Cancelar</button>
          <button onClick={handlePrint} disabled={printing}
            className="px-4 py-1.5 text-base rounded-token-sm bg-accent text-on-accent hover:brightness-110 active:brightness-95 transition-[filter] duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Printer size={14} /> {printing ? 'Imprimiendo…' : 'Imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}
