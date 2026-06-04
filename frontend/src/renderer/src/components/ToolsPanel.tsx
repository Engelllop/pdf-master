import { usePdfStore } from '../store/usePdfStore'
import Tooltip from './Tooltip'
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
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', color: 'text-slate-200', divider: false },
  { id: 'textselect', icon: TextSelect, label: 'Seleccionar texto', color: 'text-emerald-400' },
  { id: 'highlight', icon: Highlighter, label: 'Resaltar', color: 'text-yellow-400' },
  { id: 'underline', icon: Underline, label: 'Subrayar', color: 'text-blue-400' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Tachar', color: 'text-red-400' },
  { id: 'note', icon: MessageSquare, label: 'Nota adhesiva', color: 'text-amber-400' },
  { id: 'draw', icon: PenTool, label: 'Dibujo libre', color: 'text-purple-400' },
  { id: 'signature', icon: Signature, label: 'Firma digital', color: 'text-slate-200' },
  { id: 'text', icon: Type, label: 'Texto', color: 'text-slate-200' },
  { id: 'image', icon: Image, label: 'Imagen', color: 'text-slate-200' },
  { id: 'rect', icon: Square, label: 'Rectángulo', color: 'text-slate-200' },
  { id: 'circle', icon: Circle, label: 'Círculo', color: 'text-slate-200' },
  { id: 'arrow', icon: ArrowRight, label: 'Flecha', color: 'text-slate-200' },
  { id: 'stamp', icon: Stamp, label: 'Sello', color: 'text-slate-200' },
  { id: 'measure_calibrate', icon: Ruler, label: 'Calibrar escala', color: 'text-cyan-400', divider: true },
  { id: 'measure_distance', icon: MoveDiagonal, label: 'Medir distancia', color: 'text-cyan-400' },
  { id: 'measure_area', icon: LandPlot, label: 'Medir área', color: 'text-cyan-400' },
]

const COLORS = [
  '#fbbf24', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#ffffff'
]

export default function ToolsPanel() {
  const { docs, activeDocId, toolsPanelOpen, toggleToolsPanel, activeTool, setActiveTool, annotationColor, setAnnotationColor } = usePdfStore()
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  if (!toolsPanelOpen) {
    return (
      <button
        onClick={toggleToolsPanel}
        className="w-8 bg-slate-800 border-l border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors shrink-0 group"
        aria-label="Mostrar herramientas"
      >
        <PanelRightClose size={16} className="text-slate-500 rotate-180 group-hover:text-slate-300" />
      </button>
    )
  }

  return (
    <div className="w-56 bg-slate-800 border-l border-slate-700 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Herramientas</span>
        <button onClick={toggleToolsPanel} aria-label="Ocultar herramientas" className="p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors">
          <PanelRightClose size={14} />
        </button>
      </div>

      {!activeDoc ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-sm text-center px-4">Abre un PDF para usar herramientas</p>
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
                className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                placeholder="#fbbf24"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {TOOLS.map((tool) => {
              const Icon = tool.icon
              const isActive = activeTool === tool.id
              return (
                <Tooltip content={tool.label} key={tool.id}>
                  <button
                    onClick={() => setActiveTool(isActive ? null : tool.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors text-left ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
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
