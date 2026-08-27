import type { PdfDoc } from '../../store/usePdfStore'

/** Coincidencias de la búsqueda pintadas sobre la página: todas en amarillo y la actual
 * en naranja, latiendo. La actual es la información que importa — en una lámina con
 * doscientas etiquetas, saber que hay 12 resultados no sirve si no se ve en cuál estás.
 *
 * Compartido por el visor de página y el scroll continuo, que no pintaba ninguna: en
 * continuo buscar te dejaba en la página y a buscar a ojo. */
export default function SearchHits({ results, index, page, escalaX, escalaY }: {
  results: PdfDoc['searchResults']
  index: number
  page: number
  escalaX: number
  escalaY: number
}) {
  return (
    <>
      {results.map((r, idx) => {
        if (r.page !== page) return null
        const actual = idx === index
        return (
          <rect key={`search-${idx}`}
            x={r.x * escalaX} y={r.y * escalaY}
            width={r.width * escalaX} height={r.height * escalaY}
            fill={actual ? '#f97316' : '#fbbf24'}
            fillOpacity={actual ? 0.5 : 0.25}
            stroke={actual ? '#f97316' : '#fbbf24'}
            strokeWidth={actual ? 2 : 1}
            rx={2}
            pointerEvents="none"
            data-search-hit={actual ? 'actual' : 'otro'}
          >
            {actual && <animate attributeName="fill-opacity" values="0.5;0.8;0.5" dur="1.2s" repeatCount="indefinite" />}
          </rect>
        )
      })}
    </>
  )
}
