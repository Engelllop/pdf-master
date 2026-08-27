import { describe, it, expect } from 'vitest'
import { borrarEnRuta, cuantasCuelgan, renombrarEnRuta, tituloEnRuta } from './outlineTree'
import type { OutlineItem } from '../store/usePdfStore'

// Índice de ejemplo: dos capítulos, el primero con dos hijas y una nieta.
const INDICE: OutlineItem[] = [
  {
    title: 'Arquitectura', page: 0, children: [
      { title: 'Plantas', page: 1, children: [{ title: 'Planta baja', page: 2 }] },
      { title: 'Fachadas', page: 5 },
    ],
  },
  { title: 'Estructura', page: 8 },
]

const titulos = (items: OutlineItem[]): string[] =>
  items.flatMap((i) => [i.title, ...titulos(i.children || [])])

describe('borrar', () => {
  it('quita una raíz sin tocar la otra', () => {
    expect(titulos(borrarEnRuta(INDICE, [1]))).toEqual(['Arquitectura', 'Plantas', 'Planta baja', 'Fachadas'])
  })

  it('quita una hija y deja a sus hermanas en su sitio', () => {
    expect(titulos(borrarEnRuta(INDICE, [0, 1]))).toEqual(['Arquitectura', 'Plantas', 'Planta baja', 'Estructura'])
  })

  // El nivel del TOC cuelga del padre: dejar las hijas huérfanas las subiría de nivel
  // y el índice quedaría distinto del que el usuario ve.
  it('se lleva las hijas del que se borra', () => {
    expect(titulos(borrarEnRuta(INDICE, [0, 0]))).toEqual(['Arquitectura', 'Fachadas', 'Estructura'])
  })

  it('una nieta', () => {
    expect(titulos(borrarEnRuta(INDICE, [0, 0, 0]))).toEqual(['Arquitectura', 'Plantas', 'Fachadas', 'Estructura'])
  })

  it('no muta el original', () => {
    borrarEnRuta(INDICE, [0, 0])
    expect(titulos(INDICE)).toEqual(['Arquitectura', 'Plantas', 'Planta baja', 'Fachadas', 'Estructura'])
  })

  it('una ruta que no existe devuelve el índice tal cual', () => {
    expect(borrarEnRuta(INDICE, [9])).toBe(INDICE)
    expect(titulos(borrarEnRuta(INDICE, [0, 7]))).toEqual(titulos(INDICE))
  })
})

describe('renombrar', () => {
  it('cambia solo el título de esa entrada', () => {
    const r = renombrarEnRuta(INDICE, [0, 1], 'Alzados')
    expect(titulos(r)).toEqual(['Arquitectura', 'Plantas', 'Planta baja', 'Alzados', 'Estructura'])
  })

  it('conserva la página y las hijas', () => {
    const r = renombrarEnRuta(INDICE, [0, 0], 'Niveles')
    expect(r[0].children![0].page).toBe(1)
    expect(r[0].children![0].children![0].title).toBe('Planta baja')
  })

  it('no muta el original', () => {
    renombrarEnRuta(INDICE, [0, 1], 'Alzados')
    expect(INDICE[0].children![1].title).toBe('Fachadas')
  })
})

describe('leer la ruta', () => {
  it('el título', () => {
    expect(tituloEnRuta(INDICE, [0, 0, 0])).toBe('Planta baja')
    expect(tituloEnRuta(INDICE, [4])).toBe('')
  })

  // El aviso de borrado dice cuántas se van: borrar un capítulo con hijas no es lo
  // mismo que borrar una línea.
  it('cuántas entradas cuelgan', () => {
    expect(cuantasCuelgan(INDICE, [0])).toBe(4)
    expect(cuantasCuelgan(INDICE, [0, 0])).toBe(2)
    expect(cuantasCuelgan(INDICE, [1])).toBe(1)
    expect(cuantasCuelgan(INDICE, [9])).toBe(0)
  })
})
