import { useThemeClasses } from '../../hooks/useThemeClasses'
import { openDocument } from '../../lib/openDocument'

/** Pantalla de bienvenida del visor cuando no hay documento abierto: zona de
 * arrastre + lista de archivos recientes. */
export default function ViewerEmptyState({ containerRef, onDragOver, onDrop }: {
  containerRef: React.RefObject<HTMLDivElement | null>
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const tc = useThemeClasses()
  const recentFiles = (() => {
    try { return JSON.parse(localStorage.getItem('pdfmaster_recent') || '[]') as string[] }
    catch { return [] }
  })()

  return (
    <div ref={containerRef} className={`flex-1 flex flex-col items-center justify-center overflow-auto ${tc('bg-slate-900', 'bg-gray-100')}`}
      onDragOver={onDragOver} onDrop={onDrop}>
      <div className="text-center space-y-4">
        <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center border border-dashed ${tc('bg-slate-800 border-slate-700', 'bg-gray-200 border-gray-400')}`}>
          <svg className={`w-10 h-10 ${tc('text-slate-500', 'text-gray-500')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className={`text-xl font-semibold ${tc('text-slate-200', 'text-gray-800')}`}>PDF Master</h2>
          <p className={`mt-1 ${tc('text-slate-400', 'text-gray-500')}`}>Arrastra un PDF aquí o usa el botón Abrir</p>
        </div>
        <p className="text-xs text-slate-600">Ctrl+rueda: zoom | Rueda: cambiar página</p>
        {recentFiles.length > 0 && (
          <div className="text-left max-w-xs mx-auto">
            <p className={`text-xs uppercase tracking-wider mb-2 ${tc('text-slate-500', 'text-gray-500')}`}>Recientes</p>
            <div className="space-y-1">
              {recentFiles.map((path, i) => (
                <button
                  key={i}
                  onClick={() => { openDocument(path) }}
                  className={`w-full text-left text-xs rounded px-2 py-1 transition-colors truncate ${tc('text-slate-300 hover:text-white hover:bg-slate-800', 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`}
                  title={path}
                >
                  {path.split(/[\\/]/).pop()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
