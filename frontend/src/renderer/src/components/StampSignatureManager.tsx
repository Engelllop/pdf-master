import { useState } from 'react'
import { X, Plus, Trash2, Stamp as StampIcon, Signature as SignatureIcon, Check } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import {
  loadStamps, addStamp, removeStamp, renderStampText, BUILTIN_STAMPS, type CustomStamp,
} from '../lib/stamps'
import { loadSignatures, renameSignature, removeSignature, type SavedSignature } from '../lib/signatures'

/** Gestor de sellos y firmas: los sellos eran 7 fijos en un desplegable y las firmas
 * se guardaban sin que hubiera forma de reutilizarlas ni borrarlas. */
export default function StampSignatureManager({ onClose }: { onClose: () => void }) {
  const { setSelectedStamp, setStampColor, setActiveTool, showToast, annotationAuthor } = useStoreSlice(
    'setSelectedStamp', 'setStampColor', 'setActiveTool', 'showToast', 'annotationAuthor',
  )
  const [tab, setTab] = useState<'stamps' | 'signatures'>('stamps')
  const [stamps, setStamps] = useState<CustomStamp[]>(() => loadStamps())
  const [signatures, setSignatures] = useState<SavedSignature[]>(() => loadSignatures())
  const [text, setText] = useState('')
  const [color, setColor] = useState('#22c55e')
  const [withDate, setWithDate] = useState(false)
  const [withAuthor, setWithAuthor] = useState(false)

  const create = () => {
    const t = text.trim().toUpperCase()
    if (!t) return
    setStamps([...stamps, addStamp({ text: t, color, withDate, withAuthor })])
    setText('')
  }

  const useStamp = (label: string, c: string) => {
    setSelectedStamp(label)
    setStampColor(c)
    setActiveTool('stamp')
    onClose()
    showToast('Haz clic en el documento para colocar el sello', 'info')
  }

  const useSignature = (sig: SavedSignature) => {
    window.dispatchEvent(new CustomEvent('app:place-signature', { detail: { id: sig.id } }))
    onClose()
    showToast(`Haz clic para colocar la firma «${sig.name}»`, 'info')
  }

  const tabBtn = (id: typeof tab, label: string, Icon: typeof StampIcon) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-mini rounded transition-colors ${
        tab === id ? 'bg-accent text-toolbar' : 'text-muted hover:bg-hover hover:text-fg'
      }`}>
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <div className="overlay-in fixed inset-0 z-[93] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Sellos y firmas" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="panel-in w-[520px] max-w-[92vw] max-h-[84vh] flex flex-col rounded-lg border border-border shadow-2xl bg-panel text-fg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold flex-1">Sellos y firmas</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
        </div>

        <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
          {tabBtn('stamps', 'Sellos', StampIcon)}
          {tabBtn('signatures', 'Firmas', SignatureIcon)}
        </div>

        {tab === 'stamps' ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <p className="text-micro uppercase tracking-wider text-muted mb-1.5">De fábrica</p>
              <div className="flex flex-wrap gap-1.5">
                {BUILTIN_STAMPS.map((s) => (
                  <button key={s} onClick={() => useStamp(s, '#22c55e')}
                    className="px-2.5 py-1 rounded border border-border text-micro text-fg hover:bg-hover transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-micro uppercase tracking-wider text-muted mb-1.5">Mis sellos</p>
              {stamps.length === 0 && <p className="text-micro text-muted">Aún no has creado ninguno.</p>}
              <div className="space-y-1">
                {stamps.map((s) => (
                  <div key={s.id} className="group flex items-center gap-2 px-2 py-1.5 rounded border border-border">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <button onClick={() => useStamp(renderStampText(s, annotationAuthor), s.color)}
                      className="flex-1 min-w-0 text-left text-mini text-fg truncate">
                      {renderStampText(s, annotationAuthor)}
                    </button>
                    <button onClick={() => { removeStamp(s.id); setStamps(loadStamps()) }} aria-label="Eliminar sello"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger transition-opacity">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-micro uppercase tracking-wider text-muted">Nuevo sello</p>
              <div className="flex items-center gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto del sello"
                  onKeyDown={(e) => { if (e.key === 'Enter') create() }}
                  className="flex-1 min-w-0 border border-border rounded px-2 py-1.5 text-mini bg-surface text-fg placeholder:text-muted focus:outline-none focus:border-accent" />
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Color"
                  className="w-8 h-8 rounded cursor-pointer border border-border p-0 bg-transparent shrink-0" />
                <button onClick={create} disabled={!text.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-mini bg-fg text-toolbar disabled:opacity-40 hover:opacity-90 transition-opacity">
                  <Plus size={13} /> Crear
                </button>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-micro text-muted cursor-pointer">
                  <input type="checkbox" checked={withDate} onChange={(e) => setWithDate(e.target.checked)}
                    className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                  Añadir fecha
                </label>
                <label className="flex items-center gap-1.5 text-micro text-muted cursor-pointer">
                  <input type="checkbox" checked={withAuthor} onChange={(e) => setWithAuthor(e.target.checked)}
                    className="w-3.5 h-3.5" style={{ accentColor: 'rgb(var(--accent))' }} />
                  Añadir mi nombre
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {signatures.length === 0 && (
              <p className="text-micro text-muted">
                No hay firmas guardadas. Dibuja una con la herramienta Firma y ponle nombre al terminar.
              </p>
            )}
            {signatures.map((sig) => (
              <div key={sig.id} className="group flex items-center gap-2 px-2 py-1.5 rounded border border-border">
                <SignaturePreview sig={sig} />
                <input defaultValue={sig.name}
                  onBlur={(e) => { renameSignature(sig.id, e.target.value.trim() || sig.name); setSignatures(loadSignatures()) }}
                  className="flex-1 min-w-0 bg-transparent text-mini text-fg focus:outline-none focus:border-b focus:border-accent" />
                <button onClick={() => useSignature(sig)} title="Colocar en el documento"
                  className="p-1 rounded text-muted hover:text-accent hover:bg-hover transition-colors"><Check size={14} /></button>
                <button onClick={() => { removeSignature(sig.id); setSignatures(loadSignatures()) }} aria-label="Eliminar firma"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger transition-opacity">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Miniatura de la firma dibujada, normalizada a la caja del preview. */
function SignaturePreview({ sig }: { sig: SavedSignature }) {
  const xs = sig.points.map((p) => p.x)
  const ys = sig.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(1, Math.max(...xs) - minX)
  const h = Math.max(1, Math.max(...ys) - minY)
  const d = sig.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX} ${p.y - minY}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-16 h-8 shrink-0" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={Math.max(1, w / 90)} className="text-fg" />
    </svg>
  )
}
