import { useThemeClasses } from '../../hooks/useThemeClasses'

/** Menú contextual del visor (clic derecho sobre la página). Presentacional: la
 * lógica de cada acción se inyecta como callbacks desde Viewer. */
export default function ViewerContextMenu({
  x, y, hasSelection, canExportImage,
  onDeleteAnnotation, onAddBookmark, onExportImage, onCopyText,
}: {
  x: number
  y: number
  hasSelection: boolean
  canExportImage: boolean
  onDeleteAnnotation: () => void
  onAddBookmark: () => void
  onExportImage: () => void
  onCopyText: () => void
}) {
  const tc = useThemeClasses()
  const item = `w-full text-left px-3 py-1.5 text-sm ${tc('text-slate-200 hover:bg-slate-700', 'text-gray-800 hover:bg-gray-100')}`
  return (
    <div className={`fixed z-50 border rounded shadow-xl py-1 min-w-[160px] ${tc('bg-slate-800 border-slate-600', 'bg-white border-gray-300')}`}
      style={{ left: x, top: y }}>
      {hasSelection && (
        <button className={`w-full text-left px-3 py-1.5 text-sm text-red-400 ${tc('hover:bg-slate-700', 'hover:bg-gray-100')}`}
          onClick={onDeleteAnnotation}>
          Eliminar anotación
        </button>
      )}
      <button className={item} onClick={onAddBookmark}>Agregar marcador</button>
      {canExportImage && (
        <button className={item} onClick={onExportImage}>Exportar página como imagen</button>
      )}
      <button className={item} onClick={onCopyText}>Copiar texto de página</button>
    </div>
  )
}
