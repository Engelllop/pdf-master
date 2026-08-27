import { useEffect, useRef, useState } from 'react'
import { type Annotation } from '../../store/usePdfStore'
import { useStoreSlice } from '../../hooks/useStoreSlice'
import { type PageDims, type ToScreen } from './annotationRender'

const W = 240
const GAP = 12
const TAIL = 9

// Globo de la nota, anclado al icono como un bocadillo. Vive en el wrapper SIN
// escalar para no deformarse con el zoom. No tiene botones: al hacer clic fuera se
// guarda, y si quedó vacía la nota se descarta.
export default function NoteBubble({ ann, docId, pageData, toScreen, scale, wrapperWidth, wrapperHeight, onClose }: {
  ann: Annotation
  docId: string
  pageData: PageDims
  toScreen: ToScreen
  scale: number
  wrapperWidth: number
  wrapperHeight: number
  onClose: () => void
}) {
  const { updateAnnotationUndoable, deleteAnnotation, showToast } = useStoreSlice('updateAnnotationUndoable', 'deleteAnnotation', 'showToast')
  const [text, setText] = useState(ann.text || '')
  const ref = useRef<HTMLDivElement>(null)
  const textRef = useRef(text)
  textRef.current = text

  // El borrador vive en el componente, pero el globo se reutiliza para otra nota si la
  // selección cambia sin pasar por el cierre (el panel de revisión salta a otra marca,
  // por ejemplo): `useState(ann.text)` solo corre al montar, así que la nota nueva
  // aparecía con el texto de la anterior — y al guardar, ese texto se escribía en ella.
  // Solo `ann.id` en las deps, a propósito: con `ann.text` dentro, cualquier cambio del
  // texto en el store (el propio guardado, un deshacer) pisaría el borrador que el
  // usuario está escribiendo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setText(ann.text || '') }, [ann.id])

  const sx = pageData.width / pageData.originalWidth
  const sy = pageData.height / pageData.originalHeight
  const anchor = toScreen(ann.x, ann.y)
  const iconW = (ann.width || 24) * sx * scale
  const iconH = (ann.height || 24) * sy * scale
  const ax = anchor.x * scale
  const ay = anchor.y * scale

  // Debajo del icono si hay sitio; si no, encima. Y siempre dentro de la página.
  const height = 132
  const below = ay + iconH + GAP + height < wrapperHeight || ay - GAP - height < 0
  const top = below ? ay + iconH + GAP : ay - GAP - height
  const left = Math.max(4, Math.min(ax + iconW / 2 - W / 2, Math.max(4, wrapperWidth - W - 4)))
  const tailLeft = Math.max(10, Math.min(ax + iconW / 2 - left - TAIL, W - 2 * TAIL - 10))

  const commit = () => {
    const value = textRef.current.trim()
    if (!value) deleteAnnotation(docId, ann.id)
    else if (value !== (ann.text || '')) updateAnnotationUndoable(docId, ann.id, { text: value })
    onClose()
  }

  // Clic fuera = guardar. Esc = cerrar sin guardar; si había borrador, se avisa.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      // El clic solo cierra: si se dejara pasar y la herramienta Nota sigue fija,
      // ese mismo clic colocaría otra nota encima.
      e.preventDefault()
      e.stopPropagation()
      commit()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      // La herramienta Nota crea la marca vacía y abre el globo, así que Esc en una
      // nota que nunca llegó a guardarse cancela su creación. Antes solo cerraba:
      // quedaba un icono de nota vacío en la página, y viajaba al PDF al guardar.
      if (!(ann.text || '').trim()) {
        deleteAnnotation(docId, ann.id)
        if (textRef.current.trim()) showToast('Nota descartada', 'info')
      } else if (textRef.current !== (ann.text || '')) {
        showToast('Se descarta el borrador', 'info')
      }
      onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
    // `ann.id` y `docId` van en las deps: si el globo pasa a otra nota, los listeners
    // tienen que guardar (o borrar) la de ahora, no la de antes.
  }, [ann.id, ann.text, docId, onClose, showToast])

  const tint = ann.color || '#fbbf24'

  return (
    <div ref={ref} className="absolute z-40" style={{ left, top, width: W }}>
      {/* Cola del globo hacia el icono */}
      <div className="absolute" style={{
        left: tailLeft,
        [below ? 'top' : 'bottom']: -TAIL + 1,
        width: 0, height: 0,
        borderLeft: `${TAIL}px solid transparent`,
        borderRight: `${TAIL}px solid transparent`,
        ...(below
          ? { borderBottom: `${TAIL}px solid ${tint}` }
          : { borderTop: `${TAIL}px solid ${tint}` }),
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))',
      } as React.CSSProperties} />
      <div className="rounded-xl shadow-xl overflow-hidden bg-panel border"
        style={{ borderColor: tint }}>
        <div className="px-3 pt-1.5 pb-0.5 text-micro font-medium tracking-wide uppercase text-muted flex justify-between">
          <span className="truncate">{ann.author || 'Nota'}</span>
          {ann.createdAt && <span className="shrink-0 ml-2 tabular-nums">{new Date(ann.createdAt).toLocaleDateString()}</span>}
        </div>
        <textarea autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí tu comentario…"
          aria-label="Texto de la nota"
          className="w-full bg-panel px-3 pb-2.5 pt-1 text-base text-fg placeholder:text-muted resize-none outline-none"
          style={{ height: height - 30 }} />
      </div>
    </div>
  )
}
