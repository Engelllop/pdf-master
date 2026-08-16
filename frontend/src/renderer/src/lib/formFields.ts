import { askForm } from './uiPrompt'
import { addFormFieldUndoable, type FormFieldKind } from './pageUndo'
import { usePdfStore } from '../store/usePdfStore'
import { type Field } from '../components/FormModal'

export const FORM_TOOLS = ['formtext', 'formcheck', 'formradio', 'formcombo'] as const
export type FormTool = (typeof FORM_TOOLS)[number]

export function isFormTool(tool: string | null | undefined): tool is FormTool {
  return !!tool && (FORM_TOOLS as readonly string[]).includes(tool)
}

const KIND: Record<FormTool, FormFieldKind> = {
  formtext: 'text',
  formcheck: 'checkbox',
  formradio: 'radio',
  formcombo: 'combo',
}

const DEFAULT_NAME: Record<FormTool, string> = {
  formtext: 'texto',
  formcheck: 'casilla',
  formradio: 'grupo',
  formcombo: 'lista',
}

export async function placeFormField(
  docId: string,
  page: number,
  tool: FormTool,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  let width = rect.width
  let height = rect.height
  if (tool === 'formcheck' || tool === 'formradio') {
    if (width < 10) width = 16
    if (height < 10) height = 16
  } else if (width < 8 || height < 8) {
    usePdfStore.getState().showToast('Selección demasiado pequeña', 'info')
    return
  }
  const fields: Field[] = [
    { name: 'name', label: 'Nombre del campo', type: 'text', defaultValue: DEFAULT_NAME[tool] },
  ]
  if (tool === 'formradio') {
    fields.push({ name: 'option', label: 'Valor de esta opción', type: 'text', defaultValue: 'Sí' })
  }
  if (tool === 'formcombo') {
    fields.push({
      name: 'options',
      label: 'Opciones (una por línea o separadas por coma)',
      type: 'textarea',
      defaultValue: 'Opción 1\nOpción 2\nOpción 3',
    })
  }
  const v = await askForm('Nuevo campo de formulario', fields, 'Crear')
  if (!v) return
  const name = String(v.name || '').trim() || DEFAULT_NAME[tool]
  const options = tool === 'formcombo'
    ? String(v.options || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    : undefined
  const created = await addFormFieldUndoable(docId, {
    page,
    fieldType: KIND[tool],
    fieldName: name,
    x: rect.x,
    y: rect.y,
    width,
    height,
    options,
    radioValue: tool === 'formradio' ? String(v.option || 'Sí') : undefined,
  })
  usePdfStore.getState().showToast(`Campo «${created}» agregado. Ctrl+Z deshace.`, 'success')
  usePdfStore.getState().releaseTool()
}
