import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'

// GPU & performance flags
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('max-old-space-size', '4096')

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const fileQueue: string[] = []
// El renderer reporta si hay documentos con cambios sin guardar; al cerrar la
// ventana se confirma antes de descartarlos (no hay autoguardado).
let hasUnsavedChanges = false

// Safe logging to file (avoids EPIPE when no console is attached)
const logDir = join(app.getPath('userData'), 'logs')
const logFile = join(logDir, 'backend.log')
function safeLog(level: string, msg: string): void {
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
    appendFileSync(logFile, line)
  } catch {
    // silently ignore logging failures
  }
}

function killExistingBackend(): void {
  try {
    // Kill any existing pdf-engine.exe processes to free port 8745
    const { execSync } = require('child_process')
    execSync('taskkill /F /IM pdf-engine.exe 2>nul', { windowsHide: true })
  } catch {
    // Ignore errors — no existing process is fine
  }
}

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (backendProcess) {
      resolve()
      return
    }

    // Ensure no old backend is hogging the port
    if (!is.dev) {
      killExistingBackend()
    }

    let exePath: string
    if (is.dev) {
      exePath = join(process.cwd(), '..', 'backend', 'venv', 'Scripts', 'python.exe')
      backendProcess = spawn(exePath, ['main.py'], {
        cwd: join(process.cwd(), '..', 'backend'),
        windowsHide: true,
      })
    } else {
      exePath = join(process.resourcesPath, 'backend', 'pdf-engine.exe')
      backendProcess = spawn(exePath, [], {
        windowsHide: true,
      })
    }

    let resolved = false
    const maybeResolve = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }

    backendProcess.stdout?.on('data', (data) => {
      const str = String(data)
      safeLog('INFO', str.trim())
      if (str.includes('Uvicorn running on')) {
        maybeResolve()
      }
    })

    backendProcess.stderr?.on('data', (data) => {
      safeLog('ERROR', String(data).trim())
    })

    // Prevent EPIPE crash when console is not attached
    backendProcess.stdout?.on('error', () => {})
    backendProcess.stderr?.on('error', () => {})

    backendProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    backendProcess.on('exit', (code) => {
      safeLog('INFO', `Backend exited with code ${code}`)
      backendProcess = null
      if (!resolved) {
        resolved = true
        reject(new Error(`Backend exited with code ${code}`))
      }
    })
  })
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.maximize()
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setAlwaysOnTop(false)

  mainWindow.on('close', (e) => {
    if (!hasUnsavedChanges || !mainWindow) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Cambios sin guardar',
      message: 'Hay documentos con cambios sin guardar.',
      detail: 'Si sales ahora, los cambios se perderán. Usa Guardar antes de salir si quieres conservarlos.',
      buttons: ['Salir sin guardar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    })
    if (choice === 1) e.preventDefault()
    else hasUnsavedChanges = false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
    if (fileQueue.length > 0 && mainWindow) {
      fileQueue.forEach((f) => mainWindow?.webContents.send('app:open-file', f))
      fileQueue.length = 0
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Forward renderer console + failed loads to the log file for diagnostics.
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || message.includes('PAGEIMG')) safeLog('RENDERER', message)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    safeLog('LOAD-FAIL', `${code} ${desc} ${url}`)
  })

  // Prevent drag-and-drop navigation to local files; handle PDF drops via IPC
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') && url.toLowerCase().endsWith('.pdf')) {
      event.preventDefault()
      const filePath = decodeURI(url.replace('file:///', '').replace(/\//g, '\\'))
      handleFileOpen(filePath)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initAutoUpdater(): void {
  if (is.dev) {
    safeLog('INFO', '[Updater] Skipped in development')
    return
  }

  autoUpdater.on('checking-for-update', () => {
    safeLog('INFO', '[Updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    safeLog('INFO', '[Updater] Update available: ' + info.version)
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Hay una nueva versión de PDF Master (${info.version}).`,
      detail: 'Se descargará automáticamente en segundo plano. Te avisaremos cuando esté lista para instalar.',
      buttons: ['OK'],
      defaultId: 0,
    })
  })

  autoUpdater.on('update-not-available', () => {
    safeLog('INFO', '[Updater] No updates available')
  })

  autoUpdater.on('error', (err) => {
    safeLog('ERROR', '[Updater] Error: ' + err.message)
  })

  autoUpdater.on('download-progress', (progress) => {
    safeLog('INFO', `[Updater] Download progress: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    safeLog('INFO', '[Updater] Update downloaded: ' + info.version)
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Actualización lista',
      message: `La versión ${info.version} se ha descargado.`,
      detail: '¿Deseas reiniciar la aplicación ahora para instalarla?',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  // Check for updates after 10 seconds so startup isn't blocked
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      safeLog('ERROR', '[Updater] Check failed: ' + err.message)
    })
  }, 10000)
}

function handleFileOpen(filePath: string) {
  if (mainWindow) {
    mainWindow.webContents.send('app:open-file', filePath)
  } else {
    fileQueue.push(filePath)
  }
}

// Single instance lock. app.exit() (no app.quit()): quit es asíncrono y la
// instancia secundaria alcanzaba a ejecutar whenReady -> killExistingBackend,
// matando el pdf-engine de la instancia principal (doc_ids muertos, páginas 404).
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
} else {
  app.on('second-instance', (_event, commandLine) => {
    commandLine
      .filter((arg) => arg.toLowerCase().endsWith('.pdf'))
      .forEach((f) => handleFileOpen(f))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.pdfmaster.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('dialog:openFile', async (_event, filters?: Electron.FileFilter[]) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (canceled) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_event, options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: options?.filters || [{ name: 'PDF Files', extensions: ['pdf'] }],
      defaultPath: options?.defaultPath || 'document.pdf'
    })
    if (canceled || !filePath) return null
    return filePath
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  ipcMain.handle('backend:restart', async () => {
    safeLog('INFO', '[Main] Restarting backend...')
    stopBackend()
    await new Promise((r) => setTimeout(r, 500))
    try {
      await startBackend()
      safeLog('INFO', '[Main] Backend restarted successfully')
      return { success: true }
    } catch (err) {
      safeLog('ERROR', `[Main] Backend restart failed: ${err}`)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('window:new', () => {
    createWindow()
    return { success: true }
  })

  ipcMain.handle('shell:showInFolder', (_event, filePath: string) => {
    try { shell.showItemInFolder(filePath) } catch { /* ignore */ }
  })

  ipcMain.handle('log:error', (_event, message: string) => {
    safeLog('RENDERER', String(message).slice(0, 2000))
  })

  ipcMain.on('app:dirty-state', (_event, dirty: boolean) => {
    hasUnsavedChanges = !!dirty
  })

  ipcMain.handle('file:readBase64', async (_event, filePath: string) => {
    try {
      const buffer = readFileSync(filePath)
      return buffer.toString('base64')
    } catch (err) {
      safeLog('ERROR', `[Main] Failed to read file: ${err}`)
      return null
    }
  })

  // Check for file arguments on launch
  process.argv
    .filter((arg) => arg.toLowerCase().endsWith('.pdf'))
    .forEach((arg) => fileQueue.push(arg))

  // Create window immediately — don't block on backend startup
  createWindow()

  // Start backend in background with a timeout so it never blocks UI
  startBackend().then(() => {
    safeLog('INFO', 'Backend started successfully')
  }).catch((err) => {
    safeLog('ERROR', 'Failed to start backend: ' + err)
  })

  // Initialize auto-updater after a short delay so it doesn't block startup
  initAutoUpdater()

  app.on('activate', function () {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) {
      createWindow()
    } else {
      wins.forEach((w) => {
        if (!w.isVisible()) w.show()
        if (w.isMinimized()) w.restore()
        w.focus()
      })
    }
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})

// Windows: handle file open from shell
if (process.platform === 'win32') {
  app.setAsDefaultProtocolClient('pdfmaster')
}
