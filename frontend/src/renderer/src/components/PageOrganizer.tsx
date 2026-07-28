import { useEffect, useRef, useState } from 'react'
import {
  X, RotateCw, RotateCcw, Trash2, Copy, FilePlus2, Scissors, CheckSquare, Square, ArrowLeft,
} from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { askConfirm } from '../lib/uiPrompt'
import { apiFetch } from '../lib/api'

/** Organizador de páginas a pantalla completa: la columna de 224 px del panel
 * lateral no sirve para reordenar documentos de decenas de páginas. */
export default function PageOrganizer({ onClose }: { onClose: () => void }) {
  const {
    docs, activeDocId, setPage, showToast, setDocDirty, reorderPages,
    updateDocPageCount, invalidatePageCache, invalidateThumbnails, incrementDocVersion,
  } = useStoreSlice(
    'docs', 'activeDocId', 'setPage', 'showToast', 'setDocDirty', 'reorderPages',
    'updateDocPageCount', 'invalidatePageCache', 'invalidateThumbnails', 'incrementDocVersion',
  )
  const doc = docs.find((d) => d.doc_id === activeDocId)

  const [thumbs, setThumbs] = useState<Map<number, string>>(new Map())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const versionRef = useRef(0)

  // Esc cierra. Estaba en el onKeyDown del contenedor, que solo dispara si el foco
  // está dentro: al abrirse nadie tenía el foco y no había forma de salir con teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const pageCount = doc?.page_count ?? 0

  // Carga las miniaturas en tandas para no saturar el motor (un solo worker).
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const version = ++versionRef.current
    setThumbs(new Map())
    ;(async () => {
      for (let i = 0; i < pageCount; i += 4) {
        if (cancelled || versionRef.current !== version) return
        const batch = Array.from({ length: Math.min(4, pageCount - i) }, (_, k) => i + k)
        const results = await Promise.all(batch.map(async (p) => {
          try {
            const res = await apiFetch(`/pdf/thumbnail/${doc.doc_id}/${p}`)
            if (!res.ok) return null
            const data = await res.json()
            return [p, data.image_base64] as const
          } catch { return null }
        }))
        if (cancelled || versionRef.current !== version) return
        setThumbs((prev) => {
          const next = new Map(prev)
          for (const r of results) if (r) next.set(r[0], r[1])
          return next
        })
      }
    })()
    return () => { cancelled = true }
  }, [doc?.doc_id, doc?.docVersion, pageCount])

  if (!doc) return null

  const refreshAfter = (newCount: number) => {
    updateDocPageCount(doc.doc_id, newCount)
    setDocDirty(doc.doc_id, true)
    invalidatePageCache(doc.doc_id)
    invalidateThumbnails(doc.doc_id)
    incrementDocVersion(doc.doc_id)
    setSelected(new Set())
  }

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
      const res = await apiFetch(`/pdf/reorder/${doc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_order: order }),
      })
      if (res.ok) {
        reorderPages(doc.doc_id, order)
        setDocDirty(doc.doc_id, true)
        incrementDocVersion(doc.doc_id)
        showToast('Páginas reordenadas', 'success')
      } else showToast('Error al reordenar', 'error')
    } finally { setBusy(false) }
  }

  const rotate = async (degrees: number) => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await apiFetch(`/pdf/rotate-pages/${doc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [...selected], degrees }),
      })
      if (res.ok) {
        setDocDirty(doc.doc_id, true)
        invalidatePageCache(doc.doc_id)
        invalidateThumbnails(doc.doc_id)
        incrementDocVersion(doc.doc_id)
        showToast(`${selected.size} página(s) rotada(s)`, 'success')
      } else showToast('Error al rotar', 'error')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (selected.size === 0) return
    if (selected.size >= pageCount) { showToast('No se pueden eliminar todas las páginas', 'error'); return }
    if (!(await askConfirm('Eliminar páginas', `¿Eliminar ${selected.size} página(s)?`, 'Eliminar'))) return
    setBusy(true)
    try {
      const res = await apiFetch(`/pdf/delete-pages/${doc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [...selected].sort((a, b) => b - a) }),
      })
      if (res.ok) {
        refreshAfter(pageCount - selected.size)
        showToast('Páginas eliminadas', 'success')
      } else showToast('Error al eliminar', 'error')
    } finally { setBusy(false) }
  }

  const duplicate = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await apiFetch(`/pdf/duplicate-page/${doc.doc_id}?page_num=${Math.min(...selected)}`, { method: 'POST' })
      if (res.ok) { refreshAfter(pageCount + 1); showToast('Página duplicada', 'success') }
      else showToast('Error al duplicar', 'error')
    } finally { setBusy(false) }
  }

  const insertBlank = async () => {
    const index = selected.size > 0 ? Math.max(...selected) + 1 : pageCount
    setBusy(true)
    try {
      const res = await apiFetch(`/pdf/insert-blank/${doc.doc_id}?index=${index}`, { method: 'POST' })
      if (res.ok) { refreshAfter(pageCount + 1); showToast('Página en blanco insertada', 'success') }
      else showToast('Error al insertar', 'error')
    } finally { setBusy(false) }
  }

  const extract = async () => {
    if (selected.size === 0) return
    const out = await window.api.saveFile({ defaultPath: doc.file_name.replace(/\.pdf$/i, '_extracto.pdf') })
    if (!out) return
    setBusy(true)
    try {
      const res = await apiFetch(`/pdf/split/${doc.doc_id}?output_path=${encodeURIComponent(out)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [...selected].sort((a, b) => a - b) }),
      })
      showToast(res.ok ? `${selected.size} página(s) extraída(s)` : 'Error al extraer', res.ok ? 'success' : 'error')
    } finally { setBusy(false) }
  }

  const allSelected = selected.size === pageCount && pageCount > 0
  const action = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-mini transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="overlay-in fixed inset-0 z-[93] flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Organizar páginas">
      {/* pr-36: los botones de la ventana (minimizar/cerrar) flotan sobre esta barra
          y tapaban "Eliminar" y la ✕. flex-wrap evita que se corten si no cabe. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pl-4 pr-36 py-2.5 border-b border-border bg-panel shrink-0">
        <button onClick={onClose} className={`${action} text-fg hover:bg-hover border border-border`} title="Volver (Esc)">
          <ArrowLeft size={13} /> Volver
        </button>
        <h2 className="text-base font-semibold text-fg">Organizar páginas</h2>
        <span className="text-micro text-muted truncate max-w-[280px]" title={doc.file_path}>{doc.file_name}</span>
        <span className="text-micro text-muted tabular-nums">· {pageCount} pág.</span>

        <div className="flex-1" />

        <button onClick={() => setSelected(allSelected ? new Set() : new Set(Array.from({ length: pageCount }, (_, i) => i)))}
          className={`${action} text-muted hover:bg-hover hover:text-fg`}>
          {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
          {allSelected ? 'Ninguna' : 'Todas'}
        </button>
        <span className="text-micro text-muted tabular-nums w-24 text-right">
          {selected.size > 0 ? `${selected.size} seleccionada(s)` : ''}
        </span>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={() => rotate(-90)} disabled={busy || selected.size === 0} className={`${action} text-fg hover:bg-hover`}><RotateCcw size={13} /> Izq.</button>
        <button onClick={() => rotate(90)} disabled={busy || selected.size === 0} className={`${action} text-fg hover:bg-hover`}><RotateCw size={13} /> Der.</button>
        <button onClick={duplicate} disabled={busy || selected.size === 0} className={`${action} text-fg hover:bg-hover`}><Copy size={13} /> Duplicar</button>
        <button onClick={insertBlank} disabled={busy} className={`${action} text-fg hover:bg-hover`}><FilePlus2 size={13} /> En blanco</button>
        <button onClick={extract} disabled={busy || selected.size === 0} className={`${action} text-fg hover:bg-hover`}><Scissors size={13} /> Extraer</button>
        <button onClick={remove} disabled={busy || selected.size === 0} className={`${action} text-danger hover:bg-danger/10`}><Trash2 size={13} /> Eliminar</button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={onClose} aria-label="Cerrar"
          className="p-1.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {Array.from({ length: pageCount }, (_, i) => {
            const isSel = selected.has(i)
            const thumb = thumbs.get(i)
            return (
              <div key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setDragOver(i) }}
                onDrop={(e) => { e.preventDefault(); drop(i) }}
                onDragEnd={() => { setDragIndex(null); setDragOver(null) }}
                onClick={(e) => click(i, e)}
                onDoubleClick={() => { setPage(doc.doc_id, i); onClose() }}
                title={`Página ${i + 1} — doble clic para ir`}
                className={`relative rounded-lg border-2 cursor-pointer transition-colors bg-panel ${
                  isSel ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-muted'
                } ${dragIndex === i ? 'opacity-40' : ''} ${dragOver === i ? 'ring-2 ring-accent' : ''}`}>
                <div className={`aspect-[3/4] flex items-center justify-center overflow-hidden rounded-t-md ${thumb ? 'bg-white' : 'skeleton'}`}>
                  {thumb
                    ? <img src={thumb} alt={`Página ${i + 1}`} className="w-full h-full object-contain pointer-events-none" />
                    : <span className="text-mini text-muted">{i + 1}</span>}
                </div>
                <div className="text-center text-micro py-1 text-muted tabular-nums">{i + 1}</div>
                {isSel && <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
