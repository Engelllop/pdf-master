import { PanelLeft, Sun, Moon, HelpCircle, Settings } from 'lucide-react'
import Tooltip from './Tooltip'
import TabStrip from './TabStrip'
import { useStoreSlice } from '../hooks/useStoreSlice'
import appIcon from '../assets/icon.png'

// Fila superior (zona de arrastre de la ventana): logo + pestañas de documentos +
// utilidades. El menú Archivo vive en la fila de la cinta (FileMenu); el logo lo
// abre también vía el evento 'app:file-menu'.
export default function TopBar() {
  const { sidebarOpen, toggleSidebar, theme, setTheme } = useStoreSlice(
    'sidebarOpen', 'toggleSidebar', 'theme', 'setTheme',
  )

  const rightBtn = 'p-2 h-full transition-colors text-muted hover:text-fg hover:bg-hover disabled:opacity-30'

  return (
    <div className="app-drag h-10 border-b border-border flex items-center bg-toolbar shrink-0 select-none pr-[140px]">
      <Tooltip content="Menú de PDF Master">
        <button onClick={() => window.dispatchEvent(new CustomEvent('app:file-menu'))} aria-label="Menú"
          className="app-no-drag flex items-center justify-center w-11 h-10 hover:bg-hover transition-colors shrink-0">
          <img src={appIcon} alt="PDF Master" className="w-[22px] h-[22px] dark:invert" draggable={false} />
        </button>
      </Tooltip>

      <TabStrip />

      <div className="app-no-drag flex items-center h-full">
        <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambiar tema" className={rightBtn}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
        <Tooltip content="Ajustes">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-settings'))} aria-label="Ajustes" className={rightBtn}><Settings size={16} /></button>
        </Tooltip>
        <Tooltip content="Atajos de teclado" shortcut="F1">
          <button onClick={() => window.dispatchEvent(new CustomEvent('app:show-shortcuts'))} aria-label="Atajos" className={rightBtn}><HelpCircle size={16} /></button>
        </Tooltip>
        <Tooltip content={sidebarOpen ? 'Ocultar páginas' : 'Mostrar páginas'} shortcut="Ctrl+Shift+L">
          <button onClick={toggleSidebar} aria-label="Panel de páginas"
            className={`p-2 h-full transition-colors hover:bg-hover ${sidebarOpen ? 'text-accent' : 'text-muted'}`}>
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
