import { useEffect, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'

import { cargarEnlaces, pedirYEditarEnlace, type EnlacePdf } from '../lib/enlaces'

type LocalRect = { l: number; t: number; w: number; h: number }
type PageData = { width: number; height: number; originalWidth: number; originalHeight: number } | null
type ActiveDoc = { doc_id: string; currentPage: number; docVersion: number } | null | undefined

/** Enlaces existentes de la página (herramienta 'link'): los carga mientras la herramienta
 * está activa, los dibuja y permite editar o quitar el que se toca. Se recargan con
 * `docVersion`, que sube tras cada operación y tras deshacer o rehacer. */
export function useEnlaces(activeDoc: ActiveDoc, pageData: PageData) {
  const store = useStoreSlice('activeTool')
  const [enlaces, setEnlaces] = useState<EnlacePdf[]>([])
  const sx = pageData ? pageData.width / pageData.originalWidth : 1
  const sy = pageData ? pageData.height / pageData.originalHeight : 1
  const localDe = (e: EnlacePdf): LocalRect => ({ l: e.x0 * sx, t: e.y0 * sy, w: (e.x1 - e.x0) * sx, h: (e.y1 - e.y0) * sy })

  // Valores simples, no los objetos enteros: el efecto se vuelve a correr solo cuando
  // cambia lo que de verdad importa (documento, página, versión, herramienta).
  const docId = activeDoc?.doc_id
  const pagina = activeDoc?.currentPage
  const version = activeDoc?.docVersion
  const hayPagina = !!pageData
  useEffect(() => {
    if (!docId || pagina === undefined || store.activeTool !== 'link' || !hayPagina) { setEnlaces([]); return }
    let vivo = true
    cargarEnlaces(docId, pagina).then((ls) => { if (vivo) setEnlaces(ls) })
    return () => { vivo = false }
  }, [store.activeTool, docId, pagina, version, hayPagina])

  /** El enlace bajo el punto (en píxeles de la página), el de más arriba si se solapan. */
  const enlaceEn = (pt: { x: number; y: number }): EnlacePdf | null => {
    for (let i = enlaces.length - 1; i >= 0; i--) {
      const r = localDe(enlaces[i])
      if (pt.x >= r.l && pt.x <= r.l + r.w && pt.y >= r.t && pt.y <= r.t + r.h) return enlaces[i]
    }
    return null
  }

  const editarEnlace = (e: EnlacePdf) =>
    activeDoc ? pedirYEditarEnlace(activeDoc.doc_id, activeDoc.currentPage, e) : Promise.resolve(false)

  return { enlaces, localDe, enlaceEn, editarEnlace }
}
