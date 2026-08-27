import { esCapaOculta, usePdfStore } from '../store/usePdfStore'
import { apiFetch } from './api'
import { askConfirm } from './uiPrompt'

/** Guarda un documento: incrusta las marcas y escribe el PDF. Lo comparten el menú
 * Archivo, "Guardar como" y el aviso de cambios sin guardar, para que no se separen
 * — "Guardar como" escribía el PDF SIN incrustar y el archivo exportado salía sin
 * ninguna anotación.
 *
 * No se escribe sidecar: las marcas viajan dentro del PDF, así que un
 * `.pdfmaster.json` al lado de cada archivo solo era ruido (y una segunda copia que
 * se desincronizaba).
 *
 * Con `outputPath` guarda una copia: el documento sigue sucio porque el original
 * no se ha tocado. */
/** Sube las marcas vigentes al motor como "pendientes", sin escribir nada a disco.
 * Lo comparten el guardado y la impresión: el motor las dibuja sobre una copia cuando
 * le piden el PDF, así que imprimir ya no manda el documento limpio. */
export async function pushAnnotations(
  docId: string,
  opts: { excluirCapasOcultas?: boolean } = {},
): Promise<boolean> {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return false
  // Al imprimir se puede pedir lo que se ve en pantalla: las capas apagadas se quedan
  // fuera del papel. El GUARDADO nunca las excluye — ahí ocultar sería borrar.
  const marcas = opts.excluirCapasOcultas
    ? doc.annotations.filter((a) => !esCapaOculta(doc, a))
    : doc.annotations
  if (!marcas.length) return true
  const res = await apiFetch(`/pdf/embed/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: marcas }),
  })
  return res.ok
}

/**
 * Compara el archivo en disco con el estado que tenía al abrirlo. Si cambió, pregunta:
 * un cliente de sincronización (Drive, OneDrive) o otro programa pueden haberlo
 * modificado mientras estaba abierto, y guardar encima se llevaba esos cambios sin
 * decir nada — justo lo que el producto promete no hacer con un archivo entregado.
 */
async function elDiscoCambio(docId: string): Promise<'igual' | 'cambio' | 'desconocido'> {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc?.diskState) return 'desconocido'
  try {
    const res = await apiFetch(`/pdf/disk-state/${docId}`)
    if (!res.ok) return 'desconocido'
    const ahora = await res.json()
    if (ahora.missing) return 'igual' // archivo movido/borrado: guardar lo vuelve a crear
    const igual = Math.abs(ahora.mtime - doc.diskState.mtime) < 1 && ahora.size === doc.diskState.size
    return igual ? 'igual' : 'cambio'
  } catch {
    return 'desconocido'
  }
}

/** Windows no distingue mayúsculas ni el sentido de las barras: `C:/Planos/A.pdf` y
 * `c:\planos\a.pdf` son el mismo archivo, y comparar las cadenas tal cual decía que no. */
export function mismaRuta(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const norm = (r: string) => r.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/**
 * Aviso antes de sobrescribir el archivo original: devuelve false si el usuario cancela.
 * Exportado porque «Guardar con contraseña» también escribe encima del original por su
 * propio camino, y sin esto era la única ruta de guardado sin la protección.
 */
export async function confirmarSobrescritura(docId: string): Promise<boolean> {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return false
  if ((await elDiscoCambio(docId)) !== 'cambio') return true
  return askConfirm(
    'El archivo cambió en disco',
    `«${doc.file_name}» fue modificado por otro programa (o por un cliente de`
    + ' sincronización) desde que lo abriste.\n\nSi guardás ahora, esos cambios se'
    + ' pierden. Podés cancelar y usar «Guardar como» para no tocar el original.',
    'Guardar de todos modos',
  )
}

/** Vuelve a leer fecha+tamaño tras escribir: sin esto, nuestro propio guardado dispara
 * el aviso de «cambió en disco» la próxima vez — el falso positivo que enseña al
 * usuario a ignorar los avisos. */
export async function refrescarEstadoEnDisco(docId: string): Promise<void> {
  try {
    const st = await apiFetch(`/pdf/disk-state/${docId}`)
    if (!st.ok) return
    const estado = await st.json()
    if (!estado.missing) {
      usePdfStore.getState().setDiskState(docId, { mtime: estado.mtime, size: estado.size })
    }
  } catch { /* si no se puede leer, el próximo guardado preguntará de más, no de menos */ }
}

/**
 * Para las operaciones que escriben a una ruta que elige el usuario (comprimir, quitar
 * contraseña): el cuadro de guardar deja elegir el propio archivo del documento, y ahí
 * sí hay que pasar por el aviso de cambio en disco. Devuelve si se puede seguir y si
 * hay que refrescar la referencia al terminar.
 */
export async function confirmarEscrituraEn(
  docId: string, outputPath: string,
): Promise<{ seguir: boolean; eraElOriginal: boolean }> {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  const eraElOriginal = mismaRuta(outputPath, doc?.file_path)
  if (!eraElOriginal) return { seguir: true, eraElOriginal }
  return { seguir: await confirmarSobrescritura(docId), eraElOriginal }
}

export async function saveDocument(docId: string, outputPath?: string): Promise<boolean> {
  const { docs, backupOnSave, setDocDirty } = usePdfStore.getState()
  const doc = docs.find((d) => d.doc_id === docId)
  if (!doc) return false

  // «Guardar como» sobre la propia ruta del documento ES sobrescribir el original: sin
  // esto se saltaba el aviso de cambio externo y encima no limpiaba el «sin guardar».
  const sobrescribeElOriginal = !outputPath || mismaRuta(outputPath, doc.file_path)

  // Guardar encima de un archivo que otra pestaña tiene abierto deja a esa pestaña
  // desincronizada del disco: su próximo guardado pisaría esto. (El aviso de cambio
  // externo la protege, pero conviene saberlo ANTES de escribir.)
  if (outputPath && !sobrescribeElOriginal) {
    const otra = docs.find((d) => d.doc_id !== docId && mismaRuta(d.file_path, outputPath))
    if (otra) {
      const seguir = await askConfirm(
        'Ese archivo está abierto en otra pestaña',
        `«${otra.file_name}» está abierto en otra pestaña. Si guardás encima, esa pestaña`
        + ' queda desincronizada del disco y su próximo guardado pisaría lo que escribas'
        + ' ahora.',
        'Guardar de todos modos',
      )
      if (!seguir) return false
    }
  }

  if (sobrescribeElOriginal && !(await confirmarSobrescritura(docId))) return false
  const embedRes = await apiFetch(`/pdf/embed/${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotations: doc.annotations }),
  })
  if (!embedRes.ok) return false

  const params = new URLSearchParams()
  if (outputPath) params.set('output_path', outputPath)
  else if (backupOnSave) params.set('backup', 'true')
  const query = params.toString()
  const res = await apiFetch(`/pdf/save/${docId}${query ? `?${query}` : ''}`, { method: 'POST' })
  if (!res.ok) return false
  await avisarSiFallóLaCopia(res)

  // El propio guardado cambia la fecha del archivo: sin actualizar la referencia, el
  // siguiente guardado avisaría de un cambio externo que fuimos nosotros.
  if (sobrescribeElOriginal) {
    await refrescarEstadoEnDisco(docId)
    setDocDirty(docId, false)
  }
  return true
}

/** El motor guarda igual si no pudo crear el .bak (el usuario pidió guardar), pero
 * callarlo deja al usuario creyendo que tiene una copia de respaldo del archivo que
 * acaba de sobrescribir. */
export async function avisarSiFallóLaCopia(res: Response): Promise<void> {
  try {
    const data = await res.clone().json()
    if (data?.backup_failed) {
      usePdfStore.getState().showToast('Guardado, pero no se pudo crear la copia .bak', 'error')
    }
  } catch { /* respuesta sin cuerpo JSON: nada que avisar */ }
}
