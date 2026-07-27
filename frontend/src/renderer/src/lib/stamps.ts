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
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function save(list: CustomStamp[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30))) } catch {}
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
