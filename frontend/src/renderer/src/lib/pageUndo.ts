import { apiFetch } from './api'
import { correrCola } from './batchQueue'
import {
  usePdfStore,
  type Annotation,
  type PageCommand,
  type PageOp,
} from '../store/usePdfStore'

/** `?pages=0&pages=1` — FastAPI lee el parámetro repetido como lista. Vacío o sin
 * definir: el motor sella el documento entero, que es lo que hacía siempre. */
function pagesQuery(pages?: number[]): string {
  return pages?.length ? pages.map((p) => `&pages=${p}`).join('') : ''
}

export function remapAnnsAfterDelete(anns: Annotation[], deleted: number[]): Annotation[] {
  const del = new Set(deleted)
  const sorted = [...deleted].sort((a, b) => a - b)
  return anns
    .filter((a) => !del.has(a.page))
    .map((a) => ({
      ...a,
      page: a.page - sorted.filter((p) => p < a.page).length,
    }))
}

export function remapAnnsAfterInsert(anns: Annotation[], inserted: number[]): Annotation[] {
  let result = anns
  for (const idx of [...inserted].sort((a, b) => a - b)) {
    result = result.map((a) => (a.page >= idx ? { ...a, page: a.page + 1 } : a))
  }
  return result
}

/** El índice se mantiene si esa página sigue existiendo; si no, cae en la siguiente. */
export function remapPageIndexAfterDelete(page: number, deleted: number[]): number {
  return page - deleted.filter((p) => p < page).length
}

export function invertOrder(order: number[]): number[] {
  const inv = new Array(order.length)
  order.forEach((oldIdx, newIdx) => { inv[oldIdx] = newIdx })
  return inv
}

