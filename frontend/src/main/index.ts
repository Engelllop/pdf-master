import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlink, unlinkSync } from 'fs'
import { tmpdir, userInfo } from 'os'

// GPU & performance flags
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('max-old-space-size', '4096')

const API_BASE = 'http://localhost:8745'
const API_TOKEN = randomBytes(24).toString('hex')
const backendEnv = { ...process.env, PDFMASTER_API_TOKEN: API_TOKEN }

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const fileQueue: string[] = []
// 'app:open-file' se pierde si el renderer aún no montó su listener (React tarda
// más que ready-to-show). Los archivos se encolan hasta recibir 'app:renderer-ready';
// así "abrir con" de varios PDFs desde el Explorador abre todos, no solo el primero.
let rendererReady = false
// El renderer reporta si hay documentos con cambios sin guardar; al cerrar la
// ventana se confirma antes de descartarlos (no hay autoguardado).
let hasUnsavedChanges = false
/** Ventanas que ya confirmaron la salida en el aviso propio de la app. */
const forceClosing = new Set<number>()

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
        env: backendEnv,
      })
    } else {
      exePath = join(process.resourcesPath, 'backend', 'pdf-engine.exe')
      backendProcess = spawn(exePath, [], {
        windowsHide: true,
        env: backendEnv,
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
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#1f2329', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // mainWindow apunta siempre a la ventana enfocada: con "Nueva ventana" abiertas,
  // los diálogos y el "abrir con" del Explorador van a la que el usuario está usando
  // (antes quedaba clavado en la última creada aunque estuviera cerrada).
  mainWindow = win
  win.on('focus', () => { mainWindow = win })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = BrowserWindow.getAllWindows()[0] || null
  })

  win.maximize()
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setAlwaysOnTop(false)

  // El aviso de cambios sin guardar lo pinta la propia app (con opción de guardar):
  // el cuadro nativo de Windows desentonaba y solo ofrecía perder el trabajo.
  win.on('close', (e) => {
    if (!hasUnsavedChanges || win.isDestroyed() || forceClosing.has(win.id)) return
    e.preventDefault()
    win.webContents.send('app:confirm-close')
  })

  rendererReady = false
  win.webContents.on('did-start-loading', () => {
    rendererReady = false
  })

  win.on('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Forward renderer console + failed loads to the log file for diagnostics.
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || message.includes('PAGEIMG')) safeLog('RENDERER', message)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    safeLog('LOAD-FAIL', `${code} ${desc} ${url}`)
  })

  // El renderer es una SPA: cualquier navegación real (drop de un archivo, link
  // roto, etc.) la reemplazaría por completo. Se bloquea siempre; los drops de PDF
  // se reenvían por IPC.
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (url.startsWith('file://') && url.toLowerCase().endsWith('.pdf')) {
      const filePath = decodeURI(url.replace('file:///', '').replace(/\//g, '\\'))
      handleFileOpen(filePath)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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

// "1-5,8,10-12" → [{from:0,to:4},{from:7,to:7},{from:9,to:11}] (Electron usa índices 0-based)
function parsePageRanges(input: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  for (const part of input.split(',')) {
    const t = part.trim()
    if (!t) continue
    if (t.includes('-')) {
      const [a, b] = t.split('-').map((n) => parseInt(n, 10))
      if (!isNaN(a) && !isNaN(b)) out.push({ from: Math.min(a, b) - 1, to: Math.max(a, b) - 1 })
    } else {
      const n = parseInt(t, 10)
      if (!isNaN(n)) out.push({ from: n - 1, to: n - 1 })
    }
  }
  return out.filter((r) => r.from >= 0 && r.to >= 0)
}

function handleFileOpen(filePath: string) {
  if (mainWindow && rendererReady) {
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

  ipcMain.handle('dialog:openFiles', async (_event, filters?: Electron.FileFilter[], defaultPath?: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: filters || [{ name: 'PDF Files', extensions: ['pdf'] }],
      ...(defaultPath ? { defaultPath } : {})
    })
    if (canceled) return null
    return filePaths
  })

  ipcMain.handle('dialog:saveFile', async (_event, options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: options?.filters || [{ name: 'PDF Files', extensions: ['pdf'] }],
      defaultPath: options?.defaultPath || 'document.pdf'
    })
    if (canceled || !filePath) return null
    return filePath
  })

  // Por-sender: cada ventana ajusta su propio overlay/fullscreen (no el de la última creada).
  ipcMain.handle('window:set-overlay', (event, opts: { color: string; symbolColor: string }) => {
    try { BrowserWindow.fromWebContents(event.sender)?.setTitleBarOverlay({ ...opts, height: 40 }) } catch { /* ignore */ }
  })

  // Nombre de usuario del sistema: autor por defecto de las marcas de revisión.
  ipcMain.handle('os:username', () => {
    try { return userInfo().username } catch { return '' }
  })

  // Escalado de la interfaz (ajuste del usuario): igual que el zoom del navegador,
  // por ventana. Con planos en 4K la UI a 100 % se queda diminuta.
  ipcMain.handle('window:set-ui-zoom', (event, factor: number) => {
    try { event.sender.setZoomFactor(Math.max(0.75, Math.min(1.5, factor))) } catch { /* ignore */ }
  })

  ipcMain.handle('window:toggleFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setFullScreen(!win.isFullScreen())
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

  ipcMain.handle('shell:openPath', (_event, dirPath: string) => {
    try { shell.openPath(dirPath) } catch { /* ignore */ }
  })

  ipcMain.handle('api:token', () => API_TOKEN)

  ipcMain.handle('log:error', (_event, message: string) => {
    safeLog('RENDERER', String(message).slice(0, 2000))
  })

  ipcMain.on('app:dirty-state', (_event, dirty: boolean) => {
    hasUnsavedChanges = !!dirty
  })

  ipcMain.on('app:force-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    forceClosing.add(win.id)
    hasUnsavedChanges = false
    win.close()
  })

  ipcMain.on('app:renderer-ready', () => {
    rendererReady = true
    if (mainWindow && fileQueue.length > 0) {
      fileQueue.forEach((f) => mainWindow?.webContents.send('app:open-file', f))
      fileQueue.length = 0
    }
  })

  // Impresión real del PDF: descarga los bytes (refleja cambios sin guardar),
  // los carga en una ventana oculta con el visor PDF de Chromium y lanza el
  // diálogo de impresión nativo sobre ese contenido nítido (no el DOM del visor).
  ipcMain.handle('pdf:print', async (_event, docId: string, opts?: { pageRanges?: string; copies?: number }) => {
    let tempPath: string | null = null
    let printWin: BrowserWindow | null = null
    try {
      const res = await fetch(`${API_BASE}/pdf/raw/${docId}`)
      if (!res.ok) throw new Error(`raw fetch ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      tempPath = join(tmpdir(), `pdfmaster-print-${Date.now()}.pdf`)
      writeFileSync(tempPath, buf)

      printWin = new BrowserWindow({
        show: false,
        webPreferences: { plugins: true },
      })
      const win = printWin
      const cleanup = () => {
        if (tempPath) unlink(tempPath, () => {})
        if (!win.isDestroyed()) win.close()
      }

      await win.loadFile(tempPath)
      await new Promise((r) => setTimeout(r, 400)) // deja al visor PDF renderizar

      return await new Promise((resolve) => {
        const printOpts: Electron.WebContentsPrintOptions = { silent: false }
        if (opts?.pageRanges) {
          const ranges = parsePageRanges(opts.pageRanges)
          if (ranges.length > 0) printOpts.pageRanges = ranges
        }
        if (opts?.copies && opts.copies > 1) printOpts.copies = opts.copies
        win.webContents.print(printOpts, (success, reason) => {
          cleanup()
          resolve({ success, reason })
        })
      })
    } catch (err) {
      if (tempPath) unlink(tempPath, () => {})
      if (printWin && !printWin.isDestroyed()) printWin.close()
      safeLog('ERROR', `[Main] Print failed: ${err}`)
      return { success: false, error: String(err) }
    }
  })

  // API key de Anthropic: cifrada con safeStorage (DPAPI en Windows) en userData,
  // nunca en localStorage del renderer. El renderer solo sabe si hay clave o no.
  const aiKeyFile = join(app.getPath('userData'), 'ai-key.bin')
  const readAiKey = (): string | null => {
    try {
      if (!existsSync(aiKeyFile)) return null
      const raw = readFileSync(aiKeyFile)
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
    } catch (err) {
      safeLog('ERROR', `[AI] No se pudo leer la API key: ${err}`)
      return null
    }
  }

  ipcMain.handle('ai:set-key', (_event, key: string | null) => {
    try {
      if (!key) {
        if (existsSync(aiKeyFile)) unlinkSync(aiKeyFile)
        return { success: true }
      }
      const data = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(key)
        : Buffer.from(key, 'utf-8')
      writeFileSync(aiKeyFile, data)
      return { success: true }
    } catch (err) {
      safeLog('ERROR', `[AI] No se pudo guardar la API key: ${err}`)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('ai:has-key', () => readAiKey() !== null)

  // Asistente IA: streaming directo a la API de Claude (claude-opus-4-8).
  // Adjunta el PDF como bloque "document" base64 para que Claude lea el documento
  // nativamente. Se hace en el main (no en el backend Python) para no tocar el
  // motor PyMuPDF ni recompilar el exe, y para mantener la API key fuera del renderer.
  // AbortControllers vivos por requestId, para que el renderer pueda detener la generación.
  const aiControllers = new Map<string, AbortController>()
  ipcMain.on('ai:chat', async (event, payload: { requestId: string; docId: string | null; messages: { role: 'user' | 'assistant'; text: string }[]; scope?: 'doc' | 'page'; page?: number }) => {
    const { requestId, docId, messages, scope = 'doc', page = 0 } = payload
    const apiKey = readAiKey()
    const send = (channel: string, data: object) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, { requestId, ...data })
    }
    const controller = new AbortController()
    aiControllers.set(requestId, controller)
    try {
      if (!apiKey) throw new Error('Falta la API key de Anthropic')

      // scope 'page' adjunta solo la imagen de la página actual (liviano, ideal para
      // planos grandes); 'doc' adjunta el PDF completo para que Claude lo lea nativo.
      let docBlock: object | null = null
      if (docId && scope === 'page') {
        const res = await fetch(`${API_BASE}/pdf/page-image/${docId}/${page}?zoom=2.0`)
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length <= 28 * 1024 * 1024) {
            docBlock = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') } }
          }
        }
      } else if (docId) {
        const res = await fetch(`${API_BASE}/pdf/raw/${docId}`)
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length <= 28 * 1024 * 1024) {
            docBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
          }
        }
      }

      const apiMessages = messages.map((m, i) => {
        if (m.role === 'user' && docBlock && i === messages.findIndex((x) => x.role === 'user')) {
          return { role: 'user', content: [docBlock, { type: 'text', text: m.text }] }
        }
        return { role: m.role, content: m.text }
      })

      // Token OAuth de la suscripción (sk-ant-oat...) → Bearer + beta oauth.
      // API key de pago (sk-ant-api...) → x-api-key. Soporta ambos.
      const isOAuth = apiKey.startsWith('sk-ant-oat')
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (isOAuth) {
        headers['authorization'] = `Bearer ${apiKey}`
        headers['anthropic-beta'] = 'oauth-2025-04-20'
      } else {
        headers['x-api-key'] = apiKey
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 8000,
          stream: true,
          system: 'Eres un asistente experto integrado en PDF Master, un lector y editor de PDF. Respondes en español de forma precisa y concisa sobre el documento PDF adjunto. Si te piden extraer datos, devuélvelos estructurados.',
          messages: apiMessages,
        }),
      })

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '')
        let msg = `Error ${resp.status}`
        try { msg = JSON.parse(errText)?.error?.message || msg } catch {}
        throw new Error(msg)
      }

      const decoder = new TextDecoder()
      let buffer = ''
      // @ts-ignore — resp.body es async-iterable en undici (Node 18+)
      for await (const chunk of resp.body) {
        buffer += decoder.decode(chunk as Buffer, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const data = t.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const ev = JSON.parse(data)
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              send('ai:chunk', { text: ev.delta.text })
            } else if (ev.type === 'error') {
              throw new Error(ev.error?.message || 'Error de la API')
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
          }
        }
      }
      send('ai:done', {})
    } catch (err) {
      // El usuario detuvo la generación: cierre normal, no error.
      if (err instanceof Error && err.name === 'AbortError') {
        send('ai:done', {})
      } else {
        safeLog('ERROR', `[Main] AI chat failed: ${err}`)
        send('ai:error', { error: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      aiControllers.delete(requestId)
    }
  })

  ipcMain.on('ai:abort', (_event, requestId: string) => {
    aiControllers.get(requestId)?.abort()
  })

  ipcMain.handle('file:readBase64', async (_event, filePath: string) => {
    const allowed = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff'])
    if (!allowed.has(extname(filePath).toLowerCase())) return null
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
