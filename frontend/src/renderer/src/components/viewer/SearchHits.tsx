import type { PdfDoc } from '../../store/usePdfStore'

/** El latido es SMIL (`<animate>`), y a eso no le llega la regla de App.css que apaga
 * las animaciones CSS: hay que consultar la preferencia a mano o el visor ignora
 * «reducir movimiento» justo en el elemento que late sin parar. Sin latido la actual
 * se sigue distinguiendo por color (--hit-active) y grosor de borde. */
function latidoPermitido(): boolean {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Coincidencias de la búsqueda pintadas sobre la página: todas en --hit y la actual
 * en --hit-active, latiendo. El par es ciruela y no ámbar/naranja porque el ámbar de
 * antes (#fbbf24) era exactamente el color por defecto de las marcas del usuario: un
 * resultado de búsqueda y un resaltado propio se veían igual. Distinguir la actual es
 * lo que importa: saber que hay 12 resultados no sirve si no se ve en cuál estás.
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
  const late = latidoPermitido()
  return (
    <>
      {results.map((r, idx) => {
        if (r.page !== page) return null
        const actual = idx === index
        return (
          <rect key={`search-${idx}`}
            x={r.x * escalaX} y={r.y * escalaY}
            width={r.width * escalaX} height={r.height * escalaY}
            fill={actual ? 'rgb(var(--hit-active))' : 'rgb(var(--hit))'}
            fillOpacity={actual ? 0.5 : 0.25}
            stroke={actual ? 'rgb(var(--hit-active))' : 'rgb(var(--hit))'}
            strokeWidth={actual ? 2 : 1}
            rx={2}
            pointerEvents="none"
            data-search-hit={actual ? 'actual' : 'otro'}
          >
            {actual && late && <animate attributeName="fill-opacity" values="0.5;0.8;0.5" dur="1.2s" repeatCount="indefinite" />}
          </rect>
        )
      })}
    </>
  )
}
