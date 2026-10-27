import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Stamp, Trash2 } from 'lucide-react'
import {
  DialogShell, DialogHeader, DialogFooter, SegmentedGroup, btnPrimary, btnGhost, fieldInput, nativeAccent,
} from './panelUi'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { apiFetch } from '../lib/api'
import { parsePagesField } from '../lib/pageRange'
import { quitarSelloUndoable, selloUndoable } from '../lib/pageUndo'
import { mensajeDeError } from '../lib/format'
import {
  ETIQUETA_CAPA, PT_POR_MM, SPEC_INICIAL, type CapaSello, type SelloSpec, type ZonaSello,
} from '../lib/sellos'

const CLAVE_RECUERDO = 'pdfmaster.sellos.ultimo'

function recordar(): Partial<Record<CapaSello, SelloSpec>> {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECUERDO) || '{}') } catch { return {} }
}
function guardarRecuerdo(capa: CapaSello, spec: SelloSpec) {
  try { localStorage.setItem(CLAVE_RECUERDO, JSON.stringify({ ...recordar(), [capa]: spec })) } catch { /* sin almacenamiento */ }
}

const ZONAS_ARRIBA: ZonaSello[] = ['tl', 'tc', 'tr']
const ZONAS_ABAJO: ZonaSello[] = ['bl', 'bc', 'br']
const NOMBRE_ZONA: Record<ZonaSello, string> = {
  tl: 'Arriba a la izquierda', tc: 'Arriba al centro', tr: 'Arriba a la derecha',
  bl: 'Abajo a la izquierda', bc: 'Abajo al centro', br: 'Abajo a la derecha',
}
const VARIABLES: Array<[string, string]> = [
  ['{n}', 'Número de página'], ['{total}', 'Total de páginas'], ['{fecha}', 'Fecha de hoy'], ['{archivo}', 'Nombre del archivo'],
]
const FORMATOS_NUMERO: Array<[string, string]> = [
  ['{n}', '1'],
  ['{n} / {total}', '1 / 10'],
  ['Página {n} de {total}', 'Página 1 de 10'],
  ['Pág. {n}', 'Pág. 1'],
  ['{n:6}', 'Bates 000001'],
]
const FUENTES = ['Helvetica', 'Times', 'Courier']

const mm = (pt?: number) => Math.round(((pt ?? 0) / PT_POR_MM) * 10) / 10
const pt = (mmv: number) => mmv * PT_POR_MM

/**
 * Encabezado y pie, numeración y marca de agua en un solo diálogo, con la vista
 * previa que dibuja el motor sobre una copia de la página (el mismo código que al
 * aplicar, así que no miente). Cada uno va en su capa del PDF: aplicar de nuevo
 * reemplaza, «Quitar» lo saca, y el diálogo se abre con lo que ya está aplicado.
 *
 * Antes eran tres formularios de una o dos líneas sin tamaño, posición ni vista
 * previa; el encabezado y los números caían en el mismo sitio, el pie a 2,5 mm del
 * borde, y nada se podía quitar después de guardar.
 */
