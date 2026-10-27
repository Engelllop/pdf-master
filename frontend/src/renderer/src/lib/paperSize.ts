/** Nombre del formato de papel de una página, para la barra de estado: «ARCH D ·
 * 36 × 24 in» se lee; «2592 × 1728 pt» obliga a dividir por 72 de cabeza. */

const FORMATOS: Array<{ nombre: string; w: number; h: number; mm?: boolean }> = [
  { nombre: 'Carta', w: 8.5, h: 11 },
  { nombre: 'Legal', w: 8.5, h: 14 },
  { nombre: 'Tabloide', w: 11, h: 17 },
  { nombre: 'ANSI C', w: 17, h: 22 },
  { nombre: 'ANSI D', w: 22, h: 34 },
  { nombre: 'ANSI E', w: 34, h: 44 },
  { nombre: 'ARCH A', w: 9, h: 12 },
  { nombre: 'ARCH B', w: 12, h: 18 },
  { nombre: 'ARCH C', w: 18, h: 24 },
  { nombre: 'ARCH D', w: 24, h: 36 },
  { nombre: 'ARCH E1', w: 30, h: 42 },
  { nombre: 'ARCH E', w: 36, h: 48 },
  { nombre: 'A4', w: 210, h: 297, mm: true },
  { nombre: 'A3', w: 297, h: 420, mm: true },
  { nombre: 'A2', w: 420, h: 594, mm: true },
  { nombre: 'A1', w: 594, h: 841, mm: true },
  { nombre: 'A0', w: 841, h: 1189, mm: true },
]

const PT_POR_IN = 72
const PT_POR_MM = 72 / 25.4

const num = (v: number) => (Math.round(v * 10) / 10).toString()

export function describirPapel(wPt: number, hPt: number): string {
  if (!(wPt > 0 && hPt > 0)) return ''
  const corto = Math.min(wPt, hPt)
  const largo = Math.max(wPt, hPt)
  const apaisada = wPt > hPt
  for (const f of FORMATOS) {
    const k = f.mm ? PT_POR_MM : PT_POR_IN
    // 2 mm de tolerancia: los PDF exportados redondean el tamaño de distintas formas.
    if (Math.abs(corto - f.w * k) <= 6 && Math.abs(largo - f.h * k) <= 6) {
      const [a, b] = apaisada ? [f.h, f.w] : [f.w, f.h]
      return `${f.nombre} · ${num(a)} × ${num(b)} ${f.mm ? 'mm' : 'in'}`
    }
  }
  return `${num(wPt / PT_POR_IN)} × ${num(hPt / PT_POR_IN)} in`
}
