/** Modelo del editor de texto con formato: el párrafo como una lista de tramos, cada uno
 * con su texto y su estilo. Todo es lógica pura (sin DOM): el editor lee y escribe el
 * navegador, y estas funciones deciden qué estilo queda en cada carácter. */
import type { TextoEditable, TramoMotor } from './textoEditable'

export type EstiloTramo = {
  /** Nombre de fuente tal como va al motor: el del PDF («ABCDEF+Calibri») o una familia
   * elegida («Arial»). */
  font: string
  size: number
  color: string
  bold: boolean
  italic: boolean
}

export type Tramo = EstiloTramo & { text: string }

export const TAM_MIN = 4
export const TAM_MAX = 72

export function estiloDe(t: Tramo): EstiloTramo {
  return { font: t.font, size: t.size, color: t.color, bold: t.bold, italic: t.italic }
}

export function mismoEstilo(a: EstiloTramo, b: EstiloTramo): boolean {
  return a.font === b.font && a.bold === b.bold && a.italic === b.italic
    && a.color.toLowerCase() === b.color.toLowerCase() && Math.abs(a.size - b.size) < 0.01
}

export function textoDe(tramos: readonly Tramo[]): string {
  return tramos.map((t) => t.text).join('')
}

/** Une los vecinos con el mismo estilo y quita los vacíos. */
export function fusionar(tramos: readonly Tramo[]): Tramo[] {
  const res: Tramo[] = []
  for (const t of tramos) {
    if (!t.text) continue
    const ult = res[res.length - 1]
    if (ult && mismoEstilo(ult, t)) res[res.length - 1] = { ...ult, text: ult.text + t.text }
    else res.push({ ...t })
  }
  return res
}

/** Los tramos del bloque que devolvió el motor. Sin tramos (un solo estilo), uno solo
 * con el estilo del bloque. */
export function tramosDeBloque(b: Pick<TextoEditable, 'value' | 'runs' | 'fontPdf' | 'size' | 'color' | 'bold' | 'italic'>): Tramo[] {
  const base: EstiloTramo = { font: b.fontPdf, size: b.size, color: b.color, bold: b.bold, italic: b.italic }
  if (!b.runs || !b.runs.length) return b.value ? [{ ...base, text: b.value }] : []
  const res: Tramo[] = []
  let cubierto = 0
  for (const r of b.runs) {
    const ini = Math.max(r.start, cubierto)
    if (r.end <= ini) continue
    // Un hueco entre tramos toma el estilo del anterior (igual que el motor).
    if (ini > cubierto && res.length) res[res.length - 1].text += b.value.slice(cubierto, ini)
    res.push({ font: r.font, size: r.size, color: r.color, bold: r.bold, italic: r.italic, text: b.value.slice(ini, r.end) })
    cubierto = r.end
  }
  if (cubierto < b.value.length) {
    if (res.length) res[res.length - 1].text += b.value.slice(cubierto)
    else res.push({ ...base, text: b.value })
  }
  return fusionar(res)
}

/** Parte los tramos en `pos` (un tramo que cruza se divide en dos). */
function partir(tramos: readonly Tramo[], pos: number): Tramo[] {
  const res: Tramo[] = []
  let desde = 0
  for (const t of tramos) {
    const hasta = desde + t.text.length
    if (pos > desde && pos < hasta) {
      res.push({ ...t, text: t.text.slice(0, pos - desde) }, { ...t, text: t.text.slice(pos - desde) })
    } else res.push({ ...t })
    desde = hasta
  }
  return res
}

/** Aplica `patch` a los caracteres [ini, fin). Con la selección vacía no cambia nada. */
export function aplicarEstilo(tramos: readonly Tramo[], ini: number, fin: number, patch: Partial<EstiloTramo>): Tramo[] {
  const total = textoDe(tramos).length
  const a = Math.max(0, Math.min(ini, fin)), b = Math.min(total, Math.max(ini, fin))
  if (a >= b) return tramos.map((t) => ({ ...t }))
  if (patch.size !== undefined) patch = { ...patch, size: Math.max(TAM_MIN, Math.min(TAM_MAX, patch.size)) }
  const partidos = partir(partir(tramos, a), b)
  let desde = 0
  const res = partidos.map((t) => {
    const hasta = desde + t.text.length
    const dentro = desde >= a && hasta <= b
    desde = hasta
    return dentro ? { ...t, ...patch } : t
  })
  return fusionar(res)
}

