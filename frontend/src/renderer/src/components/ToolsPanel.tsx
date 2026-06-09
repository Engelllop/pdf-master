import { usePdfStore } from '../store/usePdfStore'
import Tooltip from './Tooltip'
import { useThemeClasses } from '../hooks/useThemeClasses'
import {
  PanelRightClose,
  Type,
  Image,
  Square,
  Circle,
  ArrowRight,
  Highlighter,
  Underline,
  Strikethrough,
  MessageSquare,
  PenTool,
  Stamp,
  MousePointer2,
  TextSelect,
  Signature,
  Ruler,
  MoveDiagonal,
  LandPlot,
} from 'lucide-react'

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', color: '', divider: false },
  { id: 'textselect', icon: TextSelect, label: 'Seleccionar texto', color: 'text-emerald-400' },
  { id: 'highlight', icon: Highlighter, label: 'Resaltar', color: 'text-yellow-400' },
  { id: 'underline', icon: Underline, label: 'Subrayar', color: 'text-blue-400' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Tachar', color: 'text-red-400' },
  { id: 'note', icon: MessageSquare, label: 'Nota adhesiva', color: 'text-amber-400' },
  { id: 'draw', icon: PenTool, label: 'Dibujo libre', color: 'text-purple-400' },
  { id: 'signature', icon: Signature, label: 'Firma digital', color: '' },
  { id: 'text', icon: Type, label: 'Texto', color: '' },
  { id: 'image', icon: Image, label: 'Imagen', color: '' },
  { id: 'rect', icon: Square, label: 'Rectángulo', color: '' },
  { id: 'circle', icon: Circle, label: 'Círculo', color: '' },
  { id: 'arrow', icon: ArrowRight, label: 'Flecha', color: '' },
  { id: 'stamp', icon: Stamp, label: 'Sello', color: '' },
  { id: 'measure_calibrate', icon: Ruler, label: 'Calibrar escala', color: 'text-cyan-400', divider: true },
  { id: 'measure_distance', icon: MoveDiagonal, label: 'Medir distancia', color: 'text-cyan-400' },
  { id: 'measure_area', icon: LandPlot, label: 'Medir área', color: 'text-cyan-400' },
]

const COLORS = [
  '#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#ffffff'
]

