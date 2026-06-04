import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
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
