import { X, Keyboard } from 'lucide-react'

interface ShortcutsModalProps {
  onClose: () => void
}

const SECTIONS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Archivo',
    items: [
      ['Ctrl+K', 'Paleta de comandos'],
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
      ['Supr / Retroceso', 'Eliminar la selección'],
      ['Enter', 'Cerrar polígono de medición de área'],
      ['Esc', 'Soltar herramienta y selección'],
    ],
  },
  {
    title: 'Marcas seleccionadas',
    items: [
      ['Clic', 'Seleccionar una marca'],
      ['Ctrl+clic', 'Añadir o quitar de la selección'],
      ['Arrastrar con V', 'Marquesina de selección'],
      ['Ctrl+A', 'Todas las de la página'],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copiar / cortar / pegar (entre páginas y documentos)'],
      ['Ctrl+D', 'Duplicar'],
      ['↑ ↓ ← →', 'Mover 1 pt (Shift: 10 pt)'],
    ],
  },
  {
    title: 'Herramientas',
    items: [
      ['V', 'Seleccionar'],
      ['H / U / K', 'Resaltar / subrayar / tachar'],
      ['R / O', 'Rectángulo / círculo'],
      ['L / A / G', 'Línea / flecha / llamada'],
      ['T / N / D', 'Cuadro de texto / nota / dibujar'],
      ['C', 'Conteo'],
      ['M / Shift+M', 'Medir distancia / área'],
      ['Shift+C', 'Calibrar escala'],
      ['Shift al dibujar', 'Ángulos de 45° · cuadrados'],
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
  return (
    <div className="overlay-in fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        onClick={(e) => e.stopPropagation()}
        className="panel-in w-[560px] max-w-[92vw] max-h-[84vh] overflow-y-auto rounded-lg border border-border shadow-2xl bg-panel text-fg"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-panel sticky top-0">
          <Keyboard size={18} className="text-muted" />
          <h2 className="text-base font-semibold flex-1">Atajos de teclado</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1 rounded transition-colors text-muted hover:bg-hover">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-micro uppercase tracking-wider mb-1.5 text-muted">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map(([keys, label]) => (
                  <li key={keys + label} className="flex items-center justify-between gap-3 text-mini">
                    <span className="text-fg">{label}</span>
                    <kbd className="shrink-0 px-1.5 py-0.5 rounded border border-border font-sans text-micro bg-surface text-muted">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border text-micro text-muted">
          Pulsa F1 para abrir este panel en cualquier momento
        </div>
      </div>
    </div>
  )
}
