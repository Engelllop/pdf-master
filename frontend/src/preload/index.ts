import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  openFile: (filters?: Electron.FileFilter[]) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFile: (options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => ipcRenderer.invoke('dialog:saveFile', options),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  newWindow: () => ipcRenderer.invoke('window:new'),
  logError: (message: string) => ipcRenderer.invoke('log:error', message),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:showInFolder', path),
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  readFileBase64: (path: string) => ipcRenderer.invoke('file:readBase64', path),
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
