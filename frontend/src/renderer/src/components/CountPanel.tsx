import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquarePlus, Trash2 } from 'lucide-react'
import { type PdfDoc, type Annotation } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { countNumbers } from '../lib/counts'

function inkOnTint(hex: string): 'text-black' | 'text-white' {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return 'text-black'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.55 ? 'text-black' : 'text-white'
}

/** Inventario de las marcas de conteo: totales por categoría, dónde está cada una
 * y un comentario por marca. Contar sin poder revisar después el listado obligaba
 * a ir página por página buscando los puntos. */
export default function CountPanel({ activeDoc }: { activeDoc: PdfDoc }) {
  const { setPage, selectAnnotation, deleteAnnotation, updateAnnotation, annotationAuthor, setCountCategory } = useStoreSlice(
    'setPage', 'selectAnnotation', 'deleteAnnotation', 'updateAnnotation', 'annotationAuthor', 'setCountCategory',
  )
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const { groups, numbers, total } = useMemo(() => {
    const counts = activeDoc.annotations.filter((a) => a.type === 'count')
    const numbers = countNumbers(counts)
    const groups = new Map<string, Annotation[]>()
    for (const a of counts) {
      const cat = a.text || 'General'
      const list = groups.get(cat)
      if (list) list.push(a)
      else groups.set(cat, [a])
    }
    for (const list of groups.values()) list.sort((x, y) => (numbers.get(x.id) || 0) - (numbers.get(y.id) || 0))
    return { groups, numbers, total: counts.length }
  }, [activeDoc.annotations])

  const goTo = (a: Annotation) => {
    setPage(activeDoc.doc_id, a.page)
    selectAnnotation(activeDoc.doc_id, a.id)
  }

  const comment = (a: Annotation) => a.replies?.[0]?.text || ''

  const saveComment = (a: Annotation) => {
    const text = draft.trim()
    const rest = (a.replies || []).slice(1)
    updateAnnotation(activeDoc.doc_id, a.id, {
      replies: text
        ? [{ id: a.replies?.[0]?.id || crypto.randomUUID(), author: annotationAuthor || undefined, at: Date.now(), text }, ...rest]
        : rest,
    })
    setEditing(null)
    setDraft('')
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-mini text-center text-muted">
          Sin marcas de conteo.<br />Elegí la herramienta <b className="text-fg">Conteo</b> y hacé clic sobre cada elemento: se numeran solas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-base">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-mini text-muted">{groups.size} categoría(s)</span>
        <span className="text-mini font-semibold text-fg tabular-nums">{total} marcas</span>
      </div>
      {[...groups.entries()].map(([cat, list]) => {
        const isOpen = open[cat] ?? true
        const color = list[0]?.color || '#fbbf24'
        return (
          <div key={cat} className="border-b border-border">
            <div className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-hover">
              <button onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))} className="text-muted shrink-0" aria-label="Desplegar">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <button onClick={() => setCountCategory(cat)} title="Seguir contando en esta categoría"
                className="flex-1 text-left text-mini text-fg truncate">{cat}</button>
              <span className="text-mini font-semibold text-fg tabular-nums shrink-0">{list.length}</span>
            </div>
            {isOpen && list.map((a) => (
              <div key={a.id} className="pl-8 pr-2 py-1 hover:bg-hover group">
                <div className="flex items-center gap-2">
                  <button onClick={() => goTo(a)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                    <span className={`w-5 h-5 rounded-full text-micro flex items-center justify-center shrink-0 tabular-nums ${inkOnTint(a.color || '#fbbf24')}`}
                      style={{ background: a.color || '#fbbf24' }}>{numbers.get(a.id)}</span>
                    <span className="text-micro text-muted shrink-0">Pág. {a.page + 1}</span>
                    <span className="text-micro text-fg truncate">{comment(a)}</span>
                  </button>
                  <button onClick={() => { setEditing(a.id); setDraft(comment(a)) }} title="Comentar"
                    className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 hover:text-fg hover:bg-active">
                    <MessageSquarePlus size={13} />
                  </button>
                  <button onClick={() => deleteAnnotation(activeDoc.doc_id, a.id)} title="Eliminar marca"
                    className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-active">
                    <Trash2 size={13} />
                  </button>
                </div>
                {editing === a.id && (
                  <div className="flex gap-1 mt-1">
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveComment(a); if (e.key === 'Escape') setEditing(null) }}
                      onBlur={() => saveComment(a)}
                      placeholder="Comentario…"
                      className="flex-1 px-2 py-1 text-micro rounded border border-border bg-surface text-fg focus:outline-none focus:border-accent" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
