import { type Annotation } from '../store/usePdfStore'

export type Rect = { x: number; y: number; w: number; h: number }
export type Punto = { x: number; y: number }

/** Radios del borrador, en píxeles de pantalla: el pincel se ve del mismo tamaño
 * esté el plano al 25 % o al 400 %, que es lo que espera la mano. */
export const ERASER_SIZES = [8, 16, 28, 48] as const
export const ERASER_DEFAULT = 16

/** Marcas dibujadas como polilínea: el borrador sigue el TRAZO, no su caja. La caja
 * de una firma larga o de un croquis cubre media página y borraría de más. */
const TIPOS_TRAZO = new Set(['draw', 'signature', 'polygon', 'measure_area', 'measure_perimeter'])

/** Marcas de dos puntos (la caja tiene un lado de 0 px en una línea horizontal). */
const TIPOS_SEGMENTO = new Set(['line', 'arrow', 'measure_distance', 'measure_calibrate'])

/** Polígonos que se cierran solos: el último vértice conecta con el primero. */
const TIPOS_CERRADOS = new Set(['polygon', 'measure_area'])

function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const largo2 = dx * dx + dy * dy
  if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function tocaCaja(p: Punto, b: Rect, radio: number): boolean {
  const cx = Math.max(b.x, Math.min(p.x, b.x + b.w))
  const cy = Math.max(b.y, Math.min(p.y, b.y + b.h))
  return Math.hypot(p.x - cx, p.y - cy) <= radio
}

/**
 * Ids de las marcas que toca el círculo del borrador. Todo en coordenadas de
 * pantalla: `punto` y `radio` son px del visor, y `boundsOf`/`toScreen` ya traducen
 * de puntos PDF a pantalla.
 *
 * El borrador quita la marca ENTERA (como Bluebeam o Acrobat), no un trozo del
 * trazo: partir un dibujo en dos dejaría marcas que el usuario no creó y que no se
 * pueden reagrupar.
 */
export function marcasBajoBorrador(
  anns: Annotation[],
  punto: Punto,
  radio: number,
  boundsOf: (a: Annotation) => Rect | null,
  toScreen: (x: number, y: number) => Punto,
): string[] {
  const golpes: string[] = []
  for (const ann of anns) {
    const b = boundsOf(ann)
    if (!b) continue
    // Descarte rápido por caja inflada: lo que ni siquiera roza el círculo no se mide.
    if (!tocaCaja(punto, b, radio)) continue

    if (TIPOS_TRAZO.has(ann.type) && ann.points && ann.points.length > 0) {
      const pts = ann.points.map((p) => toScreen(p.x, p.y))
      if (pts.length === 1) {
        if (Math.hypot(punto.x - pts[0].x, punto.y - pts[0].y) <= radio) golpes.push(ann.id)
        continue
      }
      const cierra = TIPOS_CERRADOS.has(ann.type) && pts.length > 2
      let toca = false
      for (let i = 0; i < pts.length - 1 && !toca; i++) {
        toca = distanciaASegmento(punto, pts[i], pts[i + 1]) <= radio
      }
      if (!toca && cierra) toca = distanciaASegmento(punto, pts[pts.length - 1], pts[0]) <= radio
      if (toca) golpes.push(ann.id)
      continue
    }

    if (TIPOS_SEGMENTO.has(ann.type)) {
      const a = toScreen(ann.x, ann.y)
      const z = toScreen(ann.x + (ann.width || 0), ann.y + (ann.height || 0))
      if (distanciaASegmento(punto, a, z) <= radio) golpes.push(ann.id)
      continue
    }

    golpes.push(ann.id)
  }
  return golpes
}

// ─── Borrado parcial ────────────────────────────────────────────────────────────

export type EraserMode = 'partial' | 'whole'
export const ERASER_MIN = 4
export const ERASER_MAX = 80

/** Solo la tinta a mano alzada se corta. Un polígono o una cota SÍ tienen trazo,
 * pero recortarlos cambiaría en silencio la superficie o la longitud medida: esas
 * se quitan enteras o no se tocan. */
const TIPOS_CORTABLES = new Set(['draw', 'signature'])

export function esCortable(tipo: string): boolean {
  return TIPOS_CORTABLES.has(tipo)
}