export async function applyPageOp(docId: string, op: PageOp, sibling?: PageOp): Promise<void> {
  if (op.type === 'rotate') {
    if (op.pages === 'all') {
      const res = await apiFetch(`/pdf/rotate-all/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_num: 0, degrees: op.degrees }),
      })
      if (!res.ok) throw new Error('No se pudo rotar el documento')
      return
    }
    const path = op.pages.length === 1 ? `/pdf/rotate/${docId}` : `/pdf/rotate-pages/${docId}`
    const body = op.pages.length === 1
      ? { page_num: op.pages[0], degrees: op.degrees }
      : { pages: op.pages, degrees: op.degrees }
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('No se pudo rotar')
    return
  }

  if (op.type === 'remove') {
    const res = await apiFetch(`/pdf/delete-pages/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: op.pages, stash: true }),
    })
    if (!res.ok) throw new Error('No se pudo eliminar la página')
    const data = await res.json()
    if (sibling && sibling.type === 'restore' && data.stash_id) {
      sibling.stashId = data.stash_id
    }
    return
  }

  if (op.type === 'restore') {
    if (!op.stashId) throw new Error('No hay copia de la página para restaurar')
    const res = await apiFetch(`/pdf/restore-pages/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stash_id: op.stashId, at: op.at }),
    })
    if (!res.ok) throw new Error('No se pudo restaurar la página')
    return
  }

  if (op.type === 'reorder') {
    const res = await apiFetch(`/pdf/reorder/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_order: op.order }),
    })
    if (!res.ok) throw new Error('No se pudo reordenar')
    return
  }

  if (op.type === 'replace') {
    if (!op.stashId) throw new Error('No hay copia de la página para restaurar')
    const res = await apiFetch(`/pdf/replace-page/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_num: op.page, stash_id: op.stashId }),
    })
    if (!res.ok) throw new Error('No se pudo restaurar la página')
    return
  }

  if (op.type === 'crop') {
    const res = await apiFetch(`/pdf/crop/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_num: op.page, top: op.top, right: op.right, bottom: op.bottom, left: op.left, stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo recortar')
    return
  }

  if (op.type === 'redact') {
    const res = await apiFetch(`/pdf/redact/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_num: op.page, x: op.x, y: op.y, width: op.width, height: op.height, stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo redactar')
    return
  }

  if (op.type === 'restoreDoc') {
    if (!op.stashId) throw new Error('No hay copia del documento para restaurar')
    const res = await apiFetch(`/pdf/restore-document/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stash_id: op.stashId }),
    })
    if (!res.ok) throw new Error('No se pudo restaurar el documento')
    return
  }

  if (op.type === 'watermark') {
    const res = await apiFetch(`/pdf/watermark/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: op.text, stash: false, pages: op.pages ?? null }),
    })
    if (!res.ok) throw new Error('No se pudo aplicar la marca de agua')
    return
  }

  if (op.type === 'redactMatches') {
    const res = await apiFetch(`/pdf/redact-matches/${docId}?query=${encodeURIComponent(op.query)}&stash=false`, { method: 'POST' })
    if (!res.ok) throw new Error('No se pudo redactar')
    return
  }

  if (op.type === 'headerFooter') {
    const res = await apiFetch(`/pdf/header-footer/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ header: op.header, footer: op.footer, stash: false, pages: op.pages ?? null }),
    })
    if (!res.ok) throw new Error('No se pudo aplicar encabezado/pie')
    return
  }

  if (op.type === 'pageNumbers') {
    const res = await apiFetch(
      `/pdf/page-numbers/${docId}?prefix=${encodeURIComponent(op.prefix)}&start=${op.start}&position=${op.position}&stash=false${pagesQuery(op.pages)}`,
      { method: 'POST' },
    )
    if (!res.ok) throw new Error('No se pudo numerar')
    return
  }

  if (op.type === 'replaceText') {
    const res = await apiFetch(`/pdf/replace-text/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: op.query,
        replace: op.replace,
        page_num: op.page,
        case_sensitive: op.caseSensitive,
        replace_all: op.replaceAll,
        stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo reemplazar el texto')
    return
  }

  if (op.type === 'editText') {
    const res = await apiFetch(`/pdf/edit-text/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_num: op.page, x0: op.x0, y0: op.y0, x1: op.x1, y1: op.y1,
        text: op.text, size: op.size, color: op.color, font: op.font, stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo editar el texto')
    return
  }

  if (op.type === 'transformImage') {
    const res = await apiFetch(`/pdf/transform-image/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_num: op.page, xref: op.xref, old: op.old, new: op.new,
        delete: op.delete, replace_path: op.replacePath, stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo editar la imagen')
    return
  }

  if (op.type === 'metadata') {
    const res = await apiFetch(`/pdf/metadata/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: op.title ?? undefined,
        author: op.author ?? undefined,
        subject: op.subject ?? undefined,
        keywords: op.keywords ?? undefined,
      }),
    })
    if (!res.ok) throw new Error('No se pudieron actualizar los metadatos')
    applyMetaToStore(docId, op)
    return
  }

  if (op.type === 'makeSearchable') {
    const qs = new URLSearchParams({ stash: 'false' })
    if (op.page != null) qs.set('page', String(op.page))
    const res = await apiFetch(`/pdf/make-searchable/${docId}?${qs}`, { method: 'POST' })
    if (!res.ok) throw new Error('No se pudo aplicar OCR')
    return
  }

  if (op.type === 'formField') {
    const res = await apiFetch(`/pdf/widgets/${docId}/${op.page}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_name: op.fieldName, value: op.value, stash: false }),
    })
    if (!res.ok) throw new Error('No se pudo actualizar el campo')
    return
  }

  if (op.type === 'addFormField') {
    const res = await apiFetch(`/pdf/widgets/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_num: op.page, field_type: op.fieldType, field_name: op.fieldName,
        x: op.x, y: op.y, width: op.width, height: op.height,
        options: op.options ?? [], radio_value: op.radioValue, stash: false,
      }),
    })
    if (!res.ok) throw new Error('No se pudo crear el campo')
    return
  }

  if (op.type === 'transformFormField') {
    const res = await apiFetch(`/pdf/widgets/${docId}/${op.page}/transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xref: op.xref, x: op.x, y: op.y, width: op.width, height: op.height,
        delete: op.delete, stash: false,
      }),
    })
    if (!res.ok) throw new Error(op.delete ? 'No se pudo eliminar el campo' : 'No se pudo mover el campo')
    return
  }

  const _exhaustive: never = op
  void _exhaustive
}

export type DocMeta = {
  title?: string | null
  author?: string | null
  subject?: string | null
  keywords?: string | null
}

function applyMetaToStore(docId: string, meta: DocMeta) {
  usePdfStore.setState((s) => ({
    docs: s.docs.map((d) =>
      d.doc_id === docId
        ? {
            ...d,
            title: meta.title !== undefined ? meta.title || null : d.title,
            author: meta.author !== undefined ? meta.author || null : d.author,
            subject: meta.subject !== undefined ? meta.subject || null : d.subject,
            dirty: true,
          }
        : d,
    ),
  }))
}

export async function refreshDocLayout(docId: string): Promise<void> {
  const s = usePdfStore.getState()
  const res = await apiFetch(`/pdf/info/${docId}`)
  if (res.ok) {
    const info = await res.json()
    s.updateDocPageCount(docId, info.page_count)
    s.updateDocPageSizes(docId, info.page_sizes)
    const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
    if (doc && doc.currentPage >= info.page_count) {
      s.setPage(docId, Math.max(0, info.page_count - 1))
    }
  }
  s.setDocDirty(docId, true)
  s.invalidatePageCache(docId)
  s.invalidateThumbnails(docId)
  s.incrementDocVersion(docId)
}

function commitPageCommand(cmd: Omit<PageCommand, 'kind'>, afterAnns: Annotation[]) {
  usePdfStore.setState((state) => ({
    docs: state.docs.map((d) =>
      d.doc_id === cmd.docId ? { ...d, annotations: afterAnns, dirty: true } : d,
    ),
    undoStack: [...state.undoStack, { ...cmd, kind: 'page' as const }].slice(-100),
    redoStack: [],
  }))
}

export async function finishPageCommand(cmd: PageCommand, dir: 'undo' | 'redo'): Promise<void> {
  try {
    const op = dir === 'undo' ? cmd.inverse : cmd.forward
    const sibling = dir === 'undo' ? cmd.forward : cmd.inverse
    await applyPageOp(cmd.docId, op, sibling)
    if (op.type === 'reorder') {
      usePdfStore.getState().reorderPages(cmd.docId, op.order)
    }
    usePdfStore.setState((s) => ({
      docs: s.docs.map((d) =>
        d.doc_id === cmd.docId
          ? { ...d, annotations: dir === 'undo' ? cmd.beforeAnns : cmd.afterAnns, dirty: true }
          : d,
      ),
      pageUndoBusy: false,
    }))
    await refreshDocLayout(cmd.docId)
  } catch (err) {
    usePdfStore.setState((s) =>
      dir === 'undo'
        ? {
            pageUndoBusy: false,
            undoStack: [...s.undoStack, cmd],
            redoStack: s.redoStack.filter((c) => c !== cmd),
          }
        : {
            pageUndoBusy: false,
            redoStack: [...s.redoStack, cmd],
            undoStack: s.undoStack.filter((c) => c !== cmd),
          },
    )
    const msg = err instanceof Error ? err.message : 'No se pudo deshacer el cambio de página'
    usePdfStore.getState().showToast(msg, 'error')
  }
}

export async function rotatePagesUndoable(docId: string, pages: number[] | 'all', degrees: number) {
  if (pages !== 'all' && pages.length === 0) return
  const forward: PageOp = { type: 'rotate', pages, degrees }
  await applyPageOp(docId, forward)
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'rotate', pages, degrees: -degrees },
    forward,
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
  await refreshDocLayout(docId)
}

export async function deletePagesUndoable(docId: string, pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  if (sorted.length === 0) return
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return
  const beforeAnns = doc.annotations
  const afterAnns = remapAnnsAfterDelete(beforeAnns, sorted)
  const forward: PageOp = { type: 'remove', pages: sorted }
  const inverse: PageOp = { type: 'restore', stashId: '', at: sorted }
  await applyPageOp(docId, forward, inverse)
  commitPageCommand({ docId, inverse, forward, beforeAnns, afterAnns }, afterAnns)
  usePdfStore.getState().setPage(
    docId,
    Math.max(0, remapPageIndexAfterDelete(doc.currentPage, sorted)),
  )
  await refreshDocLayout(docId)
}

export async function insertBlankUndoable(docId: string, index: number) {
  const res = await apiFetch(`/pdf/insert-blank/${docId}?index=${index}`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo insertar la página')
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return
  const beforeAnns = doc.annotations
  const afterAnns = remapAnnsAfterInsert(beforeAnns, [index])
  commitPageCommand({
    docId,
    inverse: { type: 'remove', pages: [index] },
    forward: { type: 'restore', stashId: '', at: [index] },
    beforeAnns,
    afterAnns,
  }, afterAnns)
  await refreshDocLayout(docId)
}

export async function reorderPagesUndoable(docId: string, order: number[]) {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return
  const beforeAnns = doc.annotations
  await applyPageOp(docId, { type: 'reorder', order })
  usePdfStore.getState().reorderPages(docId, order)
  const afterAnns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? beforeAnns
  commitPageCommand({
    docId,
    inverse: { type: 'reorder', order: invertOrder(order) },
    forward: { type: 'reorder', order },
    beforeAnns,
    afterAnns,
  }, afterAnns)
  usePdfStore.getState().incrementDocVersion(docId)
  usePdfStore.getState().setDocDirty(docId, true)
}

export async function cropPageUndoable(
  docId: string,
  page: number,
  box: { top: number; right: number; bottom: number; left: number },
) {
  const res = await apiFetch(`/pdf/crop/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_num: page, ...box, stash: true }),
  })
  if (!res.ok) throw new Error('No se pudo recortar')
  const data = await res.json()
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'replace', page, stashId: data.stash_id || '' },
    forward: { type: 'crop', page, ...box },
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
  await refreshDocLayout(docId)
}

