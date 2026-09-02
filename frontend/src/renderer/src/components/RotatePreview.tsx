import { useEffect, useState } from 'react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { renderPdfThumbnail } from '../lib/pdfjs'
import { revokePageUrl } from '../lib/blobUrl'

/** Vista previa al pasar el ratón por los botones de rotar: se ve hacia dónde va a
 * quedar la página antes de tocarla (sin esto había que rotar varias veces hasta
 * acertar el sentido). */
export default function RotatePreview({ degrees, all = false, children }: {
  degrees: number
  all?: boolean
  children: React.ReactNode
}) {
  const { docs, activeDocId } = useStoreSlice('docs', 'activeDocId')
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const [hover, setHover] = useState(false)
  const [thumb, setThumb] = useState<string | null>(null)

  const page = activeDoc?.currentPage ?? 0
  const cached = activeDoc?.thumbnails.get(page) || null

  // Sin esto, al cambiar de página la vista previa mostraba la miniatura de la
  // anterior hasta que llegaba la nueva.
  // El blob de la miniatura anterior lo revoca la limpieza del efecto de abajo.
  useEffect(() => { setThumb(null) }, [activeDoc?.doc_id, page, activeDoc?.docVersion])

  useEffect(() => {
    if (!hover || !activeDoc || cached) return
    let alive = true
    renderPdfThumbnail(activeDoc.doc_id, activeDoc.docVersion, page)
      .then(({ url }) => {
        if (alive) setThumb(url)
        else revokePageUrl(url) // llegó tarde: nadie la va a pintar
      })
      .catch(() => {})
    return () => { alive = false }
  }, [hover, activeDoc?.doc_id, activeDoc?.docVersion, page, cached])

  // La miniatura propia es un blob URL: sin esto, pasar el ratón por rotar en cada
  // página de un documento largo iba dejando bitmaps en RAM.
  useEffect(() => () => { revokePageUrl(thumb ?? undefined) }, [thumb])

  const src = cached || thumb

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {children}
      {hover && src && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-overlay-menu p-2 rounded-token border border-border bg-panel shadow-token-lg pointer-events-none">
          <div className="w-24 h-24 flex items-center justify-center overflow-hidden">
            <img src={src} alt="" draggable={false}
              className="max-w-full max-h-full shadow-token-sm transition-transform duration-200"
              style={{ transform: `rotate(${degrees}deg)` }} />
          </div>
          <div className="text-micro text-center text-muted mt-1">
            {all ? 'Todas las páginas' : `Página ${page + 1}`}
          </div>
        </div>
      )}
    </div>
  )
}