/**
 * Parte una polilínea por donde pasa el círculo del borrador y devuelve los trozos
 * que SOBREVIVEN, en orden. Recorta a nivel de segmento (no de vértice): el corte
 * cae justo en el filo del círculo, así que borrar la mitad de un trazo largo de
 * dos puntos funciona igual que borrar sobre uno denso de trescientos.
 *
 * Todo en el mismo espacio de coordenadas (el del trazo: puntos PDF).
 */
export function recortarPolilinea(pts: Punto[], centro: Punto, radio: number): Punto[][] {
  if (pts.length < 2) return []
  const trozos: Punto[][] = []
  let actual: Punto[] = []
  const cerrar = () => {
    if (actual.length >= 2) trozos.push(actual)
    actual = []
  }
  const en = (a: Punto, b: Punto, t: number): Punto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const dentro = (p: Punto) => Math.hypot(p.x - centro.x, p.y - centro.y) <= radio

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const fx = a.x - centro.x
    const fy = a.y - centro.y
    const qa = dx * dx + dy * dy
    let t0 = Infinity
    let t1 = -Infinity
    if (qa > 0) {
      const qb = 2 * (fx * dx + fy * dy)
      const qc = fx * fx + fy * fy - radio * radio
      const disc = qb * qb - 4 * qa * qc
      if (disc > 0) {
        const raiz = Math.sqrt(disc)
        t0 = (-qb - raiz) / (2 * qa)
        t1 = (-qb + raiz) / (2 * qa)
      }
    }
    // Intervalo del segmento que queda TAPADO por el pincel, recortado a [0, 1].
    const d0 = Math.max(0, Math.min(1, t0))
    const d1 = Math.max(0, Math.min(1, t1))
    const hayTapado = t1 > 0 && t0 < 1 && d1 > d0

    if (!hayTapado) {
      // Ni asoma el círculo: el segmento entero se salva… salvo que esté todo dentro
      // (círculo enorme, segmento corto: la cuadrática no corta el rango).
      if (dentro(a) && dentro(b)) { cerrar(); continue }
      if (actual.length === 0) actual.push(a)
      actual.push(b)
      continue
    }
    if (d0 > 0) {
      if (actual.length === 0) actual.push(a)
      actual.push(en(a, b, d0))
    }
    cerrar()
    if (d1 < 1) {
      actual.push(en(a, b, d1))
      actual.push(b)
    }
  }
  cerrar()
  return trozos
}

/**
 * Pasada del borrador sobre la lista completa de marcas del documento. Devuelve la
 * lista nueva, o `null` si el pincel no tocó nada (así el visor no re-renderiza en
 * cada mousemove de un arrastre que va por el aire).
 *
 * `punto` y `radio` van en píxeles de PANTALLA; el trazo vive en puntos PDF.
 */
export function aplicarBorrador(opciones: {
  todas: Annotation[]
  visibles: Annotation[]
  punto: Punto
  radio: number
  modo: EraserMode
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number }
  boundsOf: (a: Annotation) => Rect | null
  toScreen: (x: number, y: number) => Punto
  nuevoId: () => string
}): Annotation[] | null {
  const { todas, visibles, punto, radio, modo, pageData, boundsOf, toScreen, nuevoId } = opciones
  const ids = new Set(marcasBajoBorrador(visibles, punto, radio, boundsOf, toScreen))
  if (ids.size === 0) return null

  const escala = pageData.originalWidth / pageData.width
  const centroPdf = {
    x: punto.x * escala,
    y: punto.y * (pageData.originalHeight / pageData.height),
  }
  const radioPdf = radio * escala

  let cambio = false
  const siguiente: Annotation[] = []
  for (const ann of todas) {
    if (!ids.has(ann.id)) { siguiente.push(ann); continue }
    cambio = true
    if (modo === 'whole' || !esCortable(ann.type) || !ann.points || ann.points.length < 2) continue

    const trozos = recortarPolilinea(ann.points, centroPdf, radioPdf)
    if (trozos.length === 0) continue
    // El primer trozo conserva el id: así no se pierde la selección ni el hilo de
    // respuestas si la marca tenía comentarios.
    trozos.forEach((puntos, i) => {
      siguiente.push({
        ...ann,
        id: i === 0 ? ann.id : nuevoId(),
        x: puntos[0].x,
        y: puntos[0].y,
        points: puntos,
      })
    })
  }
  return cambio ? siguiente : null
}
