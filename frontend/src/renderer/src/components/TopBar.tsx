import { PanelLeft, Sun, Moon, HelpCircle, Settings, Save, Printer, Undo2, Redo2 } from 'lucide-react'
import Tooltip from './Tooltip'
import TabStrip from './TabStrip'
import { useStoreSlice } from '../hooks/useStoreSlice'
import appIcon from '../assets/icon.png'

// Fila superior (zona de arrastre de la ventana): logo + barra de acceso rápido +
// pestañas de documentos + utilidades. Guardar, imprimir, deshacer y rehacer viven
// aquí, como en cualquier suite de escritorio: son de TODOS los modos, y en la fila
// de la cinta le quitaban sitio a las pestañas. El menú Archivo vive en la cinta
// (FileMenu); el logo lo abre también vía el evento 'app:file-menu'.
export default function TopBar() {
  const {
    sidebarOpen, toggleSidebar, theme, setTheme,
    docs, activeDocId, undo, redo, undoStack, redoStack, pageUndoBusy,
  } = useStoreSlice(
    'sidebarOpen', 'toggleSidebar', 'theme', 'setTheme',
    'docs', 'activeDocId', 'undo', 'redo', 'undoStack', 'redoStack', 'pageUndoBusy',
  )
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const hasDoc = !!activeDoc
  const dirty = !!activeDoc?.dirty

  // La respuesta va en la pulsación, no en el release: sin el `active:scale` un
  // control se siente muerto aunque responda rápido.
  const rightBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-token-sm transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant text-muted hover:text-fg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="app-drag relative z-dropdown h-chrome material material-edge flex items-center shrink-0 select-none pr-[140px]">
      <Tooltip content="Menú de PDF Master">
        <button onClick={() => window.dispatchEvent(new CustomEvent('app:file-menu'))} aria-label="Menú de PDF Master"
          className="app-no-drag flex items-center justify-center w-8 h-8 ml-2 mr-1 rounded-token-sm hover:bg-hover transition-colors duration-fast ease-token shrink-0">
          <img src={appIcon} alt="" className="w-[22px] h-[22px] dark:invert" draggable={false} />
        </button>
      </Tooltip>

      <div className="app-no-drag flex items-center gap-0.5 shrink-0" role="toolbar" aria-label="Acceso rápido">
        <Tooltip content={dirty ? 'Guardar (hay cambios sin guardar)' : 'Guardar'} shortcut="Ctrl+S">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-save'))} disabled={!hasDoc}
            aria-label={dirty ? 'Guardar, hay cambios sin guardar' : 'Guardar'}
            className={`relative ${rightBtn} ${dirty ? '!text-warning' : ''}`}>
            <Save size={16} />
            {dirty && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />}
          </button>
        </Tooltip>
        <Tooltip content="Imprimir" shortcut="Ctrl+P">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:shortcut-print'))} disabled={!hasDoc}
            aria-label="Imprimir" className={rightBtn}><Printer size={16} /></button>
        </Tooltip>
        <Tooltip content="Deshacer" shortcut="Ctrl+Z">
          <button onClick={undo} disabled={undoStack.length === 0 || pageUndoBusy} aria-label="Deshacer" className={rightBtn}><Undo2 size={16} /></button>
        </Tooltip>
        <Tooltip content="Rehacer" shortcut="Ctrl+Y">
          <button onClick={redo} disabled={redoStack.length === 0 || pageUndoBusy} aria-label="Rehacer" className={rightBtn}><Redo2 size={16} /></button>
        </Tooltip>
      </div>
      <div className="w-px h-5 mx-2 bg-border shrink-0" aria-hidden="true" />

      <TabStrip />

      <div className="app-no-drag flex items-center h-full gap-0.5 pr-1">
        <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} className={rightBtn}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
        <Tooltip content="Ajustes">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-settings'))} aria-label="Ajustes" className={rightBtn}><Settings size={16} /></button>
        </Tooltip>
        <Tooltip content="Atajos de teclado" shortcut="F1">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-shortcuts'))} aria-label="Atajos de teclado" className={rightBtn}><HelpCircle size={16} /></button>
        </Tooltip>
        <Tooltip content={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'} shortcut="Ctrl+Shift+L">
          <button onClick={toggleSidebar} aria-label={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'}
            aria-pressed={sidebarOpen}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-token-sm transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant ${
              sidebarOpen ? 'bg-selected text-fg' : 'text-muted hover:text-fg hover:bg-hover'
            }`}>
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