export default function ToolsPanel() {
  const tc = useThemeClasses()
  const store = usePdfStore()
  const { docs, activeDocId, toolsPanelOpen, toggleToolsPanel, activeTool, setActiveTool, annotationColor, setAnnotationColor, textFontFamily, setTextFontFamily, textFontSize, setTextFontSize, selectedImagePath, setSelectedImagePath, showToast, selectedStamp, setSelectedStamp, stampColor, setStampColor } = store
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const handleToolClick = async (toolId: string) => {
    if (toolId === 'image') {
      if (!selectedImagePath) {
        const path = await window.api.openFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }])
        if (path) {
          setSelectedImagePath(path)
          showToast('Cargando imagen...', 'info')
          const base64 = await window.api.readFileBase64(path)
          if (base64) {
            const ext = path.split('.').pop()?.toLowerCase() || 'png'
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : ext === 'webp' ? 'image/webp' : 'image/png'
            store.setSelectedImageData(`data:${mime};base64,${base64}`)
            setActiveTool('image')
            showToast('Imagen lista. Haz click en el documento para colocarla.', 'success')
          } else {
            showToast('Error al cargar la imagen', 'error')
          }
        }
        return
      }
    }
    setActiveTool(activeTool === toolId ? null : toolId)
  }

  if (!toolsPanelOpen) {
    return (
      <button
        onClick={toggleToolsPanel}
        className={`w-8 border-l flex items-center justify-center transition-colors shrink-0 group ${tc('bg-slate-800 border-slate-700 hover:bg-slate-700', 'bg-white border-gray-300 hover:bg-gray-100')}`}
        aria-label="Mostrar herramientas"
      >
        <PanelRightClose size={16} className={`rotate-180 ${tc('text-slate-500 group-hover:text-slate-300', 'text-gray-500 group-hover:text-gray-700')}`} />
      </button>
    )
  }

  return (
    <div className={`w-56 border-l flex flex-col shrink-0 ${tc('bg-slate-800 border-slate-700', 'bg-white border-gray-300')}`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${tc('border-slate-700', 'border-gray-300')}`}>
        <span className={`text-xs font-semibold uppercase tracking-wider ${tc('text-slate-400', 'text-gray-500')}`}>Herramientas</span>
        <button onClick={toggleToolsPanel} aria-label="Ocultar herramientas" className={`p-1 rounded transition-colors ${tc('hover:bg-slate-700 text-slate-400', 'hover:bg-gray-100 text-gray-500')}`}>
          <PanelRightClose size={14} />
        </button>
      </div>

      {!activeDoc ? (
        <div className="flex-1 flex items-center justify-center">
          <p className={`text-sm text-center px-4 ${tc('text-slate-500', 'text-gray-500')}`}>Abre un PDF para usar herramientas</p>
        </div>
      ) : (
        <>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAnnotationColor(c)}
                  className={`w-full aspect-square rounded border-2 transition-all ${annotationColor === c ? 'border-white scale-110' : 'border-transparent hover:border-slate-500'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={annotationColor}
                onChange={(e) => setAnnotationColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="Elegir color"
              />
              <input
                type="text"
                value={annotationColor}
                onChange={(e) => {
                  const val = e.target.value
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setAnnotationColor(val)
                }}
                onBlur={(e) => {
                  const val = e.target.value
                  if (/^#[0-9A-Fa-f]{6}$/.test(val)) setAnnotationColor(val)
                }}
                className={`flex-1 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                placeholder="#fbbf24"
              />
            </div>
            {activeTool === 'text' && (
              <div className="space-y-2">
                <div className={`text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Propiedades de texto</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs w-12 ${tc('text-slate-400', 'text-gray-600')}`}>Fuente</span>
                  <select
                    value={textFontFamily}
                    onChange={(e) => setTextFontFamily(e.target.value)}
                    className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                  >
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Helvetica">Helvetica</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs w-12 ${tc('text-slate-400', 'text-gray-600')}`}>Tamaño</span>
                  <input
                    type="number"
                    min={4}
                    max={72}
                    value={textFontSize}
                    onChange={(e) => setTextFontSize(parseInt(e.target.value) || 14)}
                    className={`w-16 border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                  />
                  <span className={`text-xs ${tc('text-slate-500', 'text-gray-500')}`}>px</span>
                </div>
              </div>
            )}
            {activeTool === 'image' && (
              <div className="space-y-2">
                <div className={`text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Imagen seleccionada</div>
                <div className={`text-xs truncate ${tc('text-slate-300', 'text-gray-700')}`} title={selectedImagePath || ''}>
                  {selectedImagePath ? selectedImagePath.split(/[\\/]/).pop() : 'Ninguna'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const path = await window.api.openFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }])
                      if (path) setSelectedImagePath(path)
                    }}
                    className={`flex-1 text-xs px-2 py-1 rounded border ${tc('bg-slate-700 border-slate-600 hover:bg-slate-600', 'bg-gray-100 border-gray-300 hover:bg-gray-200')}`}
                  >
                    Cambiar imagen
                  </button>
                  <button
                    onClick={() => setSelectedImagePath(null)}
                    className={`text-xs px-2 py-1 rounded border ${tc('bg-slate-700 border-slate-600 hover:bg-slate-600', 'bg-gray-100 border-gray-300 hover:bg-gray-200')}`}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )}
            {activeTool === 'stamp' && (
              <div className="space-y-2">
                <div className={`text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Sello</div>
                <select
                  value={selectedStamp}
                  onChange={(e) => setSelectedStamp(e.target.value)}
                  className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                >
                  {['APROBADO', 'RECHAZADO', 'REVISADO', 'URGENTE', 'BORRADOR', 'FIRMADO', 'COPIA'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${tc('text-slate-400', 'text-gray-600')}`}>Color</span>
                  <input
                    type="color"
                    value={stampColor}
                    onChange={(e) => setStampColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                </div>
              </div>
            )}
            {/* Calibration controls */}
            {activeDoc && activeDoc.measurementScale && (
              <div className="space-y-2">
                <div className={`text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Escala calibrada</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${tc('text-slate-400', 'text-gray-600')}`}>1 unidad =</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={activeDoc.measurementScale.pixelsPerUnit.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val) && val > 0 && activeDoc.measurementScale) {
                        store.setMeasurementScale(activeDoc.doc_id, { pixelsPerUnit: val, unit: activeDoc.measurementScale.unit })
                      }
                    }}
                    className={`w-20 border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                  />
                  <span className={`text-xs ${tc('text-slate-400', 'text-gray-600')}`}>px</span>
                </div>
                <select
                  value={activeDoc.measurementScale.unit}
                  onChange={(e) => {
                    if (activeDoc.measurementScale) {
                      store.setMeasurementScale(activeDoc.doc_id, { pixelsPerUnit: activeDoc.measurementScale.pixelsPerUnit, unit: e.target.value as 'm' | 'cm' | 'mm' | 'ft' | 'in' })
                    }
                  }}
                  className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${tc('bg-slate-900 border-slate-600 text-slate-200', 'bg-white border-gray-300 text-gray-800')}`}
                >
                  {['m', 'cm', 'mm', 'ft', 'in'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
            {/* Rotation control for selected annotation */}
            {activeDoc && store.selectedAnnotationId && (() => {
              const ann = activeDoc.annotations.find((a) => a.id === store.selectedAnnotationId)
              if (!ann || (ann.type !== 'image' && ann.type !== 'text' && ann.type !== 'rect' && ann.type !== 'circle')) return null
              return (
                <div className="space-y-2">
                  <div className={`text-[10px] uppercase tracking-wider ${tc('text-slate-500', 'text-gray-500')}`}>Rotacion</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={1}
                      value={ann.rotation || 0}
                      onChange={(e) => store.updateAnnotation(activeDoc.doc_id, ann.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <span className={`text-xs w-8 text-right ${tc('text-slate-400', 'text-gray-600')}`}>{ann.rotation || 0}°</span>
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {TOOLS.map((tool) => {
              const Icon = tool.icon
              const isActive = activeTool === tool.id
              return (
                <Tooltip content={tool.label} key={tool.id}>
                  <button
                    onClick={() => handleToolClick(tool.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors text-left ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : tc('text-slate-300 hover:bg-slate-700 hover:text-white', 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                    }`}
                    aria-label={tool.label}
                  >
                    <Icon size={16} className={isActive ? 'text-white' : tool.color || 'text-slate-400'} />
                    <span>{tool.label}</span>
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
