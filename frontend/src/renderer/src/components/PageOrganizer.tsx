import { useEffect, useRef, useState } from 'react'
import { CheckSquare, Square, ArrowLeft, Check } from 'lucide-react'
import { PageActions } from './panelUi'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { askConfirm } from '../lib/uiPrompt'
import { apiFetch } from '../lib/api'
import { pushAnnotations } from '../lib/saveDocument'
import { renderPdfThumbnail } from '../lib/pdfjs'
import { revokePageUrl } from '../lib/blobUrl'
import {
  deletePagesUndoable,
  duplicatePageUndoable,
  insertBlankUndoable,
  reorderPagesUndoable,
  rotatePagesUndoable,
} from '../lib/pageUndo'

/** Organizador de páginas a pantalla completa: la columna de 224 px del panel
 * lateral no sirve para reordenar documentos de decenas de páginas. */
export default function PageOrganizer({ onClose }: { onClose: () => void }) {
  const {
    docs, activeDocId, setPage, showToast,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'showToast',
  )
  const doc = docs.find((d) => d.doc_id === activeDocId)

  const [thumbs, setThumbs] = useState<Map<number, string>>(new Map())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const versionRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Páginas que el usuario llegó a tener cerca del viewport, y las ya pedidas.
  const [wanted, setWanted] = useState<Set<number>>(new Set())
  const requestedRef = useRef<Set<number>>(new Set())
  const thumbsRef = useRef<Map<number, string>>(new Map())

  // Esc cierra. Estaba en el onKeyDown del contenedor, que solo dispara si el foco
  // está dentro: al abrirse nadie tenía el foco y no había forma de salir con teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const pageCount = doc?.page_count ?? 0

  // Al abrir otro documento (o tras editarlo) las miniaturas vigentes ya no valen.
  useEffect(() => {
    versionRef.current++
    requestedRef.current = new Set()
    thumbsRef.current.forEach((url) => revokePageUrl(url))
    thumbsRef.current = new Map()
    setThumbs(new Map())
  }, [doc?.doc_id, doc?.docVersion])

  // Solo se rasteriza lo que el usuario tiene (o tuvo) cerca del viewport: abrir el
  // organizador de un documento de 300 páginas pedía las 300 de golpe.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || pageCount === 0) return
    const io = new IntersectionObserver((entries) => {
      const nuevas = entries
        .filter((e) => e.isIntersecting)
        .map((e) => Number((e.target as HTMLElement).dataset.page))
        .filter((i) => !Number.isNaN(i))
      if (nuevas.length === 0) return
      setWanted((prev) => {
        const next = new Set(prev)
        const antes = next.size
        for (const i of nuevas) next.add(i)
        return next.size === antes ? prev : next
      })
    }, { root, rootMargin: '600px 0px' })
    root.querySelectorAll('[data-page]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [pageCount, doc?.doc_id])

  // Rasteriza en tandas de 4 con el documento que PDF.js ya tiene parseado: antes era
  // un round-trip por página a `/pdf/thumbnail`, y cada uno tomaba el único lock de
  // MuPDF, así que el organizador congelaba guardar, medir o buscar mientras cargaba.
  useEffect(() => {
    if (!doc) return
    const version = versionRef.current
    const pendientes = [...wanted].filter((p) => !requestedRef.current.has(p)).sort((a, b) => a - b)
    if (pendientes.length === 0) return
    for (const p of pendientes) requestedRef.current.add(p)
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < pendientes.length; i += 4) {
        if (cancelled || versionRef.current !== version) return
        const batch = pendientes.slice(i, i + 4)
        const results = await Promise.all(batch.map(async (p) => {
          try {
            const { url } = await renderPdfThumbnail(doc.doc_id, doc.docVersion, p)
            return [p, url] as const
          } catch { return null }
        }))
        if (cancelled || versionRef.current !== version) {
          for (const r of results) if (r) revokePageUrl(r[1])
          return
        }
        setThumbs((prev) => {
          const next = new Map(prev)
          for (const r of results) if (r) next.set(r[0], r[1])
          thumbsRef.current = next
          return next
        })
      }
    })()
    return () => { cancelled = true }
  }, [doc?.doc_id, doc?.docVersion, wanted])

  // Los bitmaps son blob URLs: cerrar el organizador sin revocarlos dejaba en RAM
  // todas las miniaturas que el usuario llegó a ver.
  useEffect(() => () => { thumbsRef.current.forEach((url) => revokePageUrl(url)) }, [])

  if (!doc) return null

  const click = (i: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        return next
      })
    } else if (e.shiftKey && lastClicked !== null) {
      const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)]
      setSelected((prev) => {
        const next = new Set(prev)
        for (let k = a; k <= b; k++) next.add(k)
        return next
      })
    } else {
      setSelected(new Set([i]))
    }
    setLastClicked(i)
  }

  const drop = async (target: number) => {
    if (dragIndex === null || dragIndex === target) { setDragIndex(null); setDragOver(null); return }
    const order = Array.from({ length: pageCount }, (_, i) => i)
    const [moved] = order.splice(dragIndex, 1)
    order.splice(target, 0, moved)
    setDragIndex(null)
    setDragOver(null)
    setBusy(true)
    try {
      await reorderPagesUndoable(doc.doc_id, order)
      showToast('Páginas reordenadas. Ctrl+Z deshace.', 'success')
    } catch { showToast('Error al reordenar', 'error') }
    finally { setBusy(false) }
  }

  const rotate = async (degrees: number) => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await rotatePagesUndoable(doc.doc_id, [...selected], degrees)
      showToast(`${selected.size} página(s) rotada(s). Ctrl+Z deshace.`, 'success')
    } catch { showToast('Error al rotar', 'error') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (selected.size === 0) return
    if (selected.size >= pageCount) { showToast('No se pueden eliminar todas las páginas', 'error'); return }
    if (!(await askConfirm('Eliminar páginas', `¿Eliminar ${selected.size} página(s)?`, 'Eliminar'))) return
    setBusy(true)
    try {
      await deletePagesUndoable(doc.doc_id, [...selected])
      setSelected(new Set())
      showToast('Páginas eliminadas. Ctrl+Z restaura.', 'success')
    } catch { showToast('Error al eliminar', 'error') }
    finally { setBusy(false) }
  }

  const duplicate = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await duplicatePageUndoable(doc.doc_id, Math.min(...selected))
      setSelected(new Set())
      showToast('Página duplicada. Ctrl+Z deshace.', 'success')
    } catch { showToast('Error al duplicar', 'error') }
    finally { setBusy(false) }
  }

  const insertBlank = async () => {
    const index = selected.size > 0 ? Math.max(...selected) + 1 : pageCount
    setBusy(true)
    try {
      await insertBlankUndoable(doc.doc_id, index)
      setSelected(new Set())
      showToast('Página en blanco insertada. Ctrl+Z deshace.', 'success')
    } catch { showToast('Error al insertar', 'error') }
    finally { setBusy(false) }
  }

  const extract = async () => {
    if (selected.size === 0) return
    const out = await window.api.saveFile({ defaultPath: doc.file_name.replace(/\.pdf$/i, '_extracto.pdf') })
    if (!out) return
    setBusy(true)
    try {
      // El extracto es un PDF que se manda a alguien: sin subir las marcas del store
      // salía con las páginas limpias, sin las marcas que se acaban de poner.
      await pushAnnotations(doc.doc_id)
      const res = await apiFetch(`/pdf/split/${doc.doc_id}?output_path=${encodeURIComponent(out)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [...selected].sort((a, b) => a - b) }),
      })
      showToast(res.ok ? `${selected.size} página(s) extraída(s)` : 'Error al extraer', res.ok ? 'success' : 'error')
    } finally { setBusy(false) }
  }

  const allSelected = selected.size === pageCount && pageCount > 0
  const action = 'flex items-center gap-1.5 px-2.5 h-8 rounded-token text-mini transition-colors duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'

  return (
    <div className="overlay-in fixed inset-0 z-sheet flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Organizar páginas">
      {/* pr-36: los botones de la ventana (minimizar/cerrar) flotan sobre esta barra
          y tapaban "Eliminar" y la ✕. flex-wrap evita que se corten si no cabe. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pl-4 pr-36 py-2.5 border-b border-border bg-panel shrink-0">
        <button onClick={onClose} className={`${action} text-fg hover:bg-hover border border-border`} title="Volver (Esc)">
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg leading-tight">Organizar páginas</h2>
          <div className="text-micro text-muted truncate max-w-[320px]" title={doc.file_path}>
            {doc.file_name} · <span className="tabular">{pageCount}</span> pág.
          </div>
        </div>

        <div className="flex-1" />

        <button onClick={() => setSelected(allSelected ? new Set() : new Set(Array.from({ length: pageCount }, (_, i) => i)))}
          className={`${action} text-muted hover:bg-hover hover:text-fg`}>
          {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
          {allSelected ? 'Ninguna' : 'Todas'}
        </button>
        {selected.size > 0 && (
          <span className="text-micro text-fg tabular">{selected.size} seleccionada(s)</span>
        )}
        <div className="w-px h-5 bg-border mx-1" />
        {/* Las mismas seis acciones que la barra flotante de las miniaturas. */}
        <PageActions noSelection={selected.size === 0} busy={busy}
          onRotate={(g) => { void rotate(g) }}
          onDuplicate={() => { void duplicate() }}
          onInsertBlank={() => { void insertBlank() }}
          onExtract={() => { void extract() }}
          onDelete={() => { void remove() }} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {Array.from({ length: pageCount }, (_, i) => {
            const isSel = selected.has(i)
            const thumb = thumbs.get(i)
            return (
              <div key={i}
                data-page={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setDragOver(i) }}
                onDrop={(e) => { e.preventDefault(); drop(i) }}
                onDragEnd={() => { setDragIndex(null); setDragOver(null) }}
                onClick={(e) => click(i, e)}
                onDoubleClick={() => { setPage(doc.doc_id, i); onClose() }}
                title={`Página ${i + 1} — doble clic para ir`}
                className={`group cursor-pointer ${dragIndex === i ? 'opacity-40' : ''}`}>
                <div className={`relative aspect-[3/4] flex items-center justify-center overflow-hidden rounded-token-sm transition-shadow duration-fast ease-token ${
                  thumb ? 'bg-paper' : 'skeleton'
                } ${
                  isSel || dragOver === i
                    ? 'shadow-token-sm ring-2 ring-fg'
                    : 'shadow-token-sm ring-1 ring-border group-hover:ring-muted'
                }`}>
                  {thumb
                    ? <img src={thumb} alt={`Página ${i + 1}`} className="w-full h-full object-contain pointer-events-none" />
                    : <span className="text-mini text-muted">{i + 1}</span>}
                  {isSel && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-selected text-fg flex items-center justify-center shadow-token-sm">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </div>
                {/* Fuera del papel: es el rotulo de la hoja, no parte de ella. */}
                <div className={`text-center text-micro pt-1 tabular ${isSel ? 'text-fg font-medium' : 'text-muted'}`}>{i + 1}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
