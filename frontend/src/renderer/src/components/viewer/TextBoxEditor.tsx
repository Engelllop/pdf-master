import { useLayoutEffect, useRef, useState } from 'react'
import { Check, X, Trash2, Bold, Italic, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from 'lucide-react'
import { FONT_OPTIONS } from '../../lib/fonts'
import { type TextStyle } from '../../store/usePdfStore'

const BAR_H = 34

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const
const LIST_NEXT = { none: 'bullet', bullet: 'number', number: 'none' } as const

let lienzo: HTMLCanvasElement | null = null
/** Ancho real de la línea más larga con la fuente del editor. La estimación por
 * cantidad de letras dejaba el cuadro corto con mayúsculas y largo con «iiii». */
function anchoDeLineas(lineas: string[], fuenteCss: string): number | null {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null
  try {
    lienzo ??= document.createElement('canvas')
    const ctx = lienzo.getContext('2d')
    if (!ctx) return null
    ctx.font = fuenteCss
    return lineas.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0)
  } catch {
    return null
  }
}

// Editor de texto in-situ estilo Acrobat: caja con el texto renderizado a la
// fuente/tamaño/color/estilos reales (WYSIWYG) + mini-toolbar flotante. Vive en el
// wrapper SIN escalar: el texto se dibuja a fontSize*zoom para coincidir 1:1 con el
// resultado, pero la toolbar no hace zoom con el documento.
// Enter = nueva línea, Esc = cancelar, Ctrl+Enter / clic fuera / ✓ = confirmar,
// Ctrl+B / Ctrl+I = negrita / cursiva.
//
// Con `wrapWidth` el cuadro tiene ancho fijo y el texto se AJUSTA a él, creciendo
// hacia abajo (un cuadro arrastrado, o un párrafo del PDF). Sin él, crece con la
// línea más larga.
export default function TextBoxEditor({
  x, y, zoom, wrapperWidth, value, onChange, onCommit, onCancel, onDelete,
  fontFamily, fontSize, color, style, onFontFamily, onFontSize, onColor, onStyle,
  wrapWidth, minHeight, opaque = false, fontOptions = FONT_OPTIONS, showList = true, note,
}: {
  x: number // px de display (ya escalados) dentro del wrapper
  y: number
  zoom: number // px de display por punto PDF
  wrapperWidth: number
  value: string
  onChange: (v: string) => void
  /** Recibe la caja que ocupó el texto, en puntos PDF. */
  onCommit: (medida: { width: number; height: number }) => void
  onCancel: () => void
  onDelete?: () => void
  fontFamily: string
  fontSize: number
  color: string
  style: TextStyle
  onFontFamily: (f: string) => void
  onFontSize: (s: number) => void
  onColor: (c: string) => void
  onStyle: (s: Partial<TextStyle>) => void
  /** Ancho de ajuste en px de display. */
  wrapWidth?: number
  /** Alto mínimo en px de display (el del párrafo original, que hay que tapar). */
  minHeight?: number
  /** Fondo de papel: al editar texto del PDF, el original no se ve debajo. */
  opaque?: boolean
  fontOptions?: readonly string[]
  showList?: boolean
  /** Aviso corto bajo las teclas (p. ej. qué parte del PDF se está editando). */
  note?: string
}) {
  const fpx = fontSize * zoom
  const lines = value.split('\n')
  const fuenteCss = `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${fpx}px ${fontFamily}`
  const medido = wrapWidth ? null : anchoDeLineas(lines, fuenteCss)
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const autoW = Math.max(fpx * 7, medido != null ? medido + fpx * 1.2 : (longest + 2) * fpx * 0.58 * (style.bold ? 1.06 : 1))
  const boxW = wrapWidth ?? autoW
  const altoPorLineas = lines.length * fpx * style.lineHeight + fpx * 0.4

  // Con ajuste, el alto lo dice el navegador (las líneas que salen del ajuste no
  // están en el texto): se mide después de pintar.
  const ref = useRef<HTMLTextAreaElement>(null)
  const [altoAjustado, setAltoAjustado] = useState(altoPorLineas)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !wrapWidth) return
    // Se repone el alto que había: si se dejara vacío, React no lo vuelve a escribir
    // cuando el alto medido no cambia, y el cuadro quedaba en dos renglones.
    const previo = el.style.height
    el.style.height = '0px'
    const h = el.scrollHeight
    el.style.height = previo
    setAltoAjustado(Math.max(h, fpx * style.lineHeight + fpx * 0.4))
  }, [value, wrapWidth, fpx, style.lineHeight, style.bold, style.italic, fontFamily])
  const boxH = Math.max(wrapWidth ? altoAjustado : altoPorLineas, minHeight ?? 0)

  const confirmar = () => onCommit({ width: boxW / zoom, height: boxH / zoom })

  // Ancho solo para no salirse del papel: la barra se ajusta a su contenido (antes
  // era fijo de 470 px y dejaba un hueco vacío antes de los botones de la derecha).
  const barW = (onDelete ? 420 : 390) - (showList ? 0 : 26)
  const barLeft = Math.max(4, Math.min(x, wrapperWidth - barW - 4))
  const barraArriba = y - BAR_H - 8 > 4
  const barTop = barraArriba ? y - BAR_H - 8 : y + boxH + 8
  const ayudaTop = barraArriba ? y + boxH + 6 : barTop + BAR_H + 6

  // Los botones de la barra no deben robarle el foco al textarea: al pulsar Negrita
  // el cursor se perdía y lo que se seguía escribiendo iba al botón (con Espacio
  // llegaba a re-pulsarlo). Los `select` y el color NO llevan esto: necesitan el foco
  // para desplegarse.
  const keepFocus = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() }
  const btn = 'p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors'
  const toggleBtn = (active: boolean) => `p-1 rounded-token-sm transition-colors ${active ? 'bg-selected text-fg' : 'text-muted hover:text-fg hover:bg-hover'}`
  const ListIcon = style.listStyle === 'number' ? ListOrdered : List

  return (
    // El contenedor confirma solo cuando el foco sale del editor completo: mover el
    // foco del textarea a la toolbar (select de fuente, botones) no debe confirmar.
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) confirmar() }}>
      <div className="absolute z-sticky flex items-center gap-0.5 px-1.5 rounded-token border border-border bg-panel shadow-token-lg select-none"
        style={{ left: barLeft, top: barTop, height: BAR_H, width: 'max-content', maxWidth: wrapperWidth - 8 }}>
        <select value={fontFamily} onChange={(e) => onFontFamily(e.target.value)} aria-label="Fuente"
          className="border border-border rounded-token-sm px-1 py-0.5 text-micro bg-panel text-fg focus:outline-none w-24 shrink-0">
          {fontOptions.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <button {...keepFocus} title="Reducir tamaño" aria-label="Reducir tamaño" className={`${btn} text-micro font-semibold`}
          onClick={() => onFontSize(Math.max(4, fontSize - (fontSize > 12 ? 2 : 1)))}>A</button>
        <span className="text-micro text-fg w-6 text-center tabular">{Math.round(fontSize * 10) / 10}</span>
        <button {...keepFocus} title="Aumentar tamaño" aria-label="Aumentar tamaño" className={`${btn} text-base font-semibold`}
          onClick={() => onFontSize(Math.min(72, fontSize + (fontSize >= 12 ? 2 : 1)))}>A</button>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <button {...keepFocus} title="Negrita (Ctrl+B)" aria-label="Negrita" aria-pressed={style.bold} className={toggleBtn(style.bold)}
          onClick={() => onStyle({ bold: !style.bold })}><Bold size={14} /></button>
        <button {...keepFocus} title="Cursiva (Ctrl+I)" aria-label="Cursiva" aria-pressed={style.italic} className={toggleBtn(style.italic)}
          onClick={() => onStyle({ italic: !style.italic })}><Italic size={14} /></button>
        {/* Las tres alineaciones a la vista: el botón que rotaba obligaba a adivinar */}
        {(['left', 'center', 'right'] as const).map((a) => {
          const Icon = ALIGN_ICONS[a]
          return (
            <button key={a} {...keepFocus} title={`Alinear a la ${a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'}`}
              aria-label={`Alinear a la ${a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'}`}
              aria-pressed={style.align === a}
              className={toggleBtn(style.align === a)} onClick={() => onStyle({ align: a })}><Icon size={14} /></button>
          )
        })}
        {showList && (
          <button {...keepFocus} title={style.listStyle === 'none' ? 'Lista' : style.listStyle === 'bullet' ? 'Viñetas → numerada' : 'Quitar lista'}
            aria-label={style.listStyle === 'none' ? 'Lista' : style.listStyle === 'bullet' ? 'Viñetas → numerada' : 'Quitar lista'}
            className={toggleBtn(style.listStyle !== 'none')}
            onClick={() => onStyle({ listStyle: LIST_NEXT[style.listStyle] })}><ListIcon size={14} /></button>
        )}
        <select title="Interlineado" aria-label="Interlineado" value={style.lineHeight}
          onChange={(e) => onStyle({ lineHeight: parseFloat(e.target.value) })}
          className="border border-border rounded-token-sm px-0.5 py-0.5 text-micro bg-panel text-fg focus:outline-none w-14 shrink-0">
          {/* El interlineado de un párrafo del PDF no suele ser uno de la lista: se
              ofrece el suyo para que confirmar sin tocar nada no lo cambie. */}
          {Array.from(new Set([1, 1.15, 1.3, 1.5, 2, style.lineHeight])).sort((a, b) => a - b).map((v) => (
            <option key={v} value={v}>{Math.round(v * 100) / 100}×</option>
          ))}
        </select>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <label title="Color" className="relative w-5 h-5 rounded-full border-2 border-border hover:scale-110 transition-transform shrink-0 cursor-pointer"
          style={{ backgroundColor: color }}>
          <input type="color" value={color} onChange={(e) => onColor(e.target.value)}
            aria-label="Color del texto"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </label>
        <div className="w-px h-4 mx-0.5 bg-border" />
        {onDelete && (
          <button {...keepFocus} title="Eliminar texto" aria-label="Eliminar texto" className={`${btn} hover:text-danger`} onClick={onDelete}><Trash2 size={14} /></button>
        )}
        <button {...keepFocus} title="Cancelar (Esc)" aria-label="Cancelar" className={btn} onClick={onCancel}><X size={16} /></button>
        <button {...keepFocus} title="Aplicar (Ctrl+Enter)" aria-label="Confirmar" className={`${btn} text-success hover:text-success`} onClick={confirmar}>
          <Check size={16} />
        </button>
      </div>

      <textarea ref={ref} autoFocus
        className="absolute z-float outline-none resize-none overflow-hidden"
        style={{
          left: x, top: y, fontSize: fpx, fontFamily, color,
          width: boxW, height: boxH, lineHeight: style.lineHeight,
          fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? 'italic' : 'normal',
          textAlign: style.align,
          border: '2px solid rgb(var(--fg))', borderRadius: 3,
          padding: 0, caretColor: color,
          // Ajuste igual que la marca dibujada (pre-wrap + break-word): lo que se ve
          // al escribir es lo que queda.
          whiteSpace: wrapWidth ? 'pre-wrap' : 'pre', overflowWrap: wrapWidth ? 'break-word' : 'normal',
          background: opaque ? 'rgb(var(--paper))' : 'transparent',
          boxSizing: 'content-box',
        }}
        placeholder="Escribí acá…" value={value}
        aria-label="Texto"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmar() }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); onStyle({ bold: !style.bold }) }
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); onStyle({ italic: !style.italic }) }
        }} />

      {/* Las teclas a la vista: «Enter guarda» era lo que se esperaba y no lo que hace. */}
      <div aria-hidden="true" className="absolute z-sticky pointer-events-none select-none px-1.5 py-0.5 rounded-token-sm bg-panel/90 border border-border text-micro text-muted whitespace-nowrap shadow-token-sm"
        style={{ left: Math.max(4, Math.min(x, wrapperWidth - 330)), top: ayudaTop }}>
        Enter: línea nueva · Ctrl+Enter: aplicar · Esc: cancelar{note ? ` · ${note}` : ''}
      </div>
    </div>
  )
}
