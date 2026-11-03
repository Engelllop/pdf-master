import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X, Bold, Italic, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
import { familiaVisible } from '../../lib/textoEditable'
import { opcionesDeFuente } from '../../lib/fuentesInstaladas'
import {
  aplicarEstilo, borrarRango, cambiarTamano, estiloDe, estiloEn, fusionar, insertarTexto, pasoDeTamano,
  textoDe, type EstiloTramo, type Tramo,
} from '../../lib/textoRico'

const BAR_H = 34
const ATTR = 'data-tr'
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify } as const
const ALIGN_TXT = { left: 'izquierda', center: 'el centro', right: 'la derecha', justify: 'ambos lados' } as const
type Alineacion = keyof typeof ALIGN_ICONS

// ---- DOM <-> modelo ---------------------------------------------------------------

function pintar(root: HTMLElement, tramos: readonly Tramo[], zoom: number) {
  root.textContent = ''
  for (const t of tramos) {
    const s = document.createElement('span')
    s.setAttribute(ATTR, '')
    s.dataset.font = t.font
    s.dataset.size = String(t.size)
    s.dataset.color = t.color
    s.dataset.bold = t.bold ? '1' : ''
    s.dataset.italic = t.italic ? '1' : ''
    s.style.fontFamily = `"${familiaVisible(t.font)}"`
    s.style.fontSize = `${t.size * zoom}px`
    s.style.color = t.color
    s.style.fontWeight = t.bold ? '700' : '400'
    s.style.fontStyle = t.italic ? 'italic' : 'normal'
    s.textContent = t.text
    root.appendChild(s)
  }
  // Un salto al final no se ve si no hay nada después: el marcador deja la línea abierta.
  if (textoDe(tramos).endsWith('\n')) root.appendChild(document.createElement('br'))
}

function estiloDeNodo(n: Node, root: HTMLElement): EstiloTramo | null {
  const el = (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement) as HTMLElement | null
  const s = el?.closest<HTMLElement>(`[${ATTR}]`)
  if (!s || !root.contains(s)) return null
  const d = s.dataset
  return { font: d.font ?? '', size: parseFloat(d.size ?? '12') || 12, color: d.color || '#000000', bold: d.bold === '1', italic: d.italic === '1' }
}

/** Lee lo que hay en el editor: texto y estilo de cada trozo. Lo que el navegador
 * escribió fuera de un tramo (al teclear en un editor vacío) toma el estilo vecino. */
function leer(root: HTMLElement, porDefecto: EstiloTramo): Tramo[] {
  const res: Tramo[] = []
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let previo = porDefecto
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    const txt = (n as Text).data
    if (!txt) continue
    const est = estiloDeNodo(n, root) ?? previo
    previo = est
    res.push({ ...est, text: txt })
  }
  return fusionar(res)
}

function desplazamiento(root: HTMLElement, nodo: Node, off: number): number {
  const r = document.createRange()
  r.selectNodeContents(root)
  r.setEnd(nodo, off)
  return r.toString().length
}

function seleccionActual(root: HTMLElement): { ini: number; fin: number } | null {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
  const a = desplazamiento(root, r.startContainer, r.startOffset)
  const b = desplazamiento(root, r.endContainer, r.endOffset)
  return { ini: Math.min(a, b), fin: Math.max(a, b) }
}

function ubicar(root: HTMLElement, pos: number): { nodo: Node; off: number } {
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acum = 0
  let ultimo: Text | null = null
  for (let n = it.nextNode() as Text | null; n; n = it.nextNode() as Text | null) {
    // `<=`: en el borde entre dos tramos se queda al final del primero, y lo que se
    // escriba lleva su estilo (como al escribir tras una palabra en negrita).
    if (pos <= acum + n.data.length) return { nodo: n, off: pos - acum }
    acum += n.data.length
    ultimo = n
  }
  return ultimo ? { nodo: ultimo, off: ultimo.data.length } : { nodo: root, off: 0 }
}

function ponerSeleccion(root: HTMLElement, ini: number, fin: number) {
  const sel = window.getSelection()
  if (!sel) return
  const a = ubicar(root, ini), b = ubicar(root, fin)
  const r = document.createRange()
  r.setStart(a.nodo, a.off)
  r.setEnd(b.nodo, b.off)
  sel.removeAllRanges()
  sel.addRange(r)
}

