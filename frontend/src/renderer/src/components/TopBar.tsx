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

  // La respuesta va en la pulsación, no en el release: sin el `active:scale` un
  // control se siente muerto aunque responda rápido.
  const rightBtn = 'w-8 h-8 inline-flex items-center justify-center rounded-token-sm transition-[background-color,color,transform] duration-fast ease-token active:scale-[0.97] active:duration-instant text-muted hover:text-fg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="app-drag h-chrome material material-edge flex items-center shrink-0 select-none pr-[140px]">
      <Tooltip content="Menú de PDF Master">
        <button onClick={() => window.dispatchEvent(new CustomEvent('app:file-menu'))} aria-label="Menú de PDF Master"
          className="app-no-drag flex items-center justify-center w-8 h-8 ml-2 mr-1 rounded-token-sm hover:bg-hover transition-colors duration-fast ease-token shrink-0">
          <img src={appIcon} alt="" className="w-[22px] h-[22px] dark:invert" draggable={false} />
        </button>
      </Tooltip>

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
              sidebarOpen ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg hover:bg-hover'
            }`}>
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