export default function SellosDialog({ capaInicial, onClose }: { capaInicial: CapaSello; onClose: () => void }) {
  const { docs, activeDocId, showToast } = useStoreSlice('docs', 'activeDocId', 'showToast')
  const doc = docs.find((d) => d.doc_id === activeDocId)
  const docId = doc?.doc_id
  const [capa, setCapa] = useState<CapaSello>(capaInicial)
  const [specs, setSpecs] = useState<Record<CapaSello, SelloSpec>>(() => {
    const r = recordar()
    return { encabezado: { ...SPEC_INICIAL.encabezado, ...r.encabezado }, numeracion: { ...SPEC_INICIAL.numeracion, ...r.numeracion }, marca: { ...SPEC_INICIAL.marca, ...r.marca } }
  })
  const [rangos, setRangos] = useState<Record<CapaSello, string>>({ encabezado: '', numeracion: '', marca: '' })
  const [aplicadas, setAplicadas] = useState<Record<CapaSello, boolean>>({ encabezado: false, numeracion: false, marca: false })
  const [pagina, setPagina] = useState(doc?.currentPage ?? 0)
  const [preview, setPreview] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  // Qué parte de la hoja se ve: entera, o la franja de arriba / abajo ampliada (un
  // encabezado de 9 pt en un plano de 36 in mide 2 px en la hoja entera).
  const [area, setArea] = useState<'full' | 'top' | 'bottom'>('full')
  // Fuerza una vista previa nueva cuando cambia el documento sin cambiar los ajustes
  // (al quitar la capa, por ejemplo): si no, quedaba «Preparando…» para siempre.
  const [recarga, setRecarga] = useState(0)
  const marco = useRef<HTMLDivElement>(null)
  const ultimoCampo = useRef<{ input: HTMLInputElement; zona: ZonaSello } | null>(null)

  const spec = specs[capa]
  const cambiar = (c: Partial<SelloSpec>) => setSpecs((s) => ({ ...s, [capa]: { ...s[capa], ...c } }))
  const cambiarZona = (z: ZonaSello, v: string) => cambiar({ zones: { ...(spec.zones || {}), [z]: v } })

  // Lo que ya está aplicado en el documento manda sobre lo recordado.
  useEffect(() => {
    if (!docId) return
    let vivo = true
    apiFetch(`/pdf/stamps/${docId}`).then((r) => (r.ok ? r.json() : null)).then((estado: Record<CapaSello, SelloSpec | null> | null) => {
      if (!vivo || !estado) return
      setAplicadas({ encabezado: !!estado.encabezado, numeracion: !!estado.numeracion, marca: !!estado.marca })
      setSpecs((s) => {
        const n = { ...s }
        for (const k of Object.keys(estado) as CapaSello[]) {
          const e = estado[k]
          if (e) n[k] = { ...SPEC_INICIAL[k], ...e }
        }
        return n
      })
      setRangos((rg) => {
        const n = { ...rg }
        for (const k of Object.keys(estado) as CapaSello[]) {
          const pages = estado[k]?.pages
          if (pages?.length) n[k] = compactar(pages)
        }
        return n
      })
    }).catch(() => {})
    return () => { vivo = false }
  }, [docId])

  // Vista previa: el motor dibuja la página con el sello sobre una copia. Con
  // rebote, para no pedir un PNG por tecla.
  const specPreview = useMemo(() => JSON.stringify(spec), [spec])
  const urlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!docId) return
    let vivo = true
    setCargando(true)
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/pdf/stamps/preview/${docId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            capa, spec, page_num: pagina, area: capa === 'marca' ? 'full' : area,
            width: Math.round((capa !== 'marca' && area !== 'full' ? 1400 : 520) * Math.min(2, window.devicePixelRatio || 1)),
          }),
        })
        if (!r.ok || !vivo) return
        const url = URL.createObjectURL(await r.blob())
        if (!vivo) { URL.revokeObjectURL(url); return }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPreview(url)
      } catch { /* la vista previa es ayuda: si falla, se aplica igual */ } finally {
        if (vivo) setCargando(false)
      }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
    // `spec` entra por su JSON (`specPreview`): un objeto nuevo con los mismos valores
    // no tiene que pedir otro PNG.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, capa, specPreview, pagina, area, recarga])
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  if (!doc) return null
  const total = doc.page_count

  const aplicar = async () => {
    const pages = parsePagesField(rangos[capa], total)
    if (pages === null) { showToast(`Rango de páginas inválido (el documento tiene ${total})`, 'error'); return }
    if (capa === 'marca' && !(spec.text || '').trim()) { showToast('Escribí el texto de la marca de agua', 'info'); return }
    if (capa !== 'marca' && !Object.values(spec.zones || {}).some((v) => (v || '').trim())) {
      showToast('Escribí el texto en al menos una posición', 'info'); return
    }
    setTrabajando(true)
    try {
      const { pages: _p, ...limpio } = spec
      await selloUndoable(doc.doc_id, capa, limpio, pages)
      guardarRecuerdo(capa, limpio)
      showToast(`${ETIQUETA_CAPA[capa]} aplicado${pages ? ` en ${pages.length} página(s)` : ''}. Ctrl+Z deshace.`, 'success')
      onClose()
    } catch (err) {
      showToast('Error: ' + mensajeDeError(err), 'error')
    } finally {
      setTrabajando(false)
    }
  }

  const quitar = async () => {
    setTrabajando(true)
    try {
      const n = await quitarSelloUndoable(doc.doc_id, capa)
      setAplicadas((a) => ({ ...a, [capa]: false }))
      showToast(n ? `${ETIQUETA_CAPA[capa]} quitado de ${n} página(s). Ctrl+Z deshace.` : 'No había nada que quitar', n ? 'success' : 'info')
      setRecarga((n) => n + 1)
    } catch (err) {
      showToast('Error: ' + mensajeDeError(err), 'error')
    } finally {
      setTrabajando(false)
    }
  }

  const insertarVariable = (v: string) => {
    const campo = ultimoCampo.current
    if (!campo) return
    const { input, zona } = campo
    const a = input.selectionStart ?? input.value.length
    const b = input.selectionEnd ?? a
    const nuevo = input.value.slice(0, a) + v + input.value.slice(b)
    cambiarZona(zona, nuevo)
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(a + v.length, a + v.length) })
  }

  const campoZona = (z: ZonaSello) => (
    <input key={z} type="text" value={spec.zones?.[z] || ''} aria-label={NOMBRE_ZONA[z]} placeholder={NOMBRE_ZONA[z].replace(/^(Arriba|Abajo) /, '')}
      onChange={(e) => cambiarZona(z, e.target.value)}
      onFocus={(e) => { ultimoCampo.current = { input: e.currentTarget, zona: z } }}
      className={`${fieldInput} min-w-0 text-mini ${z.endsWith('c') ? 'text-center' : z.endsWith('r') ? 'text-right' : ''}`} />
  )

  const tipografia = (
    <Fila etiqueta="Texto">
      <select value={familiaDe(spec.font)} onChange={(e) => cambiar({ font: e.target.value })} aria-label="Fuente"
        className={`${fieldInput} text-mini w-28`}>
        {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      {capa !== 'marca' || (spec.fontsize ?? 0) > 0 ? (
        <label className="flex items-center gap-1 text-mini text-muted">
          <input type="number" min={4} max={400} step={0.5} value={spec.fontsize ?? 10} aria-label="Tamaño en puntos"
            onChange={(e) => cambiar({ fontsize: Math.max(capa === 'marca' ? 0 : 4, parseFloat(e.target.value) || 0) })}
            className={`${fieldInput} w-16 text-mini`} /> pt
        </label>
      ) : null}
      <label className="flex items-center gap-1 text-mini cursor-pointer">
        <input type="checkbox" checked={!!spec.bold} onChange={(e) => cambiar({ bold: e.target.checked })} style={nativeAccent} /> Negrita
      </label>
      <label title="Color" className="relative w-7 h-7 rounded-token-sm border border-border-control cursor-pointer shrink-0" style={{ backgroundColor: spec.color }}>
        <input type="color" value={spec.color || '#000000'} onChange={(e) => cambiar({ color: e.target.value })} aria-label="Color"
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </label>
    </Fila>
  )

  const margenes = (
    <Fila etiqueta="Márgenes (mm)">
      {([['margin_top', 'Arriba'], ['margin_bottom', 'Abajo'], ['margin_x', 'Lados']] as const).map(([k, nombre]) => (
        <label key={k} className="flex items-center gap-1 text-mini text-muted">
          {nombre}
          <input type="number" min={0} max={200} step={1} value={mm(spec[k])} aria-label={`Margen ${nombre.toLowerCase()} en mm`}
            onChange={(e) => cambiar({ [k]: pt(Math.max(0, parseFloat(e.target.value) || 0)) })}
            className={`${fieldInput} w-14 text-mini`} />
        </label>
      ))}
    </Fila>
  )

  const paginas = (
    <Fila etiqueta="Páginas">
      <input type="text" value={rangos[capa]} placeholder={`Todas (1-${total})`} aria-label="Páginas"
        onChange={(e) => setRangos((r) => ({ ...r, [capa]: e.target.value }))}
        className={`${fieldInput} w-40 text-mini`} />
      <span className="text-micro text-muted">Ej. 2-{total} para saltar la carátula</span>
    </Fila>
  )

  return (
    <DialogShell label="Encabezado, numeración y marca de agua" panelClass="w-[960px] flex flex-col" dismissible={!trabajando} onClose={onClose}>
      <DialogHeader icon={Stamp} title="Encabezado, numeración y marca de agua" onClose={onClose}>
        <SegmentedGroup value={capa} onChange={setCapa}
          options={(Object.keys(ETIQUETA_CAPA) as CapaSello[]).map((k) => [k, ETIQUETA_CAPA[k] + (aplicadas[k] ? ' •' : ''),
            aplicadas[k] ? 'Ya aplicado en este documento' : undefined])} />
      </DialogHeader>

      {/* Alto FIJO para el cuerpo: con `flex-1` la vista previa de un plano apaisado
          estiraba el diálogo más allá de la ventana y se cortaba por arriba. */}
      <div className="flex min-h-0" style={{ height: 'min(600px, calc(88vh - 120px))' }}>
        <div className="w-[420px] shrink-0 overflow-y-auto px-4 py-4 space-y-4 border-r border-border">
          {capa === 'encabezado' && (
            <>
              <div className="space-y-1.5">
                <div className="text-micro text-muted">Encabezado</div>
                <div className="grid grid-cols-3 gap-1.5">{ZONAS_ARRIBA.map(campoZona)}</div>
                <div className="text-micro text-muted pt-1">Pie de página</div>
                <div className="grid grid-cols-3 gap-1.5">{ZONAS_ABAJO.map(campoZona)}</div>
              </div>
              <Variables onInsertar={insertarVariable} />
              {tipografia}
              {margenes}
              {paginas}
            </>
          )}

          {capa === 'numeracion' && (() => {
            const zona = (Object.keys(spec.zones || {}) as ZonaSello[]).find((z) => (spec.zones?.[z] || '').trim()) || 'br'
            const formato = spec.zones?.[zona] || ''
            const mover = (z: ZonaSello) => cambiar({ zones: { [z]: formato } })
            return (
              <>
                <Fila etiqueta="Posición">
                  <PosicionHoja valor={zona} onChange={mover} />
                </Fila>
                <Fila etiqueta="Formato">
                  <select value={FORMATOS_NUMERO.some(([f]) => f === formato) ? formato : ''} aria-label="Formato"
                    onChange={(e) => { if (e.target.value) cambiar({ zones: { [zona]: e.target.value } }) }}
                    className={`${fieldInput} text-mini w-44`}>
                    <option value="">Personalizado</option>
                    {FORMATOS_NUMERO.map(([f, ej]) => <option key={f} value={f}>{ej}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-mini text-muted">
                    Empezar en
                    <input type="number" min={0} value={spec.start ?? 1} aria-label="Número inicial"
                      onChange={(e) => cambiar({ start: Math.max(0, parseInt(e.target.value) || 0) })}
                      className={`${fieldInput} w-16 text-mini`} />
                  </label>
                </Fila>
                <Fila etiqueta="Texto">
                  <input type="text" value={formato} aria-label="Texto de la numeración"
                    onChange={(e) => cambiar({ zones: { [zona]: e.target.value } })}
                    onFocus={(e) => { ultimoCampo.current = { input: e.currentTarget, zona } }}
                    className={`${fieldInput} flex-1 min-w-0 text-mini`} />
                </Fila>
                <Variables onInsertar={insertarVariable} extra={[['{n:6}', 'Número con ceros (Bates)']]} />
                {tipografia}
                {margenes}
                {paginas}
              </>
            )
          })()}

          {capa === 'marca' && (
            <>
              <Fila etiqueta="Texto">
                <input type="text" value={spec.text || ''} aria-label="Texto de la marca de agua" autoFocus
                  onChange={(e) => cambiar({ text: e.target.value })} className={`${fieldInput} flex-1 min-w-0`} />
              </Fila>
              <Fila etiqueta="Disposición">
                <SegmentedGroup value={spec.mode || 'center'} onChange={(m) => cambiar({ mode: m })}
                  options={[['center', 'Centrada'], ['tile', 'Mosaico', 'Repetida por toda la hoja']]} />
              </Fila>
              <Fila etiqueta="Ángulo">
                <SegmentedGroup value={String(spec.angle ?? 45)} onChange={(a) => cambiar({ angle: parseFloat(a) })}
                  options={[['0', '0°'], ['45', '45°'], ['-45', '−45°'], ['90', '90°']]} />
              </Fila>
              <Fila etiqueta="Tamaño">
                <label className="flex items-center gap-1 text-mini cursor-pointer">
                  <input type="checkbox" checked={(spec.fontsize ?? 0) <= 0} style={nativeAccent}
                    onChange={(e) => cambiar({ fontsize: e.target.checked ? 0 : 48 })} />
                  Según la hoja
                </label>
                {(spec.fontsize ?? 0) > 0 && (
                  <label className="flex items-center gap-1 text-mini text-muted">
                    <input type="number" min={6} max={400} value={spec.fontsize} aria-label="Tamaño en puntos"
                      onChange={(e) => cambiar({ fontsize: Math.max(6, parseFloat(e.target.value) || 6) })}
                      className={`${fieldInput} w-16 text-mini`} /> pt
                  </label>
                )}
              </Fila>
              <Fila etiqueta="Opacidad">
                <input type="range" min={5} max={100} step={5} value={Math.round((spec.opacity ?? 0.3) * 100)} aria-label="Opacidad"
                  onChange={(e) => cambiar({ opacity: parseInt(e.target.value) / 100 })} className="flex-1" style={nativeAccent} />
                <span className="text-mini tabular w-9 text-right">{Math.round((spec.opacity ?? 0.3) * 100)} %</span>
              </Fila>
              {tipografia}
              <Fila etiqueta="">
                <label className="flex items-center gap-1.5 text-mini cursor-pointer" title="Queda debajo del dibujo y el texto de la hoja: no tapa líneas finas">
                  <input type="checkbox" checked={!!spec.behind} onChange={(e) => cambiar({ behind: e.target.checked })} style={nativeAccent} />
                  Detrás del contenido
                </label>
              </Fila>
              {paginas}
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col bg-surface">
          {(() => {
            const franja = capa !== 'marca' && area !== 'full'
            const derecha = Object.entries(spec.zones || {}).some(([z, v]) => z.endsWith('r') && (v || '').trim())
              && !Object.entries(spec.zones || {}).some(([z, v]) => !z.endsWith('r') && (v || '').trim())
            return (
              <div ref={marco} className={`flex-1 min-h-0 relative ${franja ? 'overflow-auto p-3' : 'flex items-center justify-center p-4 overflow-hidden'}`}>
                {preview
                  ? <img src={preview} alt={`Vista previa de la página ${pagina + 1}`}
                      onLoad={(e) => {
                        // En la franja ampliada, se arranca del lado donde está el texto.
                        if (franja && derecha && marco.current) marco.current.scrollLeft = marco.current.scrollWidth
                        if (franja) e.currentTarget.style.width = `${e.currentTarget.naturalWidth / Math.min(2, window.devicePixelRatio || 1)}px`
                      }}
                      className={franja ? 'max-w-none shadow-token-md bg-paper' : 'max-w-full max-h-full object-contain shadow-token-md bg-paper'} />
                  : <div className="h-full grid place-items-center text-mini text-muted">Preparando la vista previa…</div>}
                {cargando && <Loader2 size={16} className="absolute top-3 right-3 animate-spin text-muted" aria-label="Actualizando vista previa" />}
              </div>
            )
          })()}
          <div className="flex items-center justify-center gap-1 py-2 px-3 border-t border-border text-mini">
            {capa !== 'marca' && (
              <div className="mr-auto">
                <SegmentedGroup value={area} onChange={setArea}
                  options={[['full', 'Hoja'], ['top', 'Arriba', 'La franja de arriba, ampliada'], ['bottom', 'Abajo', 'La franja de abajo, ampliada']]} />
              </div>
            )}
            <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}
              aria-label="Página anterior" className="w-7 h-7 grid place-items-center rounded-token-sm hover:bg-hover disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span className="tabular px-1">Página {pagina + 1} de {total}</span>
            <button type="button" onClick={() => setPagina((p) => Math.min(total - 1, p + 1))} disabled={pagina >= total - 1}
              aria-label="Página siguiente" className="w-7 h-7 grid place-items-center rounded-token-sm hover:bg-hover disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <DialogFooter note="Va en una capa propia del PDF: aplicar otra vez reemplaza lo anterior.">
        {aplicadas[capa] && (
          <button type="button" onClick={quitar} disabled={trabajando} className={`${btnGhost} text-danger mr-auto`}>
            <Trash2 size={14} /> Quitar del documento
          </button>
        )}
        <button type="button" onClick={onClose} disabled={trabajando} className={btnGhost}>Cancelar</button>
        <button type="button" onClick={aplicar} disabled={trabajando} className={btnPrimary}>
          {trabajando ? 'Aplicando…' : aplicadas[capa] ? 'Reemplazar' : 'Aplicar'}
        </button>
      </DialogFooter>
    </DialogShell>
  )
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-20 shrink-0 text-micro text-muted">{etiqueta}</span>
      {children}
    </div>
  )
}

function Variables({ onInsertar, extra = [] }: { onInsertar: (v: string) => void; extra?: Array<[string, string]> }) {
  return (
    <Fila etiqueta="Insertar">
      {[...VARIABLES, ...extra].map(([v, nombre]) => (
        // mousedown con preventDefault: el foco se queda en el campo y la variable
        // entra donde estaba el cursor.
        <button key={v} type="button" title={nombre} onMouseDown={(e) => { e.preventDefault(); onInsertar(v) }}
          className="px-1.5 h-6 rounded-token-sm border border-border bg-surface text-micro text-fg hover:bg-hover font-mono">
          {v}
        </button>
      ))}
    </Fila>
  )
}

/** Las seis posiciones sobre una hoja en miniatura: se ve dónde va a caer. */
function PosicionHoja({ valor, onChange }: { valor: ZonaSello; onChange: (z: ZonaSello) => void }) {
  return (
    <div role="radiogroup" aria-label="Posición" className="relative w-[84px] h-[108px] rounded-token-sm border border-border-control bg-paper shadow-token-sm">
      {(['tl', 'tc', 'tr', 'bl', 'bc', 'br'] as ZonaSello[]).map((z) => {
        const izq = z[1] === 'l' ? '8%' : z[1] === 'c' ? '50%' : '92%'
        const arriba = z[0] === 't' ? '9%' : '91%'
        const on = valor === z
        return (
          <button key={z} type="button" role="radio" aria-checked={on} aria-label={NOMBRE_ZONA[z]} title={NOMBRE_ZONA[z]}
            onClick={() => onChange(z)}
            style={{ left: izq, top: arriba }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-3 rounded-[3px] border transition-colors ${
              on ? 'bg-accent border-accent' : 'bg-surface border-border-strong hover:border-fg'
            }`} />
        )
      })}
    </div>
  )
}

function familiaDe(f?: string) {
  const s = (f || '').toLowerCase()
  return s.includes('times') ? 'Times' : s.includes('courier') ? 'Courier' : 'Helvetica'
}

/** [0,1,2,4,5,6] → «1-3, 5-7»: el rango aplicado vuelve al campo como se escribió. */
export function compactar(paginas: number[]): string {
  const ps = [...new Set(paginas)].sort((a, b) => a - b)
  const partes: string[] = []
  for (let i = 0; i < ps.length; i++) {
    let j = i
    while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++
    partes.push(i === j ? `${ps[i] + 1}` : `${ps[i] + 1}-${ps[j] + 1}`)
    i = j
  }
  return partes.join(', ')
}