export async function redactAreaUndoable(
  docId: string,
  page: number,
  box: { x: number; y: number; width: number; height: number },
) {
  const res = await apiFetch(`/pdf/redact/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_num: page, ...box, stash: true }),
  })
  if (!res.ok) throw new Error('No se pudo redactar')
  const data = await res.json()
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'replace', page, stashId: data.stash_id || '' },
    forward: { type: 'redact', page, ...box },
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
  await refreshDocLayout(docId)
}

export async function duplicatePageUndoable(docId: string, pageNum: number) {
  const res = await apiFetch(`/pdf/duplicate-page/${docId}?page_num=${pageNum}`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo duplicar')
  const inserted = pageNum + 1
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return
  const beforeAnns = doc.annotations
  const afterAnns = remapAnnsAfterInsert(beforeAnns, [inserted])
  commitPageCommand({
    docId,
    inverse: { type: 'remove', pages: [inserted] },
    forward: { type: 'restore', stashId: '', at: [inserted] },
    beforeAnns,
    afterAnns,
  }, afterAnns)
  await refreshDocLayout(docId)
}

function commitDocStash(docId: string, stashId: string, forward: PageOp) {
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'restoreDoc', stashId },
    forward,
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
}

export async function watermarkUndoable(docId: string, text: string, pages?: number[]) {
  const res = await apiFetch(`/pdf/watermark/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, stash: true, pages: pages ?? null }),
  })
  if (!res.ok) throw new Error('No se pudo aplicar la marca de agua')
  const data = await res.json()
  commitDocStash(docId, data.stash_id || '', { type: 'watermark', text, pages })
  await refreshDocLayout(docId)
}

