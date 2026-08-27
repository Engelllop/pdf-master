import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquarePlus, Palette, Pencil, Trash2, Tally5 } from 'lucide-react'
import { type PdfDoc, type Annotation } from '../store/usePdfStore'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { askConfirm } from '../lib/uiPrompt'
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
  const {
    setPage, selectAnnotation, deleteAnnotation, deleteAnnotations, updateAnnotationUndoable,
    updateAnnotationsUndoable, annotationAuthor, countCategory, setCountCategory, showToast,
  } = useStoreSlice(
    'setPage', 'selectAnnotation', 'deleteAnnotation', 'deleteAnnotations', 'updateAnnotationUndoable',
    'updateAnnotationsUndoable', 'annotationAuthor', 'countCategory', 'setCountCategory', 'showToast',
  )
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Renombrar la categoría: la categoría vive en el `text` de cada conteo, así que con
  // 200 piezas contadas y un nombre mal escrito la única salida era borrarlas y volver
  // a contar. Se cambian todas de una vez y en UN paso de deshacer.
  const [renombrando, setRenombrando] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')

  // Recolorear y borrar la categoría completa, por lo mismo que el renombrado: con 200
  // piezas contadas, hacerlo marca por marca no es una opción. El selector de color
  // dispara un evento por píxel de arrastre y el store los fusiona en un paso.
  const recolorear = (marcas: Annotation[], color: string) => {
    updateAnnotationsUndoable(activeDoc.doc_id, marcas.map((a) => a.id), { color })
  }

  const borrarCategoria = async (cat: string, marcas: Annotation[]) => {
    const ok = await askConfirm(
      `Eliminar «${cat}»`,
      `Se eliminan ${marcas.length} marca(s) de conteo de esta categoría.

Ctrl+Z lo deshace.`,
      'Eliminar',
    )
    if (!ok) return
    deleteAnnotations(activeDoc.doc_id, marcas.map((a) => a.id))
    showToast(`${marcas.length} conteo(s) de «${cat}» eliminados. Ctrl+Z deshace.`, 'success')
  }

  const renombrar = (cat: string, marcas: Annotation[]) => {
    const nuevo = nombreNuevo.trim()
    setRenombrando(null)
    if (!nuevo || nuevo === cat) return
    updateAnnotationsUndoable(activeDoc.doc_id, marcas.map((a) => a.id), { text: nuevo })
    // La categoría activa (con la que se siguen colocando conteos) sigue al nombre.
    if (countCategory === cat) setCountCategory(nuevo)
    showToast(
      `${marcas.length} conteo(s) de «${cat}» ahora son «${nuevo}». Ctrl+Z deshace.`,
      'success',
    )
  }

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
    updateAnnotationUndoable(activeDoc.doc_id, a.id, {
      replies: text
        ? [{ id: a.replies?.[0]?.id || crypto.randomUUID(), author: annotationAuthor || undefined, at: Date.now(), text }, ...rest]
        : rest,
    })
    setEditing(null)
    setDraft('')
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Tally5 size={18} className="text-muted" />
        <p className="text-mini text-muted">
          Sin marcas de conteo.<br />Elegí la herramienta <b className="text-fg">Conteo</b> y hacé clic sobre cada elemento: se numeran solas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto text-base">
      <div className="sticky top-0 z-raised bg-panel/95 backdrop-blur-[2px] px-3 py-2 border-b border-border flex items-baseline justify-between">
        <span className="text-micro font-semibold uppercase tracking-wider text-muted">
          {groups.size} categoría(s)
        </span>
        <span className="text-mini font-semibold text-fg tabular">{total} marcas</span>
      </div>
      {[...groups.entries()].map(([cat, list]) => {
        const isOpen = open[cat] ?? true
        const color = list[0]?.color || '#fbbf24'
        return (
          <div key={cat} className="border-b border-border">
            <div className={`group/cat sticky top-[37px] z-raised w-full flex items-center gap-2 px-2 py-1.5 backdrop-blur-[2px] transition-colors duration-fast ease-token ${
              countCategory === cat ? 'bg-accent/10 hover:bg-accent/15' : 'bg-panel/95 hover:bg-hover'
            }`}>
              <button onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))} className="text-muted shrink-0" aria-label={`${isOpen ? 'Contraer' : 'Desplegar'} la categoría ${cat}`}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {renombrando === cat ? (
                <input autoFocus value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renombrar(cat, list)
                    if (e.key === 'Escape') setRenombrando(null)
                  }}
                  onBlur={() => renombrar(cat, list)}
                  aria-label={`Nuevo nombre para la categoría ${cat}`}
                  className="flex-1 px-2 py-0.5 text-mini rounded-token-sm border border-border bg-surface text-fg focus:outline-none focus:border-accent" />
              ) : (
                <>
                  <button onClick={() => setCountCategory(cat)}
                    title={countCategory === cat
                      ? 'Los conteos nuevos caen en esta categoría'
                      : 'Seguir contando en esta categoría'}
                    aria-current={countCategory === cat}
                    className={`flex-1 text-left text-mini truncate ${
                      countCategory === cat ? 'text-fg font-medium' : 'text-fg'
                    }`}>
                    {cat}
                    {countCategory === cat && (
                      <span className="ml-1.5 text-micro font-normal text-accent">· contando</span>
                    )}
                  </button>
                  <button onClick={() => { setRenombrando(cat); setNombreNuevo(cat) }}
                    title="Renombrar la categoría" aria-label={`Renombrar la categoría ${cat}`}
                    className="p-1 rounded-token-sm text-muted opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 hover:text-fg hover:bg-hover">
                    <Pencil size={12} />
                  </button>
                  <label className="p-1 rounded-token-sm text-muted opacity-0 group-hover/cat:opacity-100 focus-within:opacity-100 hover:text-fg hover:bg-hover cursor-pointer"
                    title="Color de toda la categoría">
                    <Palette size={12} />
                    <input type="color" value={color}
                      onChange={(e) => recolorear(list, e.target.value)}
                      aria-label={`Color de la categoría ${cat}`}
                      className="sr-only" />
                  </label>
                  <button onClick={() => { void borrarCategoria(cat, list) }}
                    title="Eliminar toda la categoría" aria-label={`Eliminar la categoría ${cat}`}
                    className="p-1 rounded-token-sm text-muted opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 hover:text-danger hover:bg-hover">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
              <span className="text-mini font-semibold text-fg tabular shrink-0">{list.length}</span>
            </div>
            {isOpen && list.map((a) => (
              <div key={a.id} className="pl-8 pr-2 py-1 hover:bg-hover group">
                <div className="flex items-center gap-2">
                  <button onClick={() => goTo(a)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                    <span className={`w-5 h-5 rounded-full text-micro flex items-center justify-center shrink-0 tabular ${inkOnTint(a.color || '#fbbf24')}`}
                      style={{ background: a.color || '#fbbf24' }}>{numbers.get(a.id)}</span>
                    <span className="text-micro text-muted shrink-0">Pág. {a.page + 1}</span>
                    <span className="text-micro text-fg truncate">{comment(a)}</span>
                  </button>
                  <button onClick={() => { setEditing(a.id); setDraft(comment(a)) }} title="Comentar" aria-label="Comentar esta marca"
                    className="p-1 rounded-token-sm text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg hover:bg-hover">
                    <MessageSquarePlus size={14} />
                  </button>
                  <button onClick={() => deleteAnnotation(activeDoc.doc_id, a.id)} title="Eliminar marca" aria-label="Eliminar esta marca de conteo"
                    className="p-1 rounded-token-sm text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger hover:bg-hover">
                    <Trash2 size={14} />
                  </button>
                </div>
                {editing === a.id && (
                  <div className="flex gap-1 mt-1">
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveComment(a); if (e.key === 'Escape') setEditing(null) }}
                      onBlur={() => saveComment(a)}
                      placeholder="Comentario…"
                      className="flex-1 px-2 py-1 text-micro rounded-token-sm border border-border bg-surface text-fg focus:outline-none focus:border-accent" />
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
