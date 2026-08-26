import { type Annotation } from '../../store/usePdfStore'
import { type ResizeCorner } from '../../hooks/useAnnotationDrag'
import { getAnnotationBounds, type PageDims, type ToScreen } from './annotationRender'
import { SEL, SEL_PAPER } from '../../lib/selectionChrome'

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
// El cuadradito visible mide 8 px: agarrarlo en un plano denso era una pelea. La zona
// sensible es mayor y transparente; el cuadrado solo se dibuja.
const HANDLE_HIT = 20

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
        fill="none" stroke={SEL} strokeWidth={2}
        strokeDasharray="4 2" rx={4}
        pointerEvents="none"
      />
      {corners.map((c) => {
        const hitX = c.x + HANDLE_SIZE / 2 - HANDLE_HIT / 2
        const hitY = c.y + HANDLE_SIZE / 2 - HANDLE_HIT / 2
        return (
          <g key={c.key}>
            <rect
              x={c.x} y={c.y}
              width={HANDLE_SIZE} height={HANDLE_SIZE}
              fill={SEL} stroke={SEL_PAPER} strokeWidth={1}
              pointerEvents="none"
            />
            <rect
              x={hitX} y={hitY}
              width={HANDLE_HIT} height={HANDLE_HIT}
              fill="transparent"
              style={{ cursor: c.cursor }}
              onMouseDown={(e) => {
                e.stopPropagation()
                onResizeStart({
                  id: ann.id,
                  corner: c.key,
                  startX: e.nativeEvent.offsetX + hitX,
                  startY: e.nativeEvent.offsetY + hitY,
                  startW: bounds.w,
                  startH: bounds.h,
                  startBoundsX: bounds.x,
                  startBoundsY: bounds.y,
                })
              }}
            />
          </g>
        )
      })}
      {ann.type === 'image' && onRotateStart && (
        <>
          <line x1={rotCx} y1={bounds.y} x2={rotCx} y2={rotHy} stroke={SEL} strokeWidth={1} strokeDasharray="2 2" pointerEvents="none" />
          <circle
            cx={rotCx} cy={rotHy} r={6}
            fill={SEL} stroke={SEL_PAPER} strokeWidth={1}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              const centerX = bounds.x + bounds.w / 2
              const centerY = bounds.y + bounds.h / 2
              // El ángulo de arranque se toma del propio tirador. Antes salía de
              // `offsetX/offsetY`, que van referidos a la caja del círculo (valores de
              // 0 a 12) y se restaban contra un centro en coordenadas del SVG: la
              // imagen pegaba un giro al empezar a arrastrar.
              const startAngle = Math.atan2(rotHy - centerY, rotCx - centerX)
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