type Instantanea = { tramos: Tramo[]; ini: number; fin: number }

// ---- Componente -------------------------------------------------------------------

/** Editor de texto del PDF con formato visible: lo que se ve (negrita, color, cuerpo y
 * fuente de cada tramo) es lo que se escribe en el PDF. La barra aplica el formato a lo
 * SELECCIONADO; sin selección vale para lo que se escriba a continuación.
 * Enter = línea nueva, Ctrl+Enter / clic fuera / ✓ = aplicar, Esc = cancelar,
 * Ctrl+B / Ctrl+I = negrita / cursiva, Ctrl+Z / Ctrl+Y = deshacer / rehacer. */
export default function EditorTextoRico({
  x, y, zoom, wrapperWidth, wrapWidth, minHeight, sangria = 0, inicial, estiloBase, align, lineHeight, fuentes, note,
  onAlign, onLineHeight, onCommit, onCancel,
}: {
  x: number
  y: number
  zoom: number
  wrapperWidth: number
  /** Ancho del párrafo en px de display. */
  wrapWidth: number
  minHeight: number
  /** Cuánto más adentro empieza el primer renglón que los demás, en px de display. */
  sangria?: number
  inicial: readonly Tramo[]
  /** Estilo para lo que se escriba si el editor queda vacío. */
  estiloBase: EstiloTramo
  align: Alineacion
  lineHeight: number
  fuentes: readonly string[]
  note?: string
  onAlign: (a: Alineacion) => void
  onLineHeight: (v: number) => void
  onCommit: (tramos: Tramo[]) => void
  onCancel: () => void
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const tramosRef = useRef<Tramo[]>(fusionar(inicial))
  const selRef = useRef<{ ini: number; fin: number }>({ ini: 0, fin: 0 })
  const pendiente = useRef<{ pos: number; patch: Partial<EstiloTramo> } | null>(null)
  const historia = useRef<{ pila: Instantanea[]; i: number; ultimoInput: number }>({ pila: [], i: -1, ultimoInput: 0 })
  const cerrado = useRef(false)
  const base = useRef(estiloBase)
  base.current = estiloBase
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const [vista, setVista] = useState<{ ini: number; fin: number; tick: number }>({ ini: 0, fin: 0, tick: 0 })
  const [alto, setAlto] = useState(minHeight)

  const refrescar = useCallback(() => {
    const raizEl = raiz.current
    if (raizEl) setAlto(raizEl.offsetHeight)
    setVista((v) => ({ ini: selRef.current.ini, fin: selRef.current.fin, tick: v.tick + 1 }))
  }, [])

  const empujar = useCallback((fusionando: boolean) => {
    const h = historia.current
    const snap: Instantanea = { tramos: tramosRef.current.map((t) => ({ ...t })), ...selRef.current }
    const ahora = Date.now()
    if (fusionando && h.i === h.pila.length - 1 && h.i > 0 && ahora - h.ultimoInput < 700) {
      h.pila[h.i] = snap
    } else {
      h.pila = h.pila.slice(0, h.i + 1)
      h.pila.push(snap)
      if (h.pila.length > 150) h.pila.shift()
      h.i = h.pila.length - 1
    }
    h.ultimoInput = fusionando ? ahora : 0
  }, [])

  // Primera pintura, y repintado si cambia el zoom (el tamaño de letra va en px).
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    pintar(el, tramosRef.current, zoom)
    if (!historia.current.pila.length) {
      const fin = textoDe(tramosRef.current).length
      selRef.current = { ini: fin, fin }
      empujar(false)
      el.focus()
      ponerSeleccion(el, fin, fin)
    } else {
      const { ini, fin } = selRef.current
      ponerSeleccion(el, ini, fin)
    }
    refrescar()
  }, [zoom, empujar, refrescar])

  // El alto lo dicen los renglones (con cuerpos mezclados no se puede calcular): se mide.
  useEffect(() => {
    const el = raiz.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // La selección se sigue en el documento: el clic en la barra no la mueve, pero hay
  // que recordarla por si el foco pasa a un selector.
  useEffect(() => {
    const alCambiar = () => {
      const el = raiz.current
      if (!el) return
      const s = seleccionActual(el)
      if (!s) return
      selRef.current = s
      const p = pendiente.current
      if (p && (s.ini !== p.pos || s.fin !== p.pos)) pendiente.current = null
      setVista((v) => (v.ini === s.ini && v.fin === s.fin ? v : { ini: s.ini, fin: s.fin, tick: v.tick + 1 }))
    }
    document.addEventListener('selectionchange', alCambiar)
    return () => document.removeEventListener('selectionchange', alCambiar)
  }, [])

  const volver = useCallback((ini: number, fin: number, enfocar = true) => {
    const el = raiz.current
    if (!el) return
    if (enfocar) el.focus()
    ponerSeleccion(el, ini, fin)
  }, [])

  /** Cambia el modelo (por la barra o el teclado) y repinta con la selección dada. */
  const poner = useCallback((tramos: Tramo[], ini: number, fin: number, enfocar = true) => {
    const el = raiz.current
    if (!el) return
    tramosRef.current = fusionar(tramos)
    selRef.current = { ini, fin }
    pintar(el, tramosRef.current, zoomRef.current)
    if (enfocar) volver(ini, fin)
    empujar(false)
    refrescar()
  }, [empujar, refrescar, volver])

  const aplicar = useCallback((patch: Partial<EstiloTramo>, enfocar = true) => {
    const { ini, fin } = selRef.current
    if (ini !== fin) {
      poner(aplicarEstilo(tramosRef.current, ini, fin, patch), ini, fin, enfocar)
    } else {
      // Sin selección: vale para lo próximo que se escriba.
      pendiente.current = { pos: ini, patch: { ...(pendiente.current?.patch ?? {}), ...patch } }
      if (enfocar) volver(ini, fin)
      refrescar()
    }
  }, [poner, refrescar, volver])

  const tamano = useCallback((dir: 1 | -1) => {
    const { ini, fin } = selRef.current
    if (ini !== fin) {
      poner(cambiarTamano(tramosRef.current, ini, fin, dir), ini, fin)
    } else {
      const actual = pendiente.current?.patch.size ?? estiloEn(tramosRef.current, ini, fin)?.size ?? base.current.size
      aplicar({ size: pasoDeTamano(actual, dir) })
    }
  }, [aplicar, poner])

  const alternar = useCallback((k: 'bold' | 'italic') => {
    const { ini, fin } = selRef.current
    const e = estiloEn(tramosRef.current, ini, fin)
    const pend = pendiente.current?.patch[k]
    // Mixto o apagado → se enciende; encendido en todo → se apaga (como Word).
    const activo = ini === fin ? (pend ?? e?.[k] ?? false) : e?.[k] === true
    aplicar({ [k]: !activo })
  }, [aplicar])

  const deshacerRehacer = useCallback((dir: -1 | 1) => {
    const h = historia.current
    const j = h.i + dir
    if (j < 0 || j >= h.pila.length) return
    h.i = j
    h.ultimoInput = 0
    const s = h.pila[j]
    tramosRef.current = s.tramos.map((t) => ({ ...t }))
    selRef.current = { ini: s.ini, fin: s.fin }
    pendiente.current = null
    const el = raiz.current
    if (!el) return
    pintar(el, tramosRef.current, zoomRef.current)
    volver(s.ini, s.fin)
    refrescar()
  }, [refrescar, volver])

  const confirmar = () => {
    if (cerrado.current) return
    cerrado.current = true
    onCommit(tramosRef.current)
  }
  const cancelar = () => {
    if (cerrado.current) return
    cerrado.current = true
    onCancel()
  }

  // ---- Entrada del teclado ----
  // `beforeinput` nativo: el `onBeforeInput` de React es otro evento (no trae `inputType`).
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const alAntes = (ev: InputEvent) => {
      if (ev.inputType === 'historyUndo') { ev.preventDefault(); deshacerRehacer(-1); return }
      if (ev.inputType === 'historyRedo') { ev.preventDefault(); deshacerRehacer(1); return }
      const p = pendiente.current
      if (p && ev.inputType === 'insertText' && ev.data) {
        // Se escribe con el formato que se activó sin selección. Se hace en el modelo y no
        // en el DOM porque el navegador solo sabe heredar el del tramo vecino.
        ev.preventDefault()
        const { ini, fin } = selRef.current
        const sinSel = fin > ini ? borrarRango(tramosRef.current, ini, fin) : tramosRef.current
        const previo = estiloEn(sinSel, ini, ini)
        const b = base.current
        const est: EstiloTramo = {
          ...(previo ? {
            font: previo.font ?? b.font, size: previo.size ?? b.size, color: previo.color ?? b.color,
            bold: previo.bold ?? false, italic: previo.italic ?? false,
          } : b),
          ...p.patch,
        }
        pendiente.current = null
        poner(insertarTexto(sinSel, ini, ev.data, est), ini + ev.data.length, ini + ev.data.length)
      }
    }
    el.addEventListener('beforeinput', alAntes)
    return () => el.removeEventListener('beforeinput', alAntes)
  }, [deshacerRehacer, poner])

  const alEntrar = () => {
    const el = raiz.current
    if (!el) return
    const previo = tramosRef.current
    const ultimo = previo.length ? estiloDe(previo[previo.length - 1]) : base.current
    tramosRef.current = leer(el, ultimo)
    const s = seleccionActual(el)
    if (s) selRef.current = s
    empujar(true)
    refrescar()
  }

  const alPegar = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const txt = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
    if (txt) document.execCommand('insertText', false, txt)
  }

  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (e.key === 'Enter' && ctrl) { e.preventDefault(); confirmar() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelar() }
    else if (ctrl && k === 'b') { e.preventDefault(); alternar('bold') }
    else if (ctrl && k === 'i') { e.preventDefault(); alternar('italic') }
    else if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); deshacerRehacer(-1) }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); deshacerRehacer(1) }
  }

  // ---- Estado de la barra ----
  const est = estiloEn(tramosRef.current, vista.ini, vista.fin)
  const pend = vista.ini === vista.fin ? pendiente.current?.patch : undefined
  const valor = <K extends keyof EstiloTramo>(k: K): EstiloTramo[K] | undefined =>
    (pend && k in pend ? pend[k] : est && !est.mixto.includes(k) ? est[k] : undefined) as EstiloTramo[K] | undefined
  const negrita = valor('bold') === true
  const cursiva = valor('italic') === true
  const tam = valor('size')
  const color = valor('color')
  const fuente = valor('font')
  const familia = fuente !== undefined ? familiaVisible(fuente) : ''
  const opciones = opcionesDeFuente(fuentes, familia)

  const barW = 400
  const barLeft = Math.max(4, Math.min(x, wrapperWidth - barW - 4))
  const boxH = Math.max(alto, minHeight)
  const barraArriba = y - BAR_H - 8 > 4
  const barTop = barraArriba ? y - BAR_H - 8 : y + boxH + 12
  const ayudaTop = barraArriba ? y + boxH + 10 : barTop + BAR_H + 6

  const keepFocus = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() }
  const btn = 'p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors'
  const toggleBtn = (activo: boolean) => `p-1 rounded-token-sm transition-colors ${activo ? 'bg-selected text-fg' : 'text-muted hover:text-fg hover:bg-hover'}`

  return (
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) confirmar() }}>
      <div className="absolute z-sticky flex items-center gap-0.5 px-1.5 rounded-token border border-border bg-panel shadow-token-lg select-none"
        role="toolbar" aria-label="Formato del texto"
        style={{ left: barLeft, top: barTop, height: BAR_H, width: 'max-content', maxWidth: wrapperWidth - 8 }}>
        <select value={familia} onChange={(e) => { aplicar({ font: e.target.value }); }} aria-label="Fuente"
          className="border border-border rounded-token-sm px-1 py-0.5 text-micro bg-panel text-fg focus:outline-none w-24 shrink-0">
          {familia === '' && <option value="" disabled>—</option>}
          {opciones.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <button {...keepFocus} title="Reducir tamaño" aria-label="Reducir tamaño" className={`${btn} text-micro font-semibold`}
          onClick={() => tamano(-1)}>A</button>
        <span className="text-micro text-fg w-6 text-center tabular" aria-label="Tamaño">{tam !== undefined ? Math.round(tam * 10) / 10 : '—'}</span>
        <button {...keepFocus} title="Aumentar tamaño" aria-label="Aumentar tamaño" className={`${btn} text-base font-semibold`}
          onClick={() => tamano(1)}>A</button>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <button {...keepFocus} title="Negrita (Ctrl+B)" aria-label="Negrita" aria-pressed={negrita} className={toggleBtn(negrita)}
          onClick={() => alternar('bold')}><Bold size={14} /></button>
        <button {...keepFocus} title="Cursiva (Ctrl+I)" aria-label="Cursiva" aria-pressed={cursiva} className={toggleBtn(cursiva)}
          onClick={() => alternar('italic')}><Italic size={14} /></button>
        {(['left', 'center', 'right', 'justify'] as const).map((a) => {
          const Icon = ALIGN_ICONS[a]
          const nombre = a === 'justify' ? 'Justificar' : `Alinear a ${a === 'center' ? ALIGN_TXT[a] : `la ${ALIGN_TXT[a]}`}`
          return (
            <button key={a} {...keepFocus} title={nombre} aria-label={nombre} aria-pressed={align === a}
              className={toggleBtn(align === a)} onClick={() => { onAlign(a); volver(selRef.current.ini, selRef.current.fin) }}><Icon size={14} /></button>
          )
        })}
        <select title="Interlineado" aria-label="Interlineado" value={lineHeight}
          onChange={(e) => { onLineHeight(parseFloat(e.target.value)); volver(selRef.current.ini, selRef.current.fin) }}
          className="border border-border rounded-token-sm px-0.5 py-0.5 text-micro bg-panel text-fg focus:outline-none w-14 shrink-0">
          {Array.from(new Set([1, 1.15, 1.3, 1.5, 2, lineHeight])).sort((a, b) => a - b).map((v) => (
            <option key={v} value={v}>{Math.round(v * 100) / 100}×</option>
          ))}
        </select>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <label title="Color del texto" className="relative w-5 h-5 rounded-full border-2 border-border hover:scale-110 transition-transform shrink-0 cursor-pointer"
          style={{ backgroundColor: color ?? 'transparent', backgroundImage: color ? undefined : 'conic-gradient(#e11 0 25%, #1a1 0 50%, #11e 0 75%, #eb1 0)' }}>
          {/* Mientras el selector de color está abierto no se le devuelve el foco al
              texto en cada cambio: cerraría el selector a mitad del arrastre. */}
          <input type="color" value={color ?? '#000000'} aria-label="Color del texto"
            onChange={(e) => aplicar({ color: e.target.value }, false)}
            onBlur={() => volver(selRef.current.ini, selRef.current.fin)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </label>
        <div className="w-px h-4 mx-0.5 bg-border" />
        <button {...keepFocus} title="Cancelar (Esc)" aria-label="Cancelar" className={btn} onClick={cancelar}><X size={16} /></button>
        <button {...keepFocus} title="Aplicar (Ctrl+Enter)" aria-label="Confirmar" className={`${btn} text-success hover:text-success`} onClick={confirmar}>
          <Check size={16} />
        </button>
      </div>

      <div ref={raiz} role="textbox" aria-multiline="true" aria-label="Texto" spellCheck={false}
        // «plaintext-only»: el navegador no mete su propio formato; los tramos los pone el editor.
        contentEditable={'plaintext-only' as unknown as boolean} suppressContentEditableWarning
        className="absolute z-float outline-none"
        style={{
          left: x, top: y, width: wrapWidth, minHeight,
          // El tamaño del contenedor fija el «puntal» de cada renglón: con el de la página
          // (16 px) cada renglón medía más que en el PDF aunque la letra fuera chica.
          fontSize: estiloBase.size * zoom, fontFamily: `"${familiaVisible(estiloBase.font)}"`,
          lineHeight, textAlign: align, textIndent: align === 'left' || align === 'justify' ? sangria : 0,
          border: '2px solid rgb(var(--fg))', borderRadius: 3, padding: 0,
          whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
          background: 'rgb(var(--paper))', boxSizing: 'content-box',
        }}
        onInput={alEntrar} onPaste={alPegar} onKeyDown={alTeclear} />

      <div aria-hidden="true" className="absolute z-sticky pointer-events-none select-none px-1.5 py-0.5 rounded-token-sm bg-panel/90 border border-border text-micro text-muted whitespace-nowrap shadow-token-sm"
        style={{ left: Math.max(4, Math.min(x, wrapperWidth - 400)), top: ayudaTop }}>
        Seleccioná texto para darle formato · Ctrl+Enter: aplicar · Esc: cancelar{note ? ` · ${note}` : ''}
      </div>
    </div>
  )
}
