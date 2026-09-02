import { Keyboard } from 'lucide-react'
import { DialogShell, DialogHeader, DialogFooter, btnGhost, kbdChip } from './panelUi'
import { TOOL_KEYS, TOOL_LABELS } from '../lib/tools'

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
      ['Ctrl+P', 'Imprimir'],
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
      ['[ / ]', 'Pincel del borrador más chico / más grande'],
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
    // Generada desde `TOOL_KEYS`, que es lo que el atajo global consulta de verdad.
    // Escrita a mano se quedó atrás: la tecla P (medir perímetro) existe desde hace
    // versiones y no estaba en la lista, así que no había forma de descubrirla.
    items: [
      ...Object.entries(TOOL_KEYS).map(([tecla, tool]): [string, string] => [
        tecla.startsWith('shift+') ? `Shift+${tecla.slice(6).toUpperCase()}` : tecla.toUpperCase(),
        TOOL_LABELS[tool] || tool,
      ]),
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
    // Irónico pero cierto: el diálogo de ATAJOS no se cerraba con Esc — no había
    // manejador ninguno, ni aquí ni global. Lo trae el andamio compartido.
    <DialogShell label="Atajos de teclado" panelClass="w-[560px] max-h-[84vh] flex flex-col" onClose={onClose}>
      <DialogHeader icon={Keyboard} title="Atajos de teclado" onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 content-start">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-micro font-semibold uppercase tracking-wider mb-1.5 text-muted">
              {section.title}
            </h3>
            <ul className="space-y-1">
              {section.items.map(([keys, label]) => (
                <li key={keys + label} className="flex items-center justify-between gap-3 text-mini">
                  <span className="text-fg">{label}</span>
                  <kbd className={kbdChip}>{keys}</kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <DialogFooter note="Pulsa F1 para abrir este panel en cualquier momento">
        <button onClick={onClose} className={btnGhost}>Cerrar</button>
      </DialogFooter>
    </DialogShell>
  )
}
