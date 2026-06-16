import { X, Keyboard } from 'lucide-react'
import { useThemeClasses } from '../hooks/useThemeClasses'

interface ShortcutsModalProps {
  onClose: () => void
}

const SECTIONS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Archivo',
    items: [
      ['Ctrl+O', 'Abrir PDF'],
      ['Ctrl+S', 'Guardar'],
      ['Ctrl+W', 'Cerrar pestaña'],
    ],
  },
  {
    title: 'Navegación',
    items: [
      ['↑ / ↓  ·  PgUp / PgDn', 'Página anterior / siguiente'],
      ['Home / End', 'Primera / última página'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Ciclar entre pestañas'],
      ['Ctrl+1…8', 'Ir a la pestaña N'],
      ['Ctrl+9', 'Ir a la última pestaña'],
    ],
  },
  {
    title: 'Zoom y vista',
    items: [
      ['Ctrl++ / Ctrl+-', 'Acercar / alejar'],
      ['Ctrl+0', 'Zoom 100%'],
      ['Ctrl+rueda', 'Zoom con el ratón'],
      ['Ctrl+Shift+L', 'Mostrar / ocultar panel de páginas'],
      ['F11', 'Pantalla completa'],
    ],
  },
  {
    title: 'Edición',
    items: [
      ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'],
      ['Ctrl+F', 'Buscar'],
      ['Supr / Retroceso', 'Eliminar anotación seleccionada'],
      ['Esc', 'Cancelar herramienta activa'],
    ],
  },
  {
    title: 'Presentación',
    items: [
      ['→ / Espacio / PgDn', 'Siguiente página'],
      ['← / PgUp', 'Página anterior'],
      ['Esc', 'Salir'],
    ],
  },
]

export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const tc = useThemeClasses()
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        onClick={(e) => e.stopPropagation()}
        className={`menu-pop w-[560px] max-w-[92vw] max-h-[84vh] overflow-y-auto rounded-lg border shadow-2xl ${tc('bg-slate-800 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
      >
        <div className={`flex items-center gap-2 px-4 py-3 border-b sticky top-0 ${tc('border-slate-700 bg-slate-800', 'border-gray-200 bg-white')}`}>
          <Keyboard size={18} className="text-blue-400" />
          <h2 className="text-sm font-semibold flex-1">Atajos de teclado</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className={`p-1 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-400', 'hover:bg-gray-100 text-gray-500')}`}>
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className={`text-[11px] uppercase tracking-wider mb-1.5 ${tc('text-slate-500', 'text-gray-500')}`}>
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map(([keys, label]) => (
                  <li key={keys + label} className="flex items-center justify-between gap-3 text-xs">
                    <span className={tc('text-slate-300', 'text-gray-700')}>{label}</span>
                    <kbd className={`shrink-0 px-1.5 py-0.5 rounded border font-sans text-[10px] ${tc('bg-slate-900 border-slate-600 text-slate-400', 'bg-gray-50 border-gray-300 text-gray-500')}`}>
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`px-4 py-2 border-t text-[11px] ${tc('border-slate-700 text-slate-500', 'border-gray-200 text-gray-400')}`}>
          Pulsa F1 para abrir este panel en cualquier momento
        </div>
      </div>
    </div>
  )
}
