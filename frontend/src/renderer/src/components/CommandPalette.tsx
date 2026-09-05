import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, CornerDownLeft, FileText, Eye, Pencil, Files, Highlighter,
  Shield, FileOutput, Sparkles, TextCursorInput, Command as CommandIcon,
} from 'lucide-react'
import { getCommands, subscribeCommands, type Command } from '../lib/commands'
import { sinTildes } from '../lib/texto'

/** Icono por grupo. Los ~60 comandos no traen icono propio a propósito: darle uno a
 * cada uno sería sesenta decisiones que envejecen mal, y lo que el ojo necesita en
 * una lista larga es ritmo por sección, no un pictograma distinto por fila. */
const ICONO_GRUPO: Record<string, typeof FileText> = {
  Archivo: FileText,
  Ver: Eye,
  Herramienta: Pencil,
  Página: Files,
  Marcas: Highlighter,
  Editar: TextCursorInput,
  Proteger: Shield,
  Convertir: FileOutput,
  Formulario: TextCursorInput,
  IA: Sparkles,
}

/** Lo que dura `panel-out`/`overlay-out` en App.css (`--dur-fast`). */
const SALIDA = 120
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Paleta de comandos (Ctrl+K): la app tiene ~60 acciones repartidas en 7 cintas y
 * sin esto casi ninguna se descubre. Filtra por palabras sobre nombre y grupo. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [, force] = useState(0)
  const [saliendo, setSaliendo] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const cerrando = useRef(false)
  const salida = useRef<number | null>(null)

  useEffect(() => subscribeCommands(() => force((n) => n + 1)), [])
  useEffect(() => () => { if (salida.current) clearTimeout(salida.current) }, [])

  /** Único camino de cierre (Esc, clic en el fondo, ejecutar un comando): marca la
   * salida y desmonta cuando acaba. El guardia impide dispararla dos veces y que
   * una segunda pulsación se quede a medias con dos capas encima. */
  const cerrar = () => {
    if (cerrando.current) return
    cerrando.current = true
    if (sinMovimiento()) { onClose(); return }
    setSaliendo(true)
    salida.current = window.setTimeout(onClose, SALIDA)
  }

  const results = useMemo(() => {
    const all = getCommands().filter((c) => !c.disabled)
    const q = sinTildes(query.trim())
    if (!q) return all
    const words = q.split(/\s+/)
    return all.filter((c) => {
      const hay = sinTildes(`${c.label} ${c.group}`)
      return words.every((w) => hay.includes(w))
    })
  }, [query])

  /** Mismos comandos, partidos por sección y conservando el índice plano de cada uno
   * para que las flechas sigan recorriendo la lista de arriba abajo. */
  const secciones = useMemo(() => {
    const orden: string[] = []
    const porGrupo = new Map<string, Array<{ cmd: Command; i: number }>>()
    results.forEach((cmd, i) => {
      if (!porGrupo.has(cmd.group)) { porGrupo.set(cmd.group, []); orden.push(cmd.group) }
      porGrupo.get(cmd.group)!.push({ cmd, i })
    })
    return orden.map((group) => ({ group, filas: porGrupo.get(group)! }))
  }, [results])

  useEffect(() => { setIndex(0) }, [query])

  // Mantiene visible la fila activa al navegar con el teclado.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (cmd: Command | undefined) => {
    if (!cmd || cerrando.current) return
    cerrar()
    // La acción no espera a la salida: se ejecuta ya y la paleta se va por detrás.
    // Fuera del ciclo de teclado: algunos comandos abren modales que capturan foco.
    setTimeout(() => cmd.run(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (cerrando.current) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[index]) }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar() }
  }

  return (
    <div className="overlay-in fixed inset-0 z-palette flex items-start justify-center pt-[12vh] bg-[rgb(var(--scrim)/0.45)] backdrop-blur-[2px]"
      data-closing={saliendo || undefined} onClick={cerrar}>
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] rounded-token-lg border border-border shadow-token-lg bg-panel overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
          <Search size={16} className="text-muted shrink-0" />
          {/* Combobox: el foco se queda en el campo mientras las flechas mueven la
              selección, así que sin `aria-activedescendant` un lector de pantalla no
              anuncia sobre qué comando está el usuario. */}
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            role="combobox" aria-expanded aria-controls="paleta-lista" aria-autocomplete="list"
            aria-activedescendant={results[index] ? `paleta-cmd-${results[index].id}` : undefined}
            aria-label="Buscar una acción"
            placeholder="Buscar una acción… (p. ej. medir, marcas, comprimir)"
            className="flex-1 min-w-0 bg-transparent text-base text-fg placeholder:text-muted focus:outline-none" />
          <kbd className="px-1.5 py-0.5 rounded-token-sm border border-border bg-active text-micro text-muted">Esc</kbd>
        </div>

        <div ref={listRef} id="paleta-lista" role="listbox" aria-label="Acciones"
          className="max-h-[52vh] overflow-y-auto pb-1">
          {results.length === 0 && (
            <div className="px-3 py-8 flex flex-col items-center gap-2 text-center">
              <CommandIcon size={18} className="text-muted" />
              <p className="text-mini text-muted">Sin coincidencias para «{query}».</p>
            </div>
          )}
          {secciones.map(({ group, filas }) => {
            const Icono = ICONO_GRUPO[group] || CommandIcon
            return (
              <div key={group} role="group" aria-label={group}>
                {/* Pegajosa: en una lista de sesenta acciones, al desplazarse se
                    perdía de vista a qué sección pertenece lo que se está mirando. */}
                <div className="sticky top-0 z-raised bg-panel/95 backdrop-blur-[2px] px-3.5 pt-2.5 pb-1 text-micro font-semibold uppercase tracking-wider text-muted">
                  {group}
                </div>
                {filas.map(({ cmd, i }) => {
                  const activa = i === index
                  return (
                    <button key={cmd.id} id={`paleta-cmd-${cmd.id}`} data-active={activa}
                      role="option" aria-selected={activa} tabIndex={-1}
                      onClick={() => run(cmd)} onMouseMove={() => setIndex(i)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left ${
                        activa ? 'bg-selected text-fg' : 'text-fg hover:bg-hover'
                      }`}>
                      <Icono size={14} className={`shrink-0 ${activa ? 'text-fg' : 'text-muted'}`} />
                      <span className="flex-1 text-base truncate">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className={`px-1.5 py-0.5 rounded-token-sm border text-micro shrink-0 tabular ${
                          activa ? 'border-fg/25 text-fg' : 'border-border bg-active text-muted'
                        }`}>{cmd.shortcut}</kbd>
                      )}
                      <CornerDownLeft size={12}
                        className={`shrink-0 ${activa ? 'text-fg' : 'text-transparent'}`} aria-hidden />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
