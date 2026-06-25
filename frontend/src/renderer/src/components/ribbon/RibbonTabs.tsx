import { useStoreSlice } from '../../hooks/useStoreSlice'
import { type RibbonTab } from '../../store/usePdfStore'

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

export default function RibbonTabs() {
  const { activeRibbon, setActiveRibbon } = useStoreSlice('activeRibbon', 'setActiveRibbon')
  return (
    <div className="h-9 bg-toolbar flex items-center justify-center px-3 gap-1 overflow-x-auto">
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
  )
}
