import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { getCommands, subscribeCommands, type Command } from '../lib/commands'

/** Paleta de comandos (Ctrl+K): la app tiene ~60 acciones repartidas en 7 cintas y
 * sin esto casi ninguna se descubre. Filtra por subsecuencia sobre nombre y grupo. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [, force] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeCommands(() => force((n) => n + 1)), [])

  const results = useMemo(() => {
    const all = getCommands().filter((c) => !c.disabled)
    const q = query.trim().toLowerCase()
    if (!q) return all
    const words = q.split(/\s+/)
    return all.filter((c) => {
      const hay = `${c.label} ${c.group}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [query])

  useEffect(() => { setIndex(0) }, [query])

  // Mantiene visible la fila activa al navegar con el teclado.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    onClose()
    // Fuera del ciclo de teclado: algunos comandos abren modales que capturan foco.
    setTimeout(() => cmd.run(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[index]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="overlay-in fixed inset-0 z-[94] flex items-start justify-center pt-[12vh] bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" onClick={(e) => e.stopPropagation()}
        className="panel-in w-[560px] max-w-[92vw] rounded-lg border border-border shadow-2xl bg-panel overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search size={15} className="text-muted shrink-0" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Buscar una acción… (p. ej. medir, marcas, comprimir)"
            className="flex-1 min-w-0 bg-transparent text-ui text-fg placeholder:text-muted focus:outline-none" />
          <kbd className="px-1.5 py-0.5 rounded border border-border text-micro text-muted">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-mini text-muted">Sin coincidencias para “{query}”.</div>
          )}
          {results.map((cmd, i) => (
            <button key={cmd.id} data-active={i === index}
              onClick={() => run(cmd)} onMouseMove={() => setIndex(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                i === index ? 'bg-hover' : ''
              }`}>
              <span className="text-micro uppercase tracking-wider text-muted w-20 shrink-0 truncate">{cmd.group}</span>
              <span className="flex-1 text-ui text-fg truncate">{cmd.label}</span>
              {cmd.shortcut && (
                <kbd className="px-1.5 py-0.5 rounded border border-border text-micro text-muted shrink-0">{cmd.shortcut}</kbd>
              )}
              {i === index && <CornerDownLeft size={12} className="text-muted shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
