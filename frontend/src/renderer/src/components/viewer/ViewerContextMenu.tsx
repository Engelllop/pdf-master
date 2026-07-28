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
  const item = 'w-full text-left px-3 py-1.5 text-base text-fg hover:bg-hover'
  return (
    <div className="fixed z-50 border border-border rounded shadow-xl py-1 min-w-[160px] bg-panel"
      style={{ left: x, top: y }}>
      {hasSelection && (
        <button className="w-full text-left px-3 py-1.5 text-base text-danger hover:bg-hover"
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
