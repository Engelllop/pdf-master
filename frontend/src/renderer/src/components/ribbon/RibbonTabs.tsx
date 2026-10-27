import { useEffect, useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { type RibbonTab } from '../../store/usePdfStore'
import FileMenu from '../FileMenu'
import Tooltip from '../Tooltip'
import RibbonOverflow from './RibbonOverflow'

export const RIBBON_TABS: Array<{ id: RibbonTab; label: string }> = [
  { id: 'read', label: 'Inicio' },
  { id: 'comment', label: 'Comentar' },
  { id: 'measure', label: 'Medir' },
  { id: 'edit', label: 'Editar' },
  { id: 'page', label: 'Página' },
  { id: 'protect', label: 'Proteger' },
  { id: 'convert', label: 'Convertir' },
  { id: 'ai', label: 'IA' },
]

const CLAVE_CONTRAIDA = 'pdfmaster.cinta.contraida'

function leerContraida(): boolean {
  try { return localStorage.getItem(CLAVE_CONTRAIDA) === '1' } catch { return false }
}

/**
 * La cinta en dos niveles, como cualquier herramienta de escritorio: una fila de
 * pestañas (Archivo + modos + búsqueda) y debajo la BANDA del modo, con las
 * herramientas a la vista y agrupadas con nombre.
 *
 * Antes era una sola fila que compartían modos, herramientas, búsqueda y acciones
 * rápidas: a 1280 px con un panel abierto el modo Comentar se quedaba con tres
 * botones y el resto escondido en «…». La banda tiene el ancho entero para ella.
 *
 * Se contrae (Ctrl+F1 o el chevron) para ganar alto en planos; contraída, pinchar una
 * pestaña la despliega encima del documento hasta usar una herramienta.
 */
export default function RibbonTabs({ tools, trailing }: { tools?: ReactNode; trailing?: ReactNode } = {}) {
  const { activeRibbon, setActiveRibbon } = useStoreSlice('activeRibbon', 'setActiveRibbon')
  const [contraida, setContraida] = useState(leerContraida)
  const [asomada, setAsomada] = useState(false)

  const alternarContraida = () => {
    setContraida((c) => {
      const nueva = !c
      try { localStorage.setItem(CLAVE_CONTRAIDA, nueva ? '1' : '0') } catch { /* sin almacenamiento: solo esta sesión */ }
      return nueva
    })
    setAsomada(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' && e.ctrlKey) { e.preventDefault(); alternarContraida() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const elegir = (id: RibbonTab) => {
    if (contraida) setAsomada((a) => !(a && id === activeRibbon))
    setActiveRibbon(id)
  }

  const banda = tools ? (
    <div className={`rb-band relative h-[70px] flex items-stretch px-2 pt-1 border-t border-border/70 ${
      contraida ? 'absolute left-0 right-0 top-full material shadow-token-md border-b' : ''
    }`}
      // Contraída, la banda flota: se va al usar una herramienta (un botón que no abre
      // menú). Abrir un desplegable de la banda no la cierra.
      onClickCapture={contraida ? (e) => {
        const btn = (e.target as HTMLElement).closest('button')
        if (btn && !btn.hasAttribute('aria-haspopup')) setTimeout(() => setAsomada(false), 0)
      } : undefined}>
      <RibbonOverflow clave={activeRibbon}>{tools}</RibbonOverflow>
    </div>
  ) : null

  return (
    <div className="relative">
      <div className="rb-tabs relative h-9 flex items-end px-2 gap-1">
        <div className="flex items-center self-center shrink-0 mr-1">
          <FileMenu />
        </div>
        {/* Patrón tablist de W3C: una sola parada de tabulación y flechas para moverse. */}
        <div role="tablist" aria-label="Modos de la cinta"
          className="flex items-end h-full min-w-0 overflow-x-auto no-scrollbar">
          {RIBBON_TABS.map((t, i) => {
            const active = activeRibbon === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => elegir(t.id)}
                onKeyDown={(e) => {
                  const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                  if (!delta) return
                  e.preventDefault()
                  const next = RIBBON_TABS[(i + delta + RIBBON_TABS.length) % RIBBON_TABS.length]
                  setActiveRibbon(next.id)
                  const el = e.currentTarget.parentElement?.children[RIBBON_TABS.indexOf(next)] as HTMLElement | undefined
                  el?.focus()
                }}
                className={`relative px-3 h-full text-ui whitespace-nowrap transition-colors duration-fast ease-token ${
                  active ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {/* El peso no cambia al activarse (correría la fila): el estado lo
                    dicen la tinta y la barra de abajo. */}
                <span className="inline-grid">
                  <span className="col-start-1 row-start-1 font-semibold invisible" aria-hidden="true">{t.label}</span>
                  <span className={`col-start-1 row-start-1 ${active ? 'font-semibold' : ''}`}>{t.label}</span>
                </span>
                <span className={`absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-colors duration-fast ${
                  active && (!contraida || asomada) ? 'bg-accent' : active ? 'bg-border-strong' : 'bg-transparent'
                }`} aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <div className="flex items-center self-center gap-1 shrink-0">
          {trailing}
          <Tooltip content={contraida ? 'Mostrar la cinta' : 'Contraer la cinta'} shortcut="Ctrl+F1">
            <button type="button" onClick={alternarContraida} aria-label={contraida ? 'Mostrar la cinta' : 'Contraer la cinta'}
              aria-pressed={contraida}
              className="w-7 h-7 inline-flex items-center justify-center rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors duration-fast">
              {contraida ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </Tooltip>
        </div>
      </div>
      {banda && (!contraida || asomada) && (
        <>
          {contraida && <div className="fixed inset-0 z-sticky" onClick={() => setAsomada(false)} />}
          <div className={contraida ? 'relative z-dropdown' : ''}>{banda}</div>
        </>
      )}
    </div>
  )
}
