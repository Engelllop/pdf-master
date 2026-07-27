/** Registro de comandos para la paleta (Ctrl+K). Las acciones viven en Toolbar
 * (usePdfActions), así que Toolbar publica aquí la lista y la paleta la consume;
 * mismo patrón que uiPrompt. */
export interface Command {
  id: string
  label: string
  group: string
  shortcut?: string
  run: () => void
  disabled?: boolean
}

let commands: Command[] = []
const listeners = new Set<() => void>()

export function registerCommands(cmds: Command[]): void {
  commands = cmds
  listeners.forEach((l) => l())
}

export function getCommands(): Command[] {
  return commands
}

export function subscribeCommands(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
