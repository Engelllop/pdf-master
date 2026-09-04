import { type ReactNode } from 'react'
import { Save, Printer, Undo2, Redo2 } from 'lucide-react'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { type RibbonTab } from '../../store/usePdfStore'
import FileMenu from '../FileMenu'
import Tooltip from '../Tooltip'
import RibbonOverflow from './RibbonOverflow'

const TABS: Array<{ id: RibbonTab; label: string }> = [
  { id: 'read', label: 'Leer' },
  { id: 'comment', label: 'Comentar' },
  { id: 'edit', label: 'Editar' },
  { id: 'page', label: 'Página' },
  { id: 'protect', label: 'Proteger' },
  { id: 'convert', label: 'Convertir' },
  { id: 'ai', label: 'IA' },
]

// LA fila de la cinta: modos, herramientas del modo, búsqueda y acciones rápidas,
// todo en una. Eran dos filas de chrome (36 + 44) encima de la barra de título: 136
// px antes de ver el documento en una ventana de 900. Las herramientas del modo se
// reparten con `RibbonOverflow`, que manda a un menú lo que no entra en vez de
// envolver la fila o cortarla en seco.
export default function RibbonTabs({ tools, trailing }: { tools?: ReactNode; trailing?: ReactNode } = {}) {
  const { activeRibbon, setActiveRibbon, docs, activeDocId, undo, redo, undoStack, redoStack, pageUndoBusy } = useStoreSlice(
    'activeRibbon', 'setActiveRibbon', 'docs', 'activeDocId', 'undo', 'redo', 'undoStack', 'redoStack', 'pageUndoBusy',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const hasDoc = !!activeDoc
  const dirty = !!activeDoc?.dirty

  const QBtn = ({ icon: Icon, tip, shortcut, onClick, disabled = false, emphasized = false }: {
    icon: React.ComponentType<{ size?: number }>
    tip: string
    shortcut?: string
    onClick: () => void
    disabled?: boolean
    emphasized?: boolean
  }) => (
    <Tooltip content={tip} shortcut={shortcut}>
      <button onClick={onClick} disabled={disabled} aria-label={tip}
        className={`p-1.5 rounded-token-sm transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100 ${
          emphasized ? 'text-warning hover:bg-hover' : 'text-muted hover:text-fg hover:bg-hover'
        }`}>
        <Icon size={16} />
      </button>
    </Tooltip>
  )

  return (
    <div className="relative h-chrome material flex items-center px-2 gap-2">
      <div className="flex items-center shrink-0">
        <FileMenu />
      </div>
      {/* Patrón tablist de W3C: una sola parada de tabulación y flechas para moverse. */}
      <div role="tablist" aria-label="Modos de la cinta"
        className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar rounded-token bg-active p-0.5">
        {TABS.map((t, i) => {
          const active = activeRibbon === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveRibbon(t.id)}
              onKeyDown={(e) => {
                const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                if (!delta) return
                e.preventDefault()
                const next = TABS[(i + delta + TABS.length) % TABS.length]
                setActiveRibbon(next.id)
                const el = e.currentTarget.parentElement?.children[TABS.indexOf(next)] as HTMLElement | undefined
                el?.focus()
              }}
              className={`px-3 h-7 rounded-token-sm text-ui whitespace-nowrap transition-[background-color,color,box-shadow] duration-fast ease-token ${
                active ? 'bg-panel text-fg font-medium shadow-token-sm' : 'text-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {tools ? (
        <>
          <div className="w-px h-4 mx-0.5 bg-border shrink-0" aria-hidden="true" />
          <RibbonOverflow clave={activeRibbon}>{tools}</RibbonOverflow>
        </>
      ) : (
        <div className="flex-1" />
      )}
      {trailing}
      <div className="w-px h-4 mx-0.5 bg-border shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-0.5 shrink-0">
        <QBtn icon={Save} tip={dirty ? 'Sin guardar · Ctrl+S' : 'Guardar'} shortcut="Ctrl+S" disabled={!hasDoc}
          emphasized={dirty}
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-save'))} />
        <QBtn icon={Printer} tip="Imprimir" shortcut="Ctrl+P" disabled={!hasDoc}
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-print'))} />
        <div className="w-px h-4 mx-1 bg-border" aria-hidden="true" />
        <QBtn icon={Undo2} tip="Deshacer" shortcut="Ctrl+Z" disabled={undoStack.length === 0 || pageUndoBusy} onClick={undo} />
        <QBtn icon={Redo2} tip="Rehacer" shortcut="Ctrl+Y" disabled={redoStack.length === 0 || pageUndoBusy} onClick={redo} />
      </div>
    </div>
  )
}
