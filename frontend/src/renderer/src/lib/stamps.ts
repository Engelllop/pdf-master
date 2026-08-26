/** Sellos personalizados del usuario. Los 7 de fábrica siguen estando; estos se
 * añaden y pueden llevar fecha y autor automáticos al colocarse. */
export interface CustomStamp {
  id: string
  text: string
  color: string
  withDate?: boolean
  withAuthor?: boolean
}

export const BUILTIN_STAMPS = ['APROBADO', 'RECHAZADO', 'REVISADO', 'URGENTE', 'BORRADOR', 'FIRMADO', 'COPIA']

const KEY = 'pdfmaster_custom_stamps'

export function loadStamps(): CustomStamp[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter((s) => s && typeof s.text === 'string') : []
  } catch {
    return []
  }
}

// slice(-30), no slice(0, 30): el tope recorta por el principio, así que al llegar a
// 30 sellos el que se caía era el RECIÉN creado — se veía en la lista hasta cerrar el
// gestor y luego había desaparecido. Ahora cae el más viejo, como en las firmas.
function save(list: CustomStamp[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-30))) } catch {}
}

export function addStamp(stamp: Omit<CustomStamp, 'id'>): CustomStamp {
  const created = { ...stamp, id: crypto.randomUUID() }
  save([...loadStamps(), created])
  return created
}

export function removeStamp(id: string): void {
  save(loadStamps().filter((s) => s.id !== id))
}

/** Texto final del sello, con fecha (MM/DD/YYYY) y autor si están activados. */
export function renderStampText(stamp: CustomStamp, author: string): string {
  const parts = [stamp.text]
  if (stamp.withAuthor && author) parts.push(author)
  if (stamp.withDate) {
    const d = new Date()
    parts.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`)
  }
  return parts.join(' · ')
}
