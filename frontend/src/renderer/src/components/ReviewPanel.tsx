import { useMemo, useState } from 'react'
import {
  Check, ChevronDown, ChevronRight, Eye, EyeOff, Layers, MessageSquare, Search, Trash2, X, FileDown, Send,
} from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { type Annotation, type PdfDoc } from '../store/usePdfStore'
import { annotationLabel } from '../lib/tools'
import { askForm } from '../lib/uiPrompt'
import { formatWhen, formatDateTime } from '../lib/format'
import { EmptyState, SegmentedGroup, iconBtnDanger, rowSelected } from './panelUi'

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

  const selectCls = 'flex-1 min-w-0 border border-border rounded-token-sm px-1.5 py-1 text-micro bg-surface text-fg focus:outline-none focus:border-fg'
  const resolvedCount = anns.filter((a) => a.status === 'resolved').length

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
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-token-sm bg-hover">
          <Search size={12} className="text-muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en las marcas…"
            className="flex-1 min-w-0 bg-transparent text-micro text-fg placeholder:text-muted focus:outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-muted hover:text-fg shrink-0"><X size={12} /></button>}
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
        <div className="flex items-center gap-1.5">
          <SegmentedGroup<StatusFilter> value={status} onChange={setStatus}
            options={[['all', 'Todas'], ['open', 'Abiertas'], ['resolved', 'Resueltas']]} />
          <label className="flex items-center gap-1 text-micro text-muted cursor-pointer ml-auto" title="Solo la página actual">
            <input type="checkbox" checked={onlyThisPage} onChange={(e) => setOnlyThisPage(e.target.checked)}
              className="w-3 h-3" style={{ accentColor: 'rgb(var(--fg))' }} />
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
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-token-sm text-micro border transition-colors ${
                    oculta ? 'border-border text-muted line-through' : 'border-fg text-fg'
                  }`}>
                  {oculta ? <EyeOff size={12} /> : <Eye size={12} />} {l}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* El estado vacío SUSTITUYE al contenedor con scroll: dentro de él, un hijo
          `flex-1` no se centra y el mensaje quedaba pegado arriba. */}
      {byPage.length === 0 ? (
        <EmptyState icon={MessageSquare}>
          {anns.length === 0 ? 'Todavía no hay marcas en este documento' : 'Ninguna marca coincide con el filtro'}
        </EmptyState>
      ) : (
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {byPage.map(([page, list]) => (
          <div key={page}>
            {/* Pegajosa: en un plano con cincuenta marcas, al desplazarse se perdia
                de vista a que pagina pertenece la fila que se esta mirando. */}
            <button onClick={() => togglePage(page)}
              className="sticky top-0 z-raised w-full flex items-center gap-1 px-1 py-1 bg-panel/95 backdrop-blur-[2px] text-micro font-semibold uppercase tracking-wider text-muted hover:text-fg transition-colors duration-fast ease-token">
              {collapsed.has(page) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
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
                      className={`rounded-token border transition-colors duration-fast ease-token ${
                        isSel ? rowSelected : 'border-border hover:bg-hover'
                      }`}>
                      {/* `opacity-60` sobre la fila entera apagaba tambien Eliminar y
                          Responder, que siguen estando igual de disponibles. */}
                      <div className={`flex items-start gap-1.5 p-1.5 min-h-7 ${isResolved ? '[&>button]:opacity-60 [&>span]:opacity-60' : ''}`}>
                        {/* Todo el panel era text-micro: tipo, texto, autor y fecha
                            pesaban lo mismo y no habia por donde entrar. El titulo
                            sube un escalon y los metadatos se quedan abajo. */}
                        <span className="w-3 h-3 rounded-full shrink-0 mt-0.5 ring-1 ring-border"
                          style={{ backgroundColor: ann.color || 'transparent' }} />
                        <button onClick={() => goTo(ann)} className="flex-1 min-w-0 text-left">
                          <div className="flex items-baseline gap-1.5">
                            <span className={`text-mini font-medium ${isResolved ? 'line-through text-muted' : 'text-fg'}`}>
                              {annotationLabel(ann.type)}
                            </span>
                            {ann.measurement && <span className="text-mini text-fg tabular ml-auto shrink-0">{ann.measurement.label}</span>}
                          </div>
                          {ann.text && <div className="text-micro text-fg truncate mt-0.5">{ann.text}</div>}
                          <div className="text-micro text-muted mt-0.5 truncate"
                            title={ann.createdAt ? formatDateTime(ann.createdAt) : undefined}>
                            {ann.author || 'Sin autor'}
                            {ann.createdAt ? ` · ${formatWhen(ann.createdAt)}` : ''}
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setExpanded(isOpen ? null : ann.id)}
                            title={replies.length ? `${replies.length} respuesta(s)` : 'Responder'}
                            className={`flex items-center p-1.5 rounded-token-sm transition-colors duration-fast ease-token hover:bg-hover ${replies.length ? 'text-fg' : 'text-muted'}`}>
                            <MessageSquare size={14} />
                            {replies.length > 0 && <span className="text-micro ml-0.5 tabular">{replies.length}</span>}
                          </button>
                          <button onClick={() => setAnnotationStatus(activeDoc.doc_id, ann.id, isResolved ? 'open' : 'resolved')}
                            title={isResolved ? 'Marcar como abierta' : 'Marcar como resuelta'}
                            className={`p-1.5 rounded-token-sm transition-colors duration-fast ease-token hover:bg-hover ${isResolved ? 'text-success' : 'text-muted'}`}>
                            <Check size={14} />
                          </button>
                          <button onClick={() => deleteAnnotation(activeDoc.doc_id, ann.id)} aria-label="Eliminar anotación"
                            className={iconBtnDanger}>
                            <Trash2 size={14} />
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
                                className={`${iconBtnDanger} opacity-0 group-hover:opacity-100`}>
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center gap-1">
                            <input value={isOpen ? replyText : ''} onChange={(e) => setReplyText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') sendReply(ann.id) }}
                              placeholder={annotationAuthor ? `Responder como ${annotationAuthor}…` : 'Responder…'}
                              className="flex-1 min-w-0 border border-border rounded-token-sm px-1.5 py-1 text-micro bg-surface text-fg placeholder:text-muted focus:outline-none focus:border-fg" />
                            <button onClick={() => sendReply(ann.id)} disabled={!replyText.trim()} aria-label="Enviar respuesta"
                              className="p-1.5 rounded-token-sm text-fg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-hover transition-colors duration-fast ease-token">
                              <Send size={14} />
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
      )}

      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border text-micro text-muted shrink-0">
        <span className="tabular">{filtered.length} de {anns.length} · {resolvedCount} resuelta(s)</span>
        <button onClick={() => { void moverACapa() }}
          disabled={byPage.length === 0}
          title="Mover a una capa las marcas que muestra el filtro"
          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-token-sm hover:bg-hover hover:text-fg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          <Layers size={12} /> Mover a capa…
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('app:markup-summary'))}
          title="Exportar resumen de marcas a PDF"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-token-sm hover:bg-hover hover:text-fg transition-colors">
          <FileDown size={12} /> Resumen
        </button>
      </div>
    </div>
  )
}
