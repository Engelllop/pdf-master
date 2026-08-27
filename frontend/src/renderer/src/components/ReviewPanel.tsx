import { useMemo, useState } from 'react'
import {
  Check, ChevronDown, ChevronRight, Eye, EyeOff, Layers, MessageSquare, Search, Trash2, X, FileDown, Send,
} from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { type Annotation, type PdfDoc } from '../store/usePdfStore'
import { annotationLabel } from '../lib/tools'
import { askForm } from '../lib/uiPrompt'
import { formatWhen, formatDateTime } from '../lib/format'

type StatusFilter = 'all' | 'open' | 'resolved'

/** Panel de revisión: la lista plana de anotaciones no escalaba con 200 marcas.
 * Agrupa por página y filtra por texto, tipo, autor y estado; permite resolver y
 * responder sin salir del panel. */
export default function ReviewPanel({ activeDoc }: { activeDoc: PdfDoc }) {
  const {
    setPage, selectAnnotation, deleteAnnotation, setAnnotationStatus, addReply, deleteReply,
    selectedAnnotationId, annotationAuthor, updateAnnotationsUndoable, showToast,
    toggleLayerVisible, docs,
  } = useStoreSlice(
    'setPage', 'selectAnnotation', 'deleteAnnotation', 'setAnnotationStatus', 'addReply', 'deleteReply',
    'selectedAnnotationId', 'annotationAuthor', 'updateAnnotationsUndoable', 'showToast',
    'toggleLayerVisible', 'docs',
  )
  // Las capas apagadas se leen del store, no de la prop `activeDoc`: el estado de vista
  // cambia con el propio panel y depender de que el padre reenvíe un doc fresco dejaba
  // los botones desfasados un render.
  const capasOcultas = docs.find((d) => d.doc_id === activeDoc.doc_id)?.hiddenLayers || []

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [authorFilter, setAuthorFilter] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [onlyThisPage, setOnlyThisPage] = useState(false)
  const [layerFilter, setLayerFilter] = useState('all')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const anns = activeDoc.annotations
  const types = useMemo(() => [...new Set(anns.map((a) => a.type))].sort(), [anns])
  const authors = useMemo(
    () => [...new Set(anns.map((a) => a.author).filter((a): a is string => !!a))].sort(),
    [anns],
  )
  const layers = useMemo(
    () => [...new Set(anns.map((a) => a.layer || 'Marcas'))].sort(),
    [anns],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return anns.filter((a) => {
      if (onlyThisPage && a.page !== activeDoc.currentPage) return false
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (authorFilter !== 'all' && (a.author || '') !== authorFilter) return false
      if (layerFilter !== 'all' && (a.layer || 'Marcas') !== layerFilter) return false
      if (status === 'open' && a.status === 'resolved') return false
      if (status === 'resolved' && a.status !== 'resolved') return false
      if (!q) return true
      const haystack = [
        a.text || '', annotationLabel(a.type), a.author || '', a.layer || '', a.measurement?.label || '',
        ...(a.replies || []).map((r) => r.text),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [anns, query, typeFilter, authorFilter, layerFilter, status, onlyThisPage, activeDoc.currentPage])

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const a of filtered) {
      const list = map.get(a.page)
      if (list) list.push(a)
      else map.set(a.page, [a])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [filtered])

  const togglePage = (page: number) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(page)) next.delete(page)
    else next.add(page)
    return next
  })

  const goTo = (ann: Annotation) => {
    setPage(activeDoc.doc_id, ann.page)
    selectAnnotation(activeDoc.doc_id, ann.id)
  }

  const sendReply = (annId: string) => {
    addReply(activeDoc.doc_id, annId, replyText)
    setReplyText('')
  }

  const selectCls = 'flex-1 min-w-0 border border-border rounded px-1.5 py-1 text-micro bg-surface text-fg focus:outline-none focus:border-accent'
  const resolvedCount = anns.filter((a) => a.status === 'resolved').length

  if (anns.length === 0) {
    return <p className="text-mini text-center mt-4 text-muted">Sin anotaciones</p>
  }

  // Las capas eran solo un filtro: nada en la app ponía una marca en otra capa (todo se
  // creaba en «Marcas»), así que el selector solo servía para lo que llegaba importado.
  // Acá se aprovecha el filtro: lo que estés viendo es lo que se mueve, en un paso.
  const moverACapa = async () => {
    const marcas = byPage.flatMap(([, list]) => list)
    if (marcas.length === 0) return
    const sugerida = layerFilter !== 'all' ? layerFilter : (layers[0] || 'Marcas')
    const v = await askForm(
      `Mover ${marcas.length} marca(s) a una capa`,
      [{
        name: 'capa', label: 'Capa', type: 'text', defaultValue: sugerida,
        placeholder: layers.length ? `Existentes: ${layers.join(', ')}` : 'Ej. Eléctrico',
      }],
      'Mover',
    )
    if (!v) return
    const capa = String(v.capa ?? '').trim()
    if (!capa) return
    updateAnnotationsUndoable(activeDoc.doc_id, marcas.map((a) => a.id), { layer: capa })
    showToast(`${marcas.length} marca(s) movidas a «${capa}». Ctrl+Z deshace.`, 'success')
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 space-y-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-hover">
          <Search size={12} className="text-muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en las marcas…"
            className="flex-1 min-w-0 bg-transparent text-micro text-fg placeholder:text-muted focus:outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-muted hover:text-fg shrink-0"><X size={11} /></button>}
        </div>
        <div className="flex items-center gap-1.5">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls} title="Tipo">
            <option value="all">Todo tipo</option>
            {types.map((t) => <option key={t} value={t}>{annotationLabel(t)}</option>)}
          </select>
          {authors.length > 0 && (
            <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} className={selectCls} title="Autor">
              <option value="all">Todos</option>
              {authors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {layers.length > 1 && (
            <select value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)} className={selectCls} title="Capa">
              <option value="all">Todas las capas</option>
              {layers.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          {([['all', 'Todas'], ['open', 'Abiertas'], ['resolved', 'Resueltas']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setStatus(id)}
              className={`px-2 py-0.5 rounded text-micro border transition-colors ${
                status === id ? 'border-accent bg-accent text-toolbar' : 'border-border text-muted hover:bg-hover'
              }`}>
              {label}
            </button>
          ))}
          <label className="flex items-center gap-1 text-micro text-muted cursor-pointer ml-auto" title="Solo la página actual">
            <input type="checkbox" checked={onlyThisPage} onChange={(e) => setOnlyThisPage(e.target.checked)}
              className="w-3 h-3" style={{ accentColor: 'rgb(var(--accent))' }} />
            Esta pág.
          </label>
        </div>
        {layers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-micro text-muted">Ver:</span>
            {layers.map((l) => {
              const oculta = capasOcultas.includes(l)
              return (
                <button key={l} onClick={() => toggleLayerVisible(activeDoc.doc_id, l)}
                  title={oculta ? `Mostrar la capa ${l}` : `Ocultar la capa ${l}`}
                  aria-pressed={!oculta}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-micro border transition-colors ${
                    oculta ? 'border-border text-muted line-through' : 'border-accent text-fg'
                  }`}>
                  {oculta ? <EyeOff size={10} /> : <Eye size={10} />} {l}
                </button>
              )
            })}
          </div>
        )}
        <button onClick={() => { void moverACapa() }}
          disabled={byPage.length === 0}
          title="Mover a una capa las marcas que muestra el filtro"
          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-micro border border-border text-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent">
          <Layers size={11} /> Mover a capa…
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {byPage.length === 0 && (
          <p className="text-mini text-center mt-4 text-muted">Ninguna marca coincide con el filtro</p>
        )}
        {byPage.map(([page, list]) => (
          <div key={page}>
            <button onClick={() => togglePage(page)}
              className="w-full flex items-center gap-1 px-1 py-0.5 text-micro uppercase tracking-wider text-muted hover:text-fg">
              {collapsed.has(page) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              Página {page + 1}
              <span className="ml-auto normal-case tracking-normal">{list.length}</span>
            </button>
            {!collapsed.has(page) && (
              <div className="space-y-1 mt-1">
                {list.map((ann) => {
                  const isSel = selectedAnnotationId === ann.id
                  const isResolved = ann.status === 'resolved'
                  const replies = ann.replies || []
                  const isOpen = expanded === ann.id
                  return (
                    <div key={ann.id}
                      className={`rounded-token border transition-colors ${
                        isSel ? 'border-accent bg-active' : 'border-border hover:bg-hover'
                      } ${isResolved ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-1.5 p-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 border border-border"
                          style={{ backgroundColor: ann.color || 'transparent' }} />
                        <button onClick={() => goTo(ann)} className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-micro font-medium ${isResolved ? 'line-through text-muted' : 'text-fg'}`}>
                              {annotationLabel(ann.type)}
                            </span>
                            {ann.measurement && <span className="text-micro text-fg tabular-nums">{ann.measurement.label}</span>}
                          </div>
                          {ann.text && <div className="text-micro text-muted truncate mt-0.5">{ann.text}</div>}
                          <div className="text-micro text-muted mt-0.5 truncate"
                            title={ann.createdAt ? formatDateTime(ann.createdAt) : undefined}>
                            {ann.author || 'Sin autor'}
                            {ann.createdAt ? ` · ${formatWhen(ann.createdAt)}` : ''}
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setExpanded(isOpen ? null : ann.id)}
                            title={replies.length ? `${replies.length} respuesta(s)` : 'Responder'}
                            className={`p-1 rounded transition-colors ${replies.length ? 'text-fg' : 'text-muted'} hover:bg-hover`}>
                            <MessageSquare size={12} />
                            {replies.length > 0 && <span className="text-micro ml-0.5 tabular-nums">{replies.length}</span>}
                          </button>
                          <button onClick={() => setAnnotationStatus(activeDoc.doc_id, ann.id, isResolved ? 'open' : 'resolved')}
                            title={isResolved ? 'Marcar como abierta' : 'Marcar como resuelta'}
                            className={`p-1 rounded transition-colors hover:bg-hover ${isResolved ? 'text-success' : 'text-muted'}`}>
                            <Check size={12} />
                          </button>
                          <button onClick={() => deleteAnnotation(activeDoc.doc_id, ann.id)} aria-label="Eliminar anotación"
                            className="p-1 rounded text-muted hover:text-danger hover:bg-hover transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="px-1.5 pb-1.5 space-y-1 border-t border-border pt-1.5">
                          {replies.map((r) => (
                            <div key={r.id} className="group flex items-start gap-1 text-micro">
                              <div className="flex-1 min-w-0">
                                <div className="text-muted text-micro" title={formatDateTime(r.at)}>
                                  {r.author || 'Sin autor'} · {formatWhen(r.at)}
                                </div>
                                <div className="text-fg whitespace-pre-wrap break-words">{r.text}</div>
                              </div>
                              <button onClick={() => deleteReply(activeDoc.doc_id, ann.id, r.id)} aria-label="Eliminar respuesta"
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-danger">
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center gap-1">
                            <input value={isOpen ? replyText : ''} onChange={(e) => setReplyText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') sendReply(ann.id) }}
                              placeholder={annotationAuthor ? `Responder como ${annotationAuthor}…` : 'Responder…'}
                              className="flex-1 min-w-0 border border-border rounded px-1.5 py-1 text-micro bg-surface text-fg placeholder:text-muted focus:outline-none focus:border-accent" />
                            <button onClick={() => sendReply(ann.id)} disabled={!replyText.trim()} aria-label="Enviar respuesta"
                              className="p-1 rounded text-fg disabled:opacity-30 hover:bg-hover transition-colors">
                              <Send size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border text-micro text-muted shrink-0">
        <span className="tabular-nums">{filtered.length} de {anns.length} · {resolvedCount} resuelta(s)</span>
        <button onClick={() => window.dispatchEvent(new CustomEvent('app:markup-summary'))}
          title="Exportar resumen de marcas a PDF"
          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-hover hover:text-fg transition-colors">
          <FileDown size={11} /> Resumen
        </button>
      </div>
    </div>
  )
}