export async function redactMatchesUndoable(docId: string, query: string): Promise<number> {
  const res = await apiFetch(`/pdf/redact-matches/${docId}?query=${encodeURIComponent(query)}&stash=true`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo redactar')
  const data = await res.json()
  if (data.stash_id) {
    commitDocStash(docId, data.stash_id, { type: 'redactMatches', query })
  }
  await refreshDocLayout(docId)
  return data.redacted ?? 0
}

export async function headerFooterUndoable(docId: string, header?: string, footer?: string, pages?: number[]) {
  const res = await apiFetch(`/pdf/header-footer/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ header, footer, stash: true, pages: pages ?? null }),
  })
  if (!res.ok) throw new Error('No se pudo aplicar encabezado/pie')
  const data = await res.json()
  commitDocStash(docId, data.stash_id || '', { type: 'headerFooter', header, footer, pages })
  await refreshDocLayout(docId)
}

export async function pageNumbersUndoable(docId: string, prefix: string, start: number, position: string, pages?: number[]) {
  const res = await apiFetch(
    `/pdf/page-numbers/${docId}?prefix=${encodeURIComponent(prefix)}&start=${start}&position=${position}&stash=true${pagesQuery(pages)}`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error('No se pudo numerar')
  const data = await res.json()
  commitDocStash(docId, data.stash_id || '', { type: 'pageNumbers', prefix, start, position, pages })
  await refreshDocLayout(docId)
}

export async function mergePdfUndoable(docId: string, sourcePath: string) {
  const doc = usePdfStore.getState().docs.find((d) => d.doc_id === docId)
  if (!doc) return
  const oldCount = doc.page_count
  const beforeAnns = doc.annotations
  const res = await apiFetch(`/pdf/merge/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_path: sourcePath }),
  })
  if (!res.ok) throw new Error('No se pudo combinar')
  const data = await res.json()
  if (!data.success) throw new Error('No se pudo combinar')
  await refreshDocLayout(docId)
  const newCount = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.page_count ?? oldCount
  const added = Array.from({ length: Math.max(0, newCount - oldCount) }, (_, i) => oldCount + i)
  if (added.length === 0) return
  commitPageCommand({
    docId,
    inverse: { type: 'remove', pages: added },
    forward: { type: 'restore', stashId: '', at: added },
    beforeAnns,
    afterAnns: beforeAnns,
  }, beforeAnns)
}