/** El paso de «A+» / «A−»: de a 2 desde 12, de a 1 por debajo. */
export function pasoDeTamano(size: number, dir: 1 | -1): number {
  const paso = dir > 0 ? (size >= 12 ? 2 : 1) : (size > 12 ? 2 : 1)
  return Math.max(TAM_MIN, Math.min(TAM_MAX, size + dir * paso))
}

/** Sube o baja el cuerpo de lo seleccionado, cada tramo desde el suyo (como Word: una
 * selección con cuerpos distintos conserva sus diferencias). */
export function cambiarTamano(tramos: readonly Tramo[], ini: number, fin: number, dir: 1 | -1): Tramo[] {
  const total = textoDe(tramos).length
  const a = Math.max(0, Math.min(ini, fin)), b = Math.min(total, Math.max(ini, fin))
  if (a >= b) return tramos.map((t) => ({ ...t }))
  const partidos = partir(partir(tramos, a), b)
  let desde = 0
  return fusionar(partidos.map((t) => {
    const hasta = desde + t.text.length
    const dentro = desde >= a && hasta <= b
    desde = hasta
    return dentro ? { ...t, size: pasoDeTamano(t.size, dir) } : t
  }))
}

export type EstiloComun = { [K in keyof EstiloTramo]?: EstiloTramo[K] } & { mixto: Array<keyof EstiloTramo> }

/** El estilo que comparten los caracteres [ini, fin); lo que varía queda en `mixto`.
 * Con la selección vacía es el del carácter anterior al cursor (el siguiente si está
 * al principio): el que tendría lo que se escriba. */
export function estiloEn(tramos: readonly Tramo[], ini: number, fin: number): EstiloComun | null {
  if (!tramos.length) return null
  const a = Math.min(ini, fin), b = Math.max(ini, fin)
  let elegidos: Tramo[]
  if (a === b) {
    let desde = 0
    let previo: Tramo | undefined
    elegidos = []
    for (const t of tramos) {
      const hasta = desde + t.text.length
      if (a > desde && a <= hasta) { elegidos = [t]; break }
      if (!previo) previo = t
      desde = hasta
    }
    if (!elegidos.length) elegidos = [previo ?? tramos[0]]
  } else {
    elegidos = []
    let desde = 0
    for (const t of tramos) {
      const hasta = desde + t.text.length
      if (hasta > a && desde < b) elegidos.push(t)
      desde = hasta
    }
  }
  if (!elegidos.length) return null
  const ref = estiloDe(elegidos[0])
  const mixto: Array<keyof EstiloTramo> = []
  for (const k of ['font', 'size', 'color', 'bold', 'italic'] as const) {
    const distinto = elegidos.some((t) => (k === 'color' ? t.color.toLowerCase() !== ref.color.toLowerCase()
      : k === 'size' ? Math.abs(t.size - ref.size) >= 0.01 : t[k] !== ref[k]))
    if (distinto) mixto.push(k)
  }
  const res: EstiloComun = { mixto }
  for (const k of ['font', 'size', 'color', 'bold', 'italic'] as const) {
    if (!mixto.includes(k)) (res as Record<string, unknown>)[k] = ref[k]
  }
  return res
}

/** Inserta `texto` en `pos` con el estilo dado (lo que se escribe tras activar una
 * negrita sin selección). */
