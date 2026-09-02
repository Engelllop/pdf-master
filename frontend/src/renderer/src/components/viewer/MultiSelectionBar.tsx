import { useRef } from 'react'
import { Copy, Trash2, Check, X } from 'lucide-react'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { COLORS } from '../PropertiesBar'

/** Acciones sobre varias marcas a la vez. Flota abajo del visor (no junto a una
 * marca concreta, porque la selección puede estar repartida por toda la página). */
export default function MultiSelectionBar({ docId, ids }: { docId: string; ids: string[] }) {
  const {
    updateAnnotationsUndoable, deleteAnnotations, copyAnnotations, pasteAnnotations,
    selectAnnotation, showToast, docs,
  } = useStoreSlice(
    'updateAnnotationsUndoable', 'deleteAnnotations', 'copyAnnotations', 'pasteAnnotations',
    'selectAnnotation', 'showToast', 'docs',
  )
  const colorRef = useRef<HTMLInputElement>(null)
  const doc = docs.find((d) => d.doc_id === docId)
  const resolvedAll = !!doc && ids.every((id) => doc.annotations.find((a) => a.id === id)?.status === 'resolved')

  const duplicate = () => {
    copyAnnotations(docId, ids)
    const n = pasteAnnotations(docId, doc?.currentPage ?? 0)
    if (n > 0) showToast(`${n} marca(s) duplicada(s)`, 'success')
  }

  const btn = 'flex items-center gap-1 px-2 py-1 rounded-token-sm text-micro text-fg hover:bg-hover transition-colors'

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-sticky flex items-center gap-1 px-2 py-1.5 rounded-token-lg border border-border bg-panel shadow-token-md">
      <span className="text-micro text-muted px-1 tabular">{ids.length} seleccionadas</span>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button title="Color" onClick={() => colorRef.current?.click()}
        className="relative w-5 h-5 rounded-full border-2 border-border hover:scale-105 active:scale-100 transition-transform duration-fast ease-token"
        style={{ background: `linear-gradient(135deg,${COLORS[0]},${COLORS[1]},${COLORS[2]})` }}>
        <input ref={colorRef} type="color" onChange={(e) => updateAnnotationsUndoable(docId, ids, { color: e.target.value })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </button>
      <button className={btn} onClick={() => updateAnnotationsUndoable(docId, ids, { status: resolvedAll ? 'open' : 'resolved' })}>
        <Check size={14} /> {resolvedAll ? 'Reabrir' : 'Resolver'}
      </button>
      <button className={btn} onClick={duplicate}><Copy size={14} /> Duplicar</button>
      <button className={`${btn} hover:text-danger`} onClick={() => deleteAnnotations(docId, ids)}>
        <Trash2 size={14} /> Eliminar
      </button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button title="Quitar selección (Esc)" aria-label="Quitar selección"
        className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors"
        onClick={() => selectAnnotation(docId, null)}>
        <X size={14} />
      </button>
    </div>
  )
}
