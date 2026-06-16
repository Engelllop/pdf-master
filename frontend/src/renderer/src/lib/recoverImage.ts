import { reopenDeadDoc } from './openDocument'

// If the page bitmap <img> fails to load directly from the backend URL, fetch it
// (the same mechanism the thumbnails use, which works) and swap in a blob: URL.
// This self-heals the "blank page / broken image" issue and logs the real cause so
// it shows up in backend.log via the main process console forwarder.
export async function recoverImage(img: HTMLImageElement, url: string): Promise<void> {
  if (img.dataset.recoveringUrl === url) return // one retry per distinct page URL
  img.dataset.recoveringUrl = url
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`PAGEIMG HTTP ${res.status} ${url}`)
      if (res.status === 404) {
        const docId = url.match(/\/pdf\/page-image\/([0-9a-f-]+)\//)?.[1]
        if (docId) reopenDeadDoc(docId)
      }
      return
    }
    const blob = await res.blob()
    const prev = img.dataset.blobUrl
    const objectUrl = URL.createObjectURL(blob)
    img.dataset.blobUrl = objectUrl
    img.src = objectUrl
    if (prev) URL.revokeObjectURL(prev)
  } catch (err) {
    console.error(`PAGEIMG FETCH-FAIL ${url} ${(err as Error)?.message || err}`)
  }
}