export function insertarTexto(tramos: readonly Tramo[], pos: number, texto: string, estilo: EstiloTramo): Tramo[] {
  if (!texto) return tramos.map((t) => ({ ...t }))
  const p = Math.max(0, Math.min(pos, textoDe(tramos).length))
  const partidos = partir(tramos, p)
  const res: Tramo[] = []
  let desde = 0
  let puesto = false
  for (const t of partidos) {
    if (!puesto && desde >= p) { res.push({ ...estilo, text: texto }); puesto = true }
    res.push(t)
    desde += t.text.length
  }
  if (!puesto) res.push({ ...estilo, text: texto })
  return fusionar(res)
}

/** Quita los caracteres [ini, fin). */
export function borrarRango(tramos: readonly Tramo[], ini: number, fin: number): Tramo[] {
  const a = Math.min(ini, fin), b = Math.max(ini, fin)
  if (a === b) return tramos.map((t) => ({ ...t }))
  const partidos = partir(partir(tramos, a), b)
  let desde = 0
  return fusionar(partidos.filter((t) => {
    const hasta = desde + t.text.length
    const fuera = hasta <= a || desde >= b
    desde = hasta
    return fuera
  }))
}

/** Quita los saltos de línea del final: el navegador deja uno de más al pulsar Enter
 * al final del texto (para que la línea nueva se vea), y un renglón vacío al final no
 * tiene sentido en un párrafo del PDF. */
export function sinSaltosFinales(tramos: readonly Tramo[]): Tramo[] {
  const res = tramos.map((t) => ({ ...t }))
  while (res.length) {
    const ult = res[res.length - 1]
    const recortado = ult.text.replace(/\n+$/, '')
    if (recortado.length === ult.text.length) break
    if (recortado) { ult.text = recortado; break }
    res.pop()
  }
  return res
}

/** Los tramos como los espera el motor: índices [start, end) sobre el texto nuevo. */
export function aRuns(tramos: readonly Tramo[]): TramoMotor[] {
  const res: TramoMotor[] = []
  let pos = 0
  for (const t of fusionar(tramos)) {
    res.push({ start: pos, end: pos + t.text.length, font: t.font, size: t.size, color: t.color, bold: t.bold, italic: t.italic })
    pos += t.text.length
  }
  return res
}

export function iguales(a: readonly Tramo[], b: readonly Tramo[]): boolean {
  const x = fusionar(a), y = fusionar(b)
  return x.length === y.length && x.every((t, i) => t.text === y[i].text && mismoEstilo(t, y[i]))
}

/** El cuerpo que más caracteres tiene: el motor lo usa como cuerpo del párrafo para el
 * paso entre renglones. */
export function tamanoDominante(tramos: readonly Tramo[], porDefecto = 12): number {
  const peso = new Map<number, number>()
  for (const t of tramos) {
    const k = Math.round(t.size * 100) / 100
    peso.set(k, (peso.get(k) ?? 0) + t.text.replace(/\s/g, '').length)
  }
  let mejor = porDefecto, mayor = 0
  for (const [k, v] of peso) if (v > mayor) { mejor = k; mayor = v }
  return mejor
}

/** Lo que se le manda al motor al confirmar el editor con formato: el texto nuevo, un
 * tramo por cada cambio de estilo, y el origen del párrafo original (línea base y
 * sangría) para que quede en su sitio. */
export function paramsDeEdicionRica(t: TextoEditable, crudos: readonly Tramo[]) {
  const tramos = sinSaltosFinales(crudos)
  const texto = textoDe(tramos)
  const runs = aRuns(tramos)
  return {
    x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1,
    text: texto,
    size: tamanoDominante(tramos, t.size), color: runs[0]?.color ?? t.color,
    font: runs[0]?.font || t.fontPdf || t.fontFamily,
    wrap: true, bold: runs[0]?.bold ?? t.bold, italic: runs[0]?.italic ?? t.italic,
    align: t.align, line_height: t.lineHeight,
    // Los tramos describen el texto NUEVO, así que el texto base es el mismo.
    runs: runs.length ? runs : undefined,
    base_text: runs.length ? texto : undefined,
    origin_y: t.originY ?? undefined, x_first: t.xFirst ?? undefined, x_rest: t.xRest ?? undefined,
  }
}
