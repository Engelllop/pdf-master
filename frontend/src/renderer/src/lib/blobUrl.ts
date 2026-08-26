// Revoca el blob URL de un bitmap de página. Vive aparte de `lib/pdfjs` para que el
// store pueda liberar sus caches sin arrastrar pdfjs-dist (y su worker) a su grafo
// de módulos.
export function revokePageUrl(url: string | undefined): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}
