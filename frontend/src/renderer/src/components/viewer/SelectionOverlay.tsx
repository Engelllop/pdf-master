import { type Annotation } from '../../store/usePdfStore'
import { type ResizeCorner } from '../../hooks/useAnnotationDrag'
import { getAnnotationBounds, type PageDims, type ToScreen } from './annotationRender'

export interface ResizeStart {
  id: string
  corner: ResizeCorner
  startX: number
  startY: number
  startW: number
  startH: number
  startBoundsX: number
  startBoundsY: number
}

export interface RotateStart {
  id: string
  startAngle: number
  startRotation: number
  centerX: number
  centerY: number
}

const HANDLE_SIZE = 8

// Caja de selección + 8 handles de redimensión + handle de rotación (solo imágenes).
// Vive dentro del <svg> de la página; se usa tanto en la página izquierda como en la
// derecha de la vista doble (antes eran dos bloques duplicados de ~85 líneas).
export default function SelectionOverlay({ ann, pageData, toScreen, onResizeStart, onRotateStart }: {
  ann: Annotation
  pageData: PageDims
  toScreen: ToScreen
  onResizeStart: (s: ResizeStart) => void
  onRotateStart?: (s: RotateStart) => void
}) {
  const bounds = getAnnotationBounds(ann, pageData, toScreen)
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null

  const hs = HANDLE_SIZE / 2
  const corners = [
    { key: 'nw' as const, x: bounds.x - hs, y: bounds.y - hs, cursor: 'nwse-resize' },
    { key: 'n'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y - hs, cursor: 'ns-resize' },
    { key: 'ne' as const, x: bounds.x + bounds.w - hs, y: bounds.y - hs, cursor: 'nesw-resize' },
    { key: 'e'  as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
    { key: 'se' as const, x: bounds.x + bounds.w - hs, y: bounds.y + bounds.h - hs, cursor: 'nwse-resize' },
    { key: 's'  as const, x: bounds.x + bounds.w / 2 - hs, y: bounds.y + bounds.h - hs, cursor: 'ns-resize' },
    { key: 'sw' as const, x: bounds.x - hs, y: bounds.y + bounds.h - hs, cursor: 'nesw-resize' },
    { key: 'w'  as const, x: bounds.x - hs, y: bounds.y + bounds.h / 2 - hs, cursor: 'ew-resize' },
  ]

  const rotCx = bounds.x + bounds.w / 2
  const rotHy = bounds.y - 20

  return (
    <>
      <rect
        x={bounds.x - 4} y={bounds.y - 4}
        width={bounds.w + 8} height={bounds.h + 8}
        fill="none" stroke="#3b82f6" strokeWidth={2}
        strokeDasharray="4 2" rx={4}
        pointerEvents="none"
      />
      {corners.map((c) => (
        <rect
          key={c.key}
          x={c.x} y={c.y}
          width={HANDLE_SIZE} height={HANDLE_SIZE}
          fill="#3b82f6" stroke="white" strokeWidth={1}
          style={{ cursor: c.cursor }}
          onMouseDown={(e) => {
            e.stopPropagation()
            onResizeStart({
              id: ann.id,
              corner: c.key,
              startX: e.nativeEvent.offsetX + c.x,
              startY: e.nativeEvent.offsetY + c.y,
              startW: bounds.w,
              startH: bounds.h,
              startBoundsX: bounds.x,
              startBoundsY: bounds.y,
            })
          }}
        />
      ))}
      {ann.type === 'image' && onRotateStart && (
        <>
          <line x1={rotCx} y1={bounds.y} x2={rotCx} y2={rotHy} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
          <circle
            cx={rotCx} cy={rotHy} r={6}
            fill="#10b981" stroke="white" strokeWidth={1}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              const centerX = bounds.x + bounds.w / 2
              const centerY = bounds.y + bounds.h / 2
              const startAngle = Math.atan2(e.nativeEvent.offsetY - centerY, e.nativeEvent.offsetX - centerX)
              onRotateStart({
                id: ann.id,
                startAngle,
                startRotation: ann.rotation || 0,
                centerX,
                centerY,
              })
            }}
          />
        </>
      )}
    </>
  )
}
