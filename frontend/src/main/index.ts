import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const fileQueue: string[] = []

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
      console.log(`[Backend] ${data}`)
      if (String(data).includes('Uvicorn running on')) {
        maybeResolve()
      }
    })

    backendProcess.stderr?.on('data', (data) => {
      console.error(`[Backend Error] ${data}`)
    })

    backendProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    backendProcess.on('exit', (code) => {
      console.log(`[Backend] exited with code ${code}`)
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
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Ensure window is visible on screen (handles multi-monitor changes)
  const ensureVisible = () => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    const displays = require('electron').screen.getAllDisplays()
    const isVisible = displays.some((d: any) => {
      const { x, y, width, height } = d.workArea
      return bounds.x >= x - 100 && bounds.y >= y - 100 &&
             bounds.x + bounds.width <= x + width + 100 &&
             bounds.y + bounds.height <= y + height + 100
    })
    if (!isVisible) {
      mainWindow.center()
    }
  }

  mainWindow.on('ready-to-show', () => {
    ensureVisible()
    mainWindow?.show()
    mainWindow?.focus()
    if (fileQueue.length > 0 && mainWindow) {
      fileQueue.forEach((f) => mainWindow?.webContents.send('app:open-file', f))
      fileQueue.length = 0
    }
  })

  // Fallback: if ready-to-show never fires (rare), show anyway after 5s
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      ensureVisible()
      mainWindow.show()
      mainWindow.focus()
    }
  }, 5000)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initAutoUpdater(): void {
  if (is.dev) {
    console.log('[Updater] Skipped in development')
    return
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
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
    console.log('[Updater] No updates available')
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message)
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)
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
      console.error('[Updater] Check failed:', err.message)
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

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const filePath = commandLine.find((arg) => arg.toLowerCase().endsWith('.pdf'))
    if (filePath) handleFileOpen(filePath)
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

  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (canceled) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      defaultPath: 'document.pdf'
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
    console.log('[Main] Restarting backend...')
    stopBackend()
    // Give it a moment to release the port
    await new Promise((r) => setTimeout(r, 500))
    try {
      await startBackend()
      console.log('[Main] Backend restarted successfully')
      return { success: true }
    } catch (err) {
      console.error('[Main] Backend restart failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // Splash screen
  const splash = new BrowserWindow({
    width: 400,
    height: 240,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: false,
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: { sandbox: false }
  })
  splash.loadFile(join(__dirname, 'splash.html'))
  splash.once('ready-to-show', () => splash.show())

  // Start backend
  try {
    await startBackend()
    console.log('Backend started successfully')
  } catch (err) {
    console.error('Failed to start backend:', err)
  }

  // Close splash and show main window
  splash.close()

  // Check for file argument on launch
  const pdfArg = process.argv.find((arg) => arg.toLowerCase().endsWith('.pdf'))
  if (pdfArg) fileQueue.push(pdfArg)

  createWindow()

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
