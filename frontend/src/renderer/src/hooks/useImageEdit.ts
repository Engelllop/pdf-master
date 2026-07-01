import { useEffect, useRef, useState } from 'react'
import { useStoreSlice } from './useStoreSlice'

import { apiFetch } from '../lib/api'

type LocalRect = { l: number; t: number; w: number; h: number }
export type PageImage = { xref: number; x0: number; y0: number; x1: number; y1: number }
type PageData = { width: number; height: number; originalWidth: number; originalHeight: number } | null
type ActiveDoc = { doc_id: string; currentPage: number; docVersion: number } | null | undefined

/** Edición de imágenes existentes (herramienta 'editimage'): carga las imágenes de
 * la página, mantiene selección/preview de arrastre y aplica el transform al backend. */
export function useImageEdit(activeDoc: ActiveDoc, pageData: PageData) {
  const store = useStoreSlice(
    'activeTool', 'setDocDirty', 'invalidatePageCache', 'invalidateThumbnails',
    'incrementDocVersion', 'showToast',
  )
  const [pageImages, setPageImages] = useState<PageImage[]>([])
  const [selImg, setSelImg] = useState<number | null>(null)
  const [imgPreview, setImgPreview] = useState<LocalRect | null>(null)
  const imgModeRef = useRef<'move' | 'resize' | null>(null)
  const imgStartRef = useRef<{ ox: number; oy: number; rect: LocalRect } | null>(null)
  const imgSx = pageData ? pageData.width / pageData.originalWidth : 1
  const imgSy = pageData ? pageData.height / pageData.originalHeight : 1
  const imgLocalOf = (im: PageImage): LocalRect => ({ l: im.x0 * imgSx, t: im.y0 * imgSy, w: (im.x1 - im.x0) * imgSx, h: (im.y1 - im.y0) * imgSy })

  useEffect(() => {
    if (!activeDoc || store.activeTool !== 'editimage' || !pageData) { setPageImages([]); setSelImg(null); setImgPreview(null); return }
    apiFetch(`/pdf/images/${activeDoc.doc_id}/${activeDoc.currentPage}`)
      .then((r) => r.json()).then(({ images }) => setPageImages(images || [])).catch(() => setPageImages([]))
  }, [store.activeTool, activeDoc?.doc_id, activeDoc?.currentPage, activeDoc?.docVersion, pageData?.width])

  const applyImageTransform = async (im: PageImage, body: { new?: number[]; delete?: boolean; replace_path?: string }) => {
    if (!activeDoc) return
    try {
      const res = await apiFetch(`/pdf/transform-image/${activeDoc.doc_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: activeDoc.currentPage, xref: im.xref, old: [im.x0, im.y0, im.x1, im.y1], ...body }),
      })
      if (res.ok) {
        store.setDocDirty(activeDoc.doc_id, true)
        store.invalidatePageCache(activeDoc.doc_id)
        store.invalidateThumbnails(activeDoc.doc_id)
        store.incrementDocVersion(activeDoc.doc_id)
        store.showToast(body.delete ? 'Imagen eliminada' : body.replace_path ? 'Imagen reemplazada' : 'Imagen actualizada', 'success')
        setSelImg(null); setImgPreview(null)
      } else store.showToast('Error al editar la imagen', 'error')
    } catch { store.showToast('Error al editar la imagen', 'error') }
  }

  return {
    pageImages, selImg, setSelImg, imgPreview, setImgPreview,
    imgModeRef, imgStartRef, imgSx, imgSy, imgLocalOf, applyImageTransform,
  }
}
