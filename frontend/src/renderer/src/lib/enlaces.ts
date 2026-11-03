/** Enlaces del documento: leerlos, crearlos, editarlos y quitarlos. El motor los identifica
 * por su ÍNDICE en la página (no por xref: al deshacer se restaura el documento entero y
 * los xref cambian, el orden no). Las zonas viajan en unidades del PDF, en las
 * coordenadas del visor (las mismas de `/spans`). */
import type { FormValues } from '../components/FormModal'
import { apiFetch } from './api'
import { askForm } from './uiPrompt'
import { crearEnlaceUndoable, editarEnlaceUndoable, quitarEnlaceUndoable } from './pageUndo'
import { mensajeDeError } from './format'
import { usePdfStore } from '../store/usePdfStore'

export type EnlacePdf = {
  index: number
  kind: 'uri' | 'goto' | 'other'
  x0: number
  y0: number
  x1: number
  y1: number
  uri: string | null
  /** Página de destino, base 0 (solo en los que van a una página). */
  page: number | null
}

export type ZonaEnlace = { x0: number; y0: number; x1: number; y1: number }
export type DestinoEnlace = { uri: string } | { target_page: number }

export const TIPO_WEB = 'Dirección web'
export const TIPO_PAGINA = 'Página del documento'

export async function cargarEnlaces(docId: string, pagina: number): Promise<EnlacePdf[]> {
  try {
    const r = await apiFetch(`/pdf/links/${docId}/${pagina}`)
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d?.links) ? (d.links as EnlacePdf[]) : []
  } catch {
    return []
  }
}

type Resultado = { destino: DestinoEnlace } | { quitar: true } | { error: string }

/** Lo que escribió la persona → qué hacer. La dirección la valida el motor (esquemas
 * permitidos, «www.» → https); acá solo que no esté vacía y que la página exista. */
export function interpretarFormulario(v: FormValues, totalPaginas: number): Resultado {
  if (v.quitar === true) return { quitar: true }
  if (v.tipo === TIPO_PAGINA) {
    const n = Number(String(v.pagina).trim())
    if (!Number.isInteger(n) || n < 1 || n > totalPaginas) {
      return { error: `Escribí una página entre 1 y ${totalPaginas}` }
    }
    return { destino: { target_page: n - 1 } }
  }
  const uri = String(v.uri ?? '').trim()
  if (!uri) return { error: 'Escribí la dirección del enlace' }
  return { destino: { uri } }
}

/** Pide el destino en un formulario. Si algo no sirve avisa y vuelve a preguntar con lo
 * escrito, en vez de perderlo. null = canceló. */
export async function pedirDestino(
  totalPaginas: number,
  actual?: EnlacePdf,
): Promise<{ destino: DestinoEnlace } | { quitar: true } | null> {
  let tipo = actual?.kind === 'goto' ? TIPO_PAGINA : TIPO_WEB
  let uri = actual?.uri ?? ''
  let pagina = actual?.page != null ? actual.page + 1 : 1
  for (;;) {
    const v = await askForm(actual ? 'Editar enlace' : 'Crear enlace', [
      { name: 'tipo', label: 'Va a', type: 'select', options: [TIPO_WEB, TIPO_PAGINA], defaultValue: tipo },
      { name: 'uri', label: 'Dirección (si va a una web)', type: 'text', placeholder: 'https://ejemplo.com o correo@ejemplo.com', defaultValue: uri },
      { name: 'pagina', label: `Página (si va a una página, 1–${totalPaginas})`, type: 'number', min: 1, max: totalPaginas, defaultValue: pagina },
      ...(actual ? [{ name: 'quitar', label: 'Quitar este enlace', type: 'checkbox' as const, defaultValue: false }] : []),
    ], actual ? 'Guardar' : 'Crear')
    if (!v) return null
    const res = interpretarFormulario(v, totalPaginas)
    if (!('error' in res)) return res
    usePdfStore.getState().showToast(res.error, 'info')
    tipo = String(v.tipo)
    uri = String(v.uri ?? '')
    pagina = Number(v.pagina) || 1
  }
}

function totalDe(docId: string): number {
  return usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.page_count ?? 1
}

/** Pide el destino y crea el enlace en la zona. true si se creó. */
export async function pedirYCrearEnlace(docId: string, pagina: number, zona: ZonaEnlace): Promise<boolean> {
  const { showToast } = usePdfStore.getState()
  const res = await pedirDestino(totalDe(docId))
  if (!res || 'quitar' in res) return false
  try {
    await crearEnlaceUndoable(docId, pagina, zona, res.destino)
    showToast('Enlace creado. Ctrl+Z deshace.', 'success')
    return true
  } catch (err) {
    showToast('No se pudo crear el enlace: ' + mensajeDeError(err), 'error')
    return false
  }
}

/** Edita o quita un enlace existente. true si cambió algo. */
export async function pedirYEditarEnlace(docId: string, pagina: number, enlace: EnlacePdf): Promise<boolean> {
  const { showToast } = usePdfStore.getState()
  const res = await pedirDestino(totalDe(docId), enlace)
  if (!res) return false
  try {
    if ('quitar' in res) {
      await quitarEnlaceUndoable(docId, pagina, enlace.index)
      showToast('Enlace quitado. Ctrl+Z deshace.', 'success')
    } else {
      await editarEnlaceUndoable(docId, pagina, enlace.index, res.destino)
      showToast('Enlace actualizado. Ctrl+Z deshace.', 'success')
    }
    return true
  } catch (err) {
    showToast('No se pudo cambiar el enlace: ' + mensajeDeError(err), 'error')
    return false
  }
}
