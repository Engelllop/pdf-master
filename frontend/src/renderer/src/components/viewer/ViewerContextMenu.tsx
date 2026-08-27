import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Copy, CopyPlus, Trash2, ClipboardPaste, BoxSelect, Eraser,
  Bookmark, ImageDown, FileText,
} from 'lucide-react'

/** Menú contextual del visor (clic derecho sobre la página). Presentacional: la
 * lógica de cada acción se inyecta como callbacks desde Viewer. */
export interface ViewerContextMenuProps {
  x: number
  y: number
  /** Cuántas marcas hay seleccionadas: cambia el rótulo (una vs. N). */
  selectionCount: number
  canPaste: boolean
  pageMarkCount: number
  canExportImage: boolean
  onCopy: () => void
  onDuplicate: () => void
  onDeleteAnnotation: () => void
  onPaste: () => void
  onSelectAllOnPage: () => void
  onClearPage: () => void
  onAddBookmark: () => void
  onExportImage: () => void
  onCopyText: () => void
}

type Item = {
  id: string
  icon: typeof Copy
  label: string
  shortcut?: string
  danger?: boolean
  onClick: () => void
}

const MARGEN = 8

export default function ViewerContextMenu(props: ViewerContextMenuProps) {
  const { x, y, selectionCount, canPaste, pageMarkCount, canExportImage } = props
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Un clic derecho cerca del borde dejaba medio menú fuera de la ventana (y sin
  // scroll, porque el visor no lo tiene): se voltea contra el lado que sobra.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.max(MARGEN, Math.min(x, window.innerWidth - width - MARGEN)),
      y: Math.max(MARGEN, Math.min(y, window.innerHeight - height - MARGEN)),
    })
  }, [x, y])

  // El primer elemento recibe el foco: con el menú abierto, Tab y las flechas del
  // navegador ya recorren la lista sin tener que volver al ratón.
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])

  const grupos: Item[][] = [
    selectionCount > 0
      ? [
        { id: 'copy', icon: Copy, label: selectionCount > 1 ? `Copiar ${selectionCount} marcas` : 'Copiar marca', shortcut: 'Ctrl+C', onClick: props.onCopy },
        { id: 'dup', icon: CopyPlus, label: 'Duplicar', shortcut: 'Ctrl+D', onClick: props.onDuplicate },
        { id: 'del', icon: Trash2, label: selectionCount > 1 ? `Eliminar ${selectionCount} marcas` : 'Eliminar marca', shortcut: 'Supr', danger: true, onClick: props.onDeleteAnnotation },
      ]
      : [],
    [
      ...(canPaste ? [{ id: 'paste', icon: ClipboardPaste, label: 'Pegar acá', shortcut: 'Ctrl+V', onClick: props.onPaste }] : []),
      ...(pageMarkCount > 0 ? [
        { id: 'all', icon: BoxSelect, label: 'Seleccionar las marcas de la página', shortcut: 'Ctrl+A', onClick: props.onSelectAllOnPage },
        { id: 'clear', icon: Eraser, label: `Borrar las ${pageMarkCount} marcas de la página`, danger: true, onClick: props.onClearPage },
      ] : []),
    ],
    [
      { id: 'bookmark', icon: Bookmark, label: 'Agregar marcador', onClick: props.onAddBookmark },
      ...(canExportImage ? [{ id: 'img', icon: ImageDown, label: 'Exportar página como imagen', onClick: props.onExportImage }] : []),
      { id: 'text', icon: FileText, label: 'Copiar el texto de la página', onClick: props.onCopyText },
    ],
  ].filter((g) => g.length > 0)

  return (
    <div ref={ref} role="menu" aria-label="Acciones de la página"
      className="menu-pop fixed z-dropdown min-w-[248px] rounded-token border border-border bg-panel shadow-token-lg py-1"
      style={{ left: pos.x, top: pos.y }}>
      {grupos.map((grupo, gi) => (
        <div key={grupo[0].id}>
          {gi > 0 && <div className="my-1 h-px bg-border" role="separator" />}
          {grupo.map(({ id, icon: Icon, label, shortcut, danger, onClick }) => (
            <button key={id} role="menuitem" onClick={onClick}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-mini text-left transition-colors duration-fast ease-token ${
                danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-hover'
              }`}>
              <Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-80" />
              <span className="flex-1 truncate">{label}</span>
              {shortcut && <kbd className="text-micro text-muted shrink-0">{shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
