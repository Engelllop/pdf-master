import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  openFile: (filters?: Electron.FileFilter[]) => ipcRenderer.invoke('dialog:openFile', filters),
  openFiles: (filters?: Electron.FileFilter[], defaultPath?: string) => ipcRenderer.invoke('dialog:openFiles', filters, defaultPath),
  saveFile: (options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => ipcRenderer.invoke('dialog:saveFile', options),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  setTitleOverlay: (opts: { color: string; symbolColor: string }) => ipcRenderer.invoke('window:set-overlay', opts),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  newWindow: () => ipcRenderer.invoke('window:new'),
  logError: (message: string) => ipcRenderer.invoke('log:error', message),
  osUsername: (): Promise<string> => ipcRenderer.invoke('os:username'),
  setUiZoom: (factor: number): Promise<void> => ipcRenderer.invoke('window:set-ui-zoom', factor),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:showInFolder', path),
  openFolder: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  readFileBase64: (path: string) => ipcRenderer.invoke('file:readBase64', path),
  printPdf: (docId: string, opts?: { pageRanges?: string; copies?: number }) => ipcRenderer.invoke('pdf:print', docId, opts),
  aiChat: (payload: { requestId: string; docId: string | null; messages: { role: 'user' | 'assistant'; text: string }[]; scope?: 'doc' | 'page'; page?: number }) => ipcRenderer.send('ai:chat', payload),
  aiAbort: (requestId: string) => ipcRenderer.send('ai:abort', requestId),
  aiSetKey: (key: string | null): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('ai:set-key', key),
  aiHasKey: (): Promise<boolean> => ipcRenderer.invoke('ai:has-key'),
  onAiChunk: (cb: (d: { requestId: string; text: string }) => void) => {
    const h = (_e: unknown, d: { requestId: string; text: string }) => cb(d)
    ipcRenderer.on('ai:chunk', h)
    return () => ipcRenderer.removeListener('ai:chunk', h)
  },
  onAiDone: (cb: (d: { requestId: string }) => void) => {
    const h = (_e: unknown, d: { requestId: string }) => cb(d)
    ipcRenderer.on('ai:done', h)
    return () => ipcRenderer.removeListener('ai:done', h)
  },
  onAiError: (cb: (d: { requestId: string; error: string }) => void) => {
    const h = (_e: unknown, d: { requestId: string; error: string }) => cb(d)
    ipcRenderer.on('ai:error', h)
    return () => ipcRenderer.removeListener('ai:error', h)
  },
  setDirtyState: (dirty: boolean) => ipcRenderer.send('app:dirty-state', dirty),
  rendererReady: () => ipcRenderer.send('app:renderer-ready'),
  onOpenFile: (callback: (path: string) => void) => {
    ipcRenderer.on('app:open-file', (_event, path) => callback(path))
  },
  removeOpenFileListener: () => {
    ipcRenderer.removeAllListeners('app:open-file')
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}

export type Api = typeof api
