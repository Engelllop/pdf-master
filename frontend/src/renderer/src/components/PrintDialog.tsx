import { useState } from 'react'
import { Printer } from 'lucide-react'
import {
  DialogShell, DialogHeader, DialogFooter, btnPrimary, btnGhost, fieldInput, nativeAccent,
} from './panelUi'
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

  const radio = (val: typeof mode, label: string) => (
    <label className="flex items-center gap-2 text-base cursor-pointer text-fg">
      <input type="radio" name="print-mode" checked={mode === val} onChange={() => setMode(val)}
        style={nativeAccent} />
      {label}
    </label>
  )

  return (
    // Mientras se manda a la impresora el diálogo no se descarta: cerrarlo a medias
    // dejaba el trabajo en marcha y sin nada en pantalla que lo dijera.
    <DialogShell label="Imprimir" panelClass="w-[360px]" dismissible={!printing} onClose={onClose}>
      <DialogHeader icon={Printer} title="Imprimir" onClose={onClose} />

      <div className="px-4 py-4 space-y-3">
        <div role="radiogroup" aria-label="Páginas" className="space-y-2">
          {radio('all', `Todo el documento (${pageCount} pág.)`)}
          {radio('current', `Página actual (${currentPage + 1})`)}
          <div className="flex items-center gap-2">
            {radio('range', 'Rango:')}
            <input type="text" value={range} placeholder="ej. 1-5, 8"
              onChange={(e) => { setRange(e.target.value); setMode('range') }}
              className={`${fieldInput} flex-1 min-w-0`} />
          </div>
        </div>

        {marcasOcultas > 0 && (
          <label className="flex items-start gap-2 text-mini cursor-pointer text-fg">
            <input type="checkbox" checked={omitirOcultas}
              onChange={(e) => setOmitirOcultas(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5" style={nativeAccent} />
            <span>
              No imprimir las capas apagadas
              <span className="text-muted"> ({marcasOcultas} marca(s) oculta(s) en pantalla)</span>
            </span>
          </label>
        )}

        <div className="flex items-center gap-2 text-base">
          <span className="text-muted">Copias</span>
          <input type="number" min={1} max={99} value={copies}
            onChange={(e) => setCopies(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
            className={`${fieldInput} w-16 text-center`} />
        </div>
      </div>

      <DialogFooter>
        <button onClick={onClose} disabled={printing} className={btnGhost}>Cancelar</button>
        <button onClick={handlePrint} disabled={printing} className={btnPrimary}>
          <Printer size={14} /> {printing ? 'Imprimiendo…' : 'Imprimir'}
        </button>
      </DialogFooter>
    </DialogShell>
  )
}