function commitPageStash(docId: string, page: number, stashId: string, forward: PageOp) {
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'replace', page, stashId },
    forward,
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
}

export async function replaceTextUndoable(
  docId: string,
  params: { query: string; replace: string; page?: number; caseSensitive: boolean; replaceAll: boolean },
): Promise<number> {
  const res = await apiFetch(`/pdf/replace-text/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: params.query,
      replace: params.replace,
      page_num: params.page,
      case_sensitive: params.caseSensitive,
      replace_all: params.replaceAll,
      stash: true,
    }),
  })
  if (!res.ok) throw new Error('No se pudo reemplazar el texto')
  const data = await res.json()
  if (data.replaced > 0 && data.stash_id) {
    const forward: PageOp = {
      type: 'replaceText',
      query: params.query,
      replace: params.replace,
      page: params.page,
      caseSensitive: params.caseSensitive,
      replaceAll: params.replaceAll,
    }
    if (data.stash_page != null) commitPageStash(docId, data.stash_page, data.stash_id, forward)
    else commitDocStash(docId, data.stash_id, forward)
  }
  await refreshDocLayout(docId)
  return data.replaced ?? 0
}

export async function editTextUndoable(
  docId: string,
  params: { page: number; x0: number; y0: number; x1: number; y1: number; text: string; size?: number; color: string; font?: string },
) {
  const res = await apiFetch(`/pdf/edit-text/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, page_num: params.page, stash: true }),
  })
  if (!res.ok) throw new Error('No se pudo editar el texto')
  const data = await res.json()
  commitPageStash(docId, params.page, data.stash_id || '', { type: 'editText', ...params })
  await refreshDocLayout(docId)
}

export async function transformImageUndoable(
  docId: string,
  params: { page: number; xref: number; old: number[]; new?: number[]; delete?: boolean; replacePath?: string },
) {
  const res = await apiFetch(`/pdf/transform-image/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page_num: params.page, xref: params.xref, old: params.old, new: params.new,
      delete: params.delete, replace_path: params.replacePath, stash: true,
    }),
  })
  if (!res.ok) throw new Error('No se pudo editar la imagen')
  const data = await res.json()
  commitPageStash(docId, params.page, data.stash_id || '', { type: 'transformImage', ...params })
  await refreshDocLayout(docId)
}

export async function metadataUndoable(docId: string, next: DocMeta) {
  const res = await apiFetch(`/pdf/metadata/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: next.title ?? undefined,
      author: next.author ?? undefined,
      subject: next.subject ?? undefined,
      keywords: next.keywords ?? undefined,
    }),
  })
  if (!res.ok) throw new Error('No se pudieron actualizar los metadatos')
  const data = await res.json()
  const previous: DocMeta = data.previous ?? {}
  applyMetaToStore(docId, next)
  const anns = usePdfStore.getState().docs.find((d) => d.doc_id === docId)?.annotations ?? []
  commitPageCommand({
    docId,
    inverse: { type: 'metadata', ...previous },
    forward: { type: 'metadata', ...next },
    beforeAnns: anns,
    afterAnns: anns,
  }, anns)
}

export async function makeSearchableUndoable(docId: string, page?: number): Promise<number> {
  const qs = new URLSearchParams({ stash: 'true' })
  if (page != null) qs.set('page', String(page))
  const res = await apiFetch(`/pdf/make-searchable/${docId}?${qs}`, { method: 'POST' })
  if (res.status === 503) throw new Error('Tesseract OCR no está instalado')
  if (!res.ok) throw new Error('Error en OCR')
  const data = await res.json()
  const words = data.words ?? 0
  if (words > 0 && data.stash_id) {
    const forward: PageOp = { type: 'makeSearchable', page }
    if (data.stash_page != null) commitPageStash(docId, data.stash_page, data.stash_id, forward)
    else commitDocStash(docId, data.stash_id, forward)
  }
  await refreshDocLayout(docId)
  return words
}

/**
 * OCR de varias páginas, una llamada al motor por página, con progreso y cancelación
 * y UN solo paso de deshacer.
 *
 * Antes era una sola petición para todo el documento: minutos con el motor tomado, sin
 * progreso real y sin forma de cortar. El stash se toma una vez al principio (por eso
 * existe `/pdf/stash-document`), así deshacer devuelve el documento como estaba —no
 * una página a la vez— y lo ya reconocido se conserva si el usuario cancela.
 */
