import type { Field, FormValues } from '../components/FormModal'

// Puente para que código fuera de componentes (lib/, hooks/) abra los mismos
// modales. App registra el handler del useFormModal global al montar.
interface Handler {
  askForm: (title: string, fields: Field[], submitLabel?: string) => Promise<FormValues | null>
  askConfirm: (title: string, message: string, submitLabel?: string) => Promise<boolean>
}

let handler: Handler | null = null

export function registerPromptHandler(h: Handler): void { handler = h }

export function askForm(title: string, fields: Field[], submitLabel?: string): Promise<FormValues | null> {
  return handler ? handler.askForm(title, fields, submitLabel) : Promise.resolve(null)
}

export function askConfirm(title: string, message: string, submitLabel?: string): Promise<boolean> {
  return handler ? handler.askConfirm(title, message, submitLabel) : Promise.resolve(false)
}
