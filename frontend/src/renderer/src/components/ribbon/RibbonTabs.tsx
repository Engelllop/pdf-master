import { Save, Printer, Undo2, Redo2 } from 'lucide-react'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { type RibbonTab } from '../../store/usePdfStore'
import FileMenu from '../FileMenu'
import Tooltip from '../Tooltip'

const TABS: Array<{ id: RibbonTab; label: string }> = [
  { id: 'read', label: 'Leer' },
  { id: 'comment', label: 'Comentar' },
  { id: 'edit', label: 'Editar' },
  { id: 'form', label: 'Formulario' },
  { id: 'page', label: 'Página' },
  { id: 'protect', label: 'Proteger' },
  { id: 'convert', label: 'Convertir' },
  { id: 'tools', label: 'Herramientas PDF' },
  { id: 'ai', label: 'IA' },
  { id: 'batch', label: 'Por lotes' },
]

// Fila de la cinta: menú Archivo + acciones rápidas (guardar, imprimir, deshacer,
// rehacer) a la izquierda, pestañas de modo centradas.
export default function RibbonTabs() {
  const { activeRibbon, setActiveRibbon, docs, activeDocId, undo, redo, undoStack, redoStack } = useStoreSlice(
    'activeRibbon', 'setActiveRibbon', 'docs', 'activeDocId', 'undo', 'redo', 'undoStack', 'redoStack',
  )
  const hasDoc = docs.some((d) => d.doc_id === activeDocId)

  const QBtn = ({ icon: Icon, tip, shortcut, onClick, disabled = false }: {
    icon: React.ComponentType<{ size?: number }>
    tip: string
    shortcut?: string
    onClick: () => void
    disabled?: boolean
  }) => (
    <Tooltip content={tip} shortcut={shortcut}>
      <button onClick={onClick} disabled={disabled} aria-label={tip}
        className="p-1.5 rounded transition-colors text-muted hover:text-fg hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent">
        <Icon size={15} />
      </button>
    </Tooltip>
  )

  return (
    <div className="h-9 bg-toolbar flex items-center px-2">
      <div className="flex items-center h-full gap-0.5 shrink-0">
        <FileMenu />
        <div className="w-px h-4 mx-1 bg-border" />
        <QBtn icon={Save} tip="Guardar" shortcut="Ctrl+S" disabled={!hasDoc}
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-save'))} />
        <QBtn icon={Printer} tip="Imprimir" shortcut="Ctrl+P" disabled={!hasDoc}
          onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-print'))} />
        <div className="w-px h-4 mx-1 bg-border" />
        <QBtn icon={Undo2} tip="Deshacer" shortcut="Ctrl+Z" disabled={undoStack.length === 0} onClick={undo} />
        <QBtn icon={Redo2} tip="Rehacer" shortcut="Ctrl+Y" disabled={redoStack.length === 0} onClick={redo} />
      </div>
      <div className="flex-1 flex items-center justify-center gap-1 h-full overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const active = activeRibbon === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveRibbon(t.id)}
              className={`relative px-3 h-full text-[13px] whitespace-nowrap transition-colors ${
                active ? 'text-accent font-medium' : 'text-muted hover:text-fg'
              }`}
            >
              {t.label}
              {active && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          )
        })}
      </div>
      <div className="w-[140px] shrink-0" />
    </div>
  )
}
