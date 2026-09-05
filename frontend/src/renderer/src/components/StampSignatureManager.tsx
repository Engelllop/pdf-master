import { useState } from 'react'
import { Plus, Trash2, Stamp as StampIcon, Signature as SignatureIcon, Check } from 'lucide-react'
import {
  DialogShell, DialogHeader, EmptyState, btnPrimary, fieldInput, iconBtn, iconBtnDanger, nativeAccent,
} from './panelUi'
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

  const colocarSello = (label: string, c: string) => {
    setSelectedStamp(label)
    setStampColor(c)
    setActiveTool('stamp')
    onClose()
    showToast('Haz clic en el documento para colocar el sello', 'info')
  }

  const colocarFirma = (sig: SavedSignature) => {
    window.dispatchEvent(new CustomEvent('app:place-signature', { detail: { id: sig.id } }))
    onClose()
    showToast(`Haz clic para colocar la firma «${sig.name}»`, 'info')
  }

  const tabBtn = (id: typeof tab, label: string, Icon: typeof StampIcon) => (
    <button onClick={() => setTab(id)} aria-pressed={tab === id}
      className={`flex items-center gap-1.5 h-8 px-3 text-mini rounded-token-sm transition-colors duration-fast ease-token ${
        tab === id ? 'bg-selected text-fg' : 'text-muted hover:bg-hover hover:text-fg'
      }`}>
      <Icon size={14} /> {label}
    </button>
  )

  const filaCls = 'group flex items-center gap-2 px-2 h-9 rounded-token-sm border border-border'
  const revelar = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  return (
    <DialogShell label="Sellos y firmas" zClass="z-sheet"
      panelClass="w-[520px] max-h-[84vh] flex flex-col" onClose={onClose}>
      <DialogHeader icon={StampIcon} title="Sellos y firmas" onClose={onClose} />

      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
        {tabBtn('stamps', 'Sellos', StampIcon)}
        {tabBtn('signatures', 'Firmas', SignatureIcon)}
      </div>

      {tab === 'stamps' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-muted mb-1.5">De fábrica</p>
            <div className="flex flex-wrap gap-1.5">
              {BUILTIN_STAMPS.map((s) => (
                <button key={s} onClick={() => colocarSello(s, '#22c55e')}
                  className="h-8 px-2.5 rounded-token-sm border border-border text-mini text-fg hover:bg-hover transition-colors duration-fast ease-token">
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-micro font-semibold uppercase tracking-wider text-muted mb-1.5">Mis sellos</p>
            {stamps.length === 0
              ? <p className="text-mini text-muted">Aún no has creado ninguno. Escribí el texto abajo.</p>
              : (
                <div className="space-y-1">
                  {stamps.map((s) => (
                    <div key={s.id} className={filaCls}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <button onClick={() => colocarSello(renderStampText(s, annotationAuthor), s.color)}
                        className="flex-1 min-w-0 self-stretch text-left text-mini text-fg truncate">
                        {renderStampText(s, annotationAuthor)}
                      </button>
                      <button onClick={() => { removeStamp(s.id); setStamps(loadStamps()) }} aria-label="Eliminar sello"
                        className={`${iconBtnDanger} ${revelar}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-micro font-semibold uppercase tracking-wider text-muted">Nuevo sello</p>
            <div className="flex items-center gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto del sello"
                onKeyDown={(e) => { if (e.key === 'Enter') create() }}
                className={`${fieldInput} flex-1 min-w-0`} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                title="Color del sello" aria-label="Color del sello"
                className="w-8 h-8 rounded-token-sm cursor-pointer border border-border-control p-0 bg-transparent shrink-0" />
              <button onClick={create} disabled={!text.trim()} className={btnPrimary}>
                <Plus size={14} /> Crear
              </button>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-mini text-muted cursor-pointer">
                <input type="checkbox" checked={withDate} onChange={(e) => setWithDate(e.target.checked)}
                  className="w-3.5 h-3.5" style={nativeAccent} />
                Añadir fecha
              </label>
              <label className="flex items-center gap-1.5 text-mini text-muted cursor-pointer">
                <input type="checkbox" checked={withAuthor} onChange={(e) => setWithAuthor(e.target.checked)}
                  className="w-3.5 h-3.5" style={nativeAccent} />
                Añadir mi nombre
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1 flex flex-col">
          {signatures.length === 0
            ? (
              <EmptyState icon={SignatureIcon}>
                No hay firmas guardadas. Dibujá una con la herramienta Firma y ponele nombre al terminar.
              </EmptyState>
            )
            : signatures.map((sig) => (
              <div key={sig.id} className={`${filaCls} shrink-0`}>
                <SignaturePreview sig={sig} />
                {/* El nombre se edita en el sitio; sin borde en reposo no se veía que
                    fuera un campo, y el `border-b` que aparecía al enfocar movía la fila. */}
                <input defaultValue={sig.name} aria-label="Nombre de la firma"
                  onBlur={(e) => { renameSignature(sig.id, e.target.value.trim() || sig.name); setSignatures(loadSignatures()) }}
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded-token-sm bg-transparent border border-transparent text-mini text-fg transition-colors duration-fast ease-token hover:border-border-control focus:outline-none focus:border-fg" />
                <button onClick={() => colocarFirma(sig)} title="Colocar en el documento" aria-label="Colocar en el documento"
                  className={iconBtn}><Check size={14} /></button>
                <button onClick={() => { removeSignature(sig.id); setSignatures(loadSignatures()) }} aria-label="Eliminar firma"
                  className={`${iconBtnDanger} ${revelar}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      )}
    </DialogShell>
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
