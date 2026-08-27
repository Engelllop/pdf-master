import { Check, X, Trash2, Bold, Italic, AlignLeft, AlignCenter, AlignRight, List, ListOrdered } from 'lucide-react'
import { FONT_OPTIONS } from '../../lib/fonts'
import { type TextStyle } from '../../store/usePdfStore'

const BAR_H = 34

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const
const LIST_NEXT = { none: 'bullet', bullet: 'number', number: 'none' } as const

// Editor de texto in-situ estilo Acrobat: caja transparente con el texto renderizado
// a la fuente/tamaño/color/estilos reales (WYSIWYG) + mini-toolbar flotante. Vive en
// el wrapper SIN escalar: el texto se dibuja a fontSize*zoom para coincidir 1:1 con
// la anotación final, pero la toolbar no hace zoom con el documento.
// Enter = nueva línea, Esc = cancelar, Ctrl+Enter / clic fuera / ✓ = confirmar,
// Ctrl+B / Ctrl+I = negrita / cursiva.
export default function TextBoxEditor({
  x, y, zoom, wrapperWidth, value, onChange, onCommit, onCancel, onDelete,
  fontFamily, fontSize, color, style, onFontFamily, onFontSize, onColor, onStyle,
}: {
  x: number // px de display (ya escalados) dentro del wrapper
  y: number
  zoom: number // px de display por punto PDF
  wrapperWidth: number
  value: string
  onChange: (v: string) => void
  onCommit: () => void
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
}) {
  const fpx = fontSize * zoom
  const lines = value.split('\n')
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const boxW = Math.max(fpx * 7, (longest + 2) * fpx * 0.58 * (style.bold ? 1.06 : 1))
  const boxH = lines.length * fpx * style.lineHeight + fpx * 0.4

  // Ancho solo para no salirse del papel: la barra se ajusta a su contenido (antes
  // era fijo de 470 px y dejaba un hueco vacío antes de los botones de la derecha).
  const barW = onDelete ? 420 : 390
  const barLeft = Math.max(4, Math.min(x, wrapperWidth - barW - 4))
  const barTop = y - BAR_H - 8 > 4 ? y - BAR_H - 8 : y + boxH + 8

  // Los botones de la barra no deben robarle el foco al textarea: al pulsar Negrita
  // el cursor se perdía y lo que se seguía escribiendo iba al botón (con Espacio
  // llegaba a re-pulsarlo). Los `select` y el color NO llevan esto: necesitan el foco
  // para desplegarse.
  const keepFocus = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() }
  const btn = 'p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors'
  const toggleBtn = (active: boolean) => `p-1 rounded-token-sm transition-colors ${active ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg hover:bg-hover'}`
  const ListIcon = style.listStyle === 'number' ? ListOrdered : List

  return (
    // El contenedor confirma solo cuando el foco sale del editor completo: mover el
    // foco del textarea a la toolbar (select de fuente, botones) no debe confirmar.
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit() }}>
      <div className="absolute z-sticky flex items-center gap-0.5 px-1.5 rounded-token border border-border bg-panel shadow-token-lg select-none"
        style={{ left: barLeft, top: barTop, height: BAR_H, width: 'max-content', maxWidth: wrapperWidth - 8 }}>
        <select value={fontFamily} onChange={(e) => onFontFamily(e.target.value)}
          className="border border-border rounded-token-sm px-1 py-0.5 text-micro bg-panel text-fg focus:outline-none w-24 shrink-0">
          {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <button {...keepFocus} title="Reducir tamaño" aria-label="Reducir tamaño" className={`${btn} text-micro font-semibold`}
          onClick={() => onFontSize(Math.max(4, fontSize - 2))}>A</button>
        <span className="text-micro text-fg w-5 text-center tabular">{fontSize}</span>
        <button {...keepFocus} title="Aumentar tamaño" aria-label="Aumentar tamaño" className={`${btn} text-base font-semibold`}
          onClick={() => onFontSize(Math.min(72, fontSize + 2))}>A</button>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <button {...keepFocus} title="Negrita (Ctrl+B)" aria-label="Negrita" className={toggleBtn(style.bold)}
          onClick={() => onStyle({ bold: !style.bold })}><Bold size={14} /></button>
        <button {...keepFocus} title="Cursiva (Ctrl+I)" aria-label="Cursiva" className={toggleBtn(style.italic)}
          onClick={() => onStyle({ italic: !style.italic })}><Italic size={14} /></button>
        {/* Las tres alineaciones a la vista: el botón que rotaba obligaba a adivinar */}
        {(['left', 'center', 'right'] as const).map((a) => {
          const Icon = ALIGN_ICONS[a]
          return (
            <button key={a} {...keepFocus} title={`Alinear a la ${a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'}`}
              aria-label={`Alinear a la ${a === 'left' ? 'izquierda' : a === 'center' ? 'centro' : 'derecha'}`}
              className={toggleBtn(style.align === a)} onClick={() => onStyle({ align: a })}><Icon size={14} /></button>
          )
        })}
        <button {...keepFocus} title={style.listStyle === 'none' ? 'Lista' : style.listStyle === 'bullet' ? 'Viñetas → numerada' : 'Quitar lista'}
          aria-label={style.listStyle === 'none' ? 'Lista' : style.listStyle === 'bullet' ? 'Viñetas → numerada' : 'Quitar lista'}
          className={toggleBtn(style.listStyle !== 'none')}
          onClick={() => onStyle({ listStyle: LIST_NEXT[style.listStyle] })}><ListIcon size={14} /></button>
        <select title="Interlineado" aria-label="Interlineado" value={style.lineHeight}
          onChange={(e) => onStyle({ lineHeight: parseFloat(e.target.value) })}
          className="border border-border rounded-token-sm px-0.5 py-0.5 text-micro bg-panel text-fg focus:outline-none w-12 shrink-0">
          {[1, 1.15, 1.3, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
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
        <button {...keepFocus} title="Confirmar (Ctrl+Enter)" aria-label="Confirmar" className={`${btn} text-success hover:text-success`} onClick={onCommit}>
          <Check size={16} />
        </button>
      </div>

      <textarea autoFocus
        className="absolute z-float bg-transparent outline-none resize-none overflow-hidden"
        style={{
          left: x, top: y, fontSize: fpx, fontFamily, color,
          width: boxW, height: boxH, lineHeight: style.lineHeight,
          fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? 'italic' : 'normal',
          textAlign: style.align,
          border: '2px solid rgb(var(--fg))', borderRadius: 3,
          padding: 0, whiteSpace: 'pre', caretColor: color,
        }}
        placeholder="Escribí acá…" value={value}
        aria-label="Texto"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit() }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); onStyle({ bold: !style.bold }) }
          else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); onStyle({ italic: !style.italic }) }
        }} />
    </div>
  )
}