export async function makeSearchableAllUndoable(
  docId: string,
  paginas: number[],
  ctrl: { avanzar: (procesadas: number, page: number) => void; cancelado: () => boolean },
): Promise<{ palabras: number; hechas: number; cancelado: boolean }> {
  const st = await apiFetch(`/pdf/stash-document/${docId}`, { method: 'POST' })
  const stashId: string = st.ok ? (await st.json()).stash_id || '' : ''

  let palabras = 0
  const r = await correrCola(paginas, async (p) => {
    const res = await apiFetch(`/pdf/make-searchable/${docId}?page=${p}&stash=false`, { method: 'POST' })
    if (res.status === 503) throw new Error('Tesseract OCR no está instalado')
    if (!res.ok) return false
    palabras += (await res.json()).words ?? 0
    return true
  }, ctrl)

  // Sin palabras nuevas no hubo cambio: apilar un paso que no deshace nada solo
  // estorba (y se comería un hueco de la pila de 100).
  if (palabras > 0 && stashId) {
    commitDocStash(docId, stashId, { type: 'makeSearchable' })
  }
  await refreshDocLayout(docId)
  return { palabras, hechas: r.hechos, cancelado: r.cancelado }
}

export async function formFieldUndoable(docId: string, page: number, fieldName: string, value: string) {
  const res = await apiFetch(`/pdf/widgets/${docId}/${page}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: fieldName, value, stash: true }),
  })
  if (!res.ok) throw new Error('No se pudo actualizar el campo')
  const data = await res.json()
  if ((data.previous ?? '') === value) return
  if (data.stash_id) {
    const forward: PageOp = { type: 'formField', page, fieldName, value }
    // Si el campo tenía widgets en varias páginas, el motor stashea el documento
    // entero: restaurar una sola página dejaría las otras hojas con el valor nuevo.
    // Se exige la bandera explícita en vez de deducirlo de que falte `stash_page`: un
    // motor viejo no manda ninguno de los dos campos, y ahí el stash ES de una página
    // — restaurarlo como documento lo dejaría de una hoja.
    if (data.stash_scope === 'document') commitDocStash(docId, data.stash_id, forward)
    else commitPageStash(docId, page, data.stash_id, forward)
  }
  const s = usePdfStore.getState()
  s.setDocDirty(docId, true)
  s.invalidatePageCache(docId)
  s.incrementDocVersion(docId)
}

export type FormFieldKind = 'text' | 'checkbox' | 'radio' | 'combo'

export async function addFormFieldUndoable(
  docId: string,
  params: {
    page: number
    fieldType: FormFieldKind
    fieldName: string
    x: number
    y: number
    width: number
    height: number
    options?: string[]
    radioValue?: string
  },
): Promise<string> {
  const res = await apiFetch(`/pdf/widgets/${docId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page_num: params.page,
      field_type: params.fieldType,
      field_name: params.fieldName,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      options: params.options ?? [],
      radio_value: params.radioValue,
      stash: true,
    }),
  })
  if (!res.ok) throw new Error('No se pudo crear el campo')
  const data = await res.json()
  const name = data.field_name || params.fieldName
  if (data.stash_id) {
    commitPageStash(docId, params.page, data.stash_id, {
      type: 'addFormField',
      page: params.page,
      fieldType: params.fieldType,
      fieldName: params.fieldName,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      options: params.options,
      radioValue: params.radioValue,
    })
  }
  const store = usePdfStore.getState()
  store.setDocDirty(docId, true)
  store.invalidatePageCache(docId)
  store.incrementDocVersion(docId)
  return name
}

export async function transformFormFieldUndoable(
  docId: string,
  page: number,
  params: { xref: number; x?: number; y?: number; width?: number; height?: number; delete?: boolean },
) {
  const res = await apiFetch(`/pdf/widgets/${docId}/${page}/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, stash: true }),
  })
  if (!res.ok) throw new Error(params.delete ? 'No se pudo eliminar el campo' : 'No se pudo mover el campo')
  const data = await res.json()
  if (data.stash_id) {
    commitPageStash(docId, page, data.stash_id, { type: 'transformFormField', page, ...params })
  }
  const store = usePdfStore.getState()
  store.setDocDirty(docId, true)
  store.invalidatePageCache(docId)
  store.incrementDocVersion(docId)
}
