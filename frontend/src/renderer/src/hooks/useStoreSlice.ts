import { useShallow } from 'zustand/react/shallow'
import { usePdfStore, type PdfState } from '../store/usePdfStore'

// Suscripción granular: el componente solo re-renderiza si cambia alguno de los
// campos pedidos (antes usePdfStore() completo re-renderizaba TODO el árbol en
// cada cambio del store, p.ej. cada evento de scroll o cada toast).
// El tipo Pick<> hace que typecheck falle si el componente usa un campo no pedido.
export function useStoreSlice<K extends keyof PdfState>(...keys: K[]): Pick<PdfState, K> {
  return usePdfStore(
    useShallow((s) => {
      const slice = {} as Pick<PdfState, K>
      for (const k of keys) slice[k] = s[k]
      return slice
    })
  )
}
