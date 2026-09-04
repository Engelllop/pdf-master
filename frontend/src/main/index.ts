import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, execSync, ChildProcess } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, unlink, unlinkSync } from 'fs'
import { release, tmpdir, userInfo } from 'os'
import { dirtyWindowCount, forgetWindow, isWindowDirty, setWindowDirty } from './dirtyWindows'
import { createAiStreamParser } from './aiStream'
import { avisoActualizacionLista, respuestaEsReiniciar } from './updatePrompt'
import { debeBorrarse, esTempDeImpresion } from './tempSweep'
import { rutaCarpetaAbrible, rutaImagenLegible, rutaParaMostrarEnCarpeta } from './safePaths'
import { comandoMatarArbol, comandoTasklist, esNuestroMotor, pidGuardado } from './enginePid'
import { colaDeTexto, construirDiagnostico, nombreArchivoDiagnostico } from './diagnostics'

// GPU & performance flags
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-software-rasterizer')
// `max-old-space-size` NO es un switch de Chromium: appendSwitch lo dejaba como
// `--max-old-space-size=4096` en la línea de comandos y V8 nunca lo leía, así que el
// heap del renderer seguía en el default. Va por `js-flags`, que es lo que Electron
// reenvía a V8.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')

const API_BASE = 'http://localhost:8745'
const API_TOKEN = randomBytes(24).toString('hex')
const backendEnv = { ...process.env, PDFMASTER_API_TOKEN: API_TOKEN }

/** El motor exige el token en todo lo que no sea /health. El renderer lo pone en
 * `apiFetch`; el main tiene que ponerlo igual o recibe 403 (empaquetado siempre,
 * porque `dev.ps1` arranca el motor sin token y ahí el middleware no aplica). */
function engineFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), 'x-pdfmaster-token': API_TOKEN },
  })
}

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const fileQueue: string[] = []
// 'app:open-file' se pierde si el renderer aún no montó su listener (React tarda
// más que ready-to-show). Los archivos se encolan hasta recibir 'app:renderer-ready';
// así "abrir con" de varios PDFs desde el Explorador abre todos, no solo el primero.
let rendererReady = false
// El renderer reporta si hay documentos con cambios sin guardar; al cerrar la
// ventana se confirma antes de descartarlos (no hay autoguardado).
/** Ventanas que ya confirmaron la salida en el aviso propio de la app. */
const forceClosing = new Set<number>()

// Safe logging to file (avoids EPIPE when no console is attached)
const logDir = join(app.getPath('userData'), 'logs')
const logFile = join(logDir, 'backend.log')
// El log no se rotaba nunca: aquí va a parar también la consola del renderer, así que
// tras meses de uso diario es un archivo de cientos de MB en %APPDATA% — y un log que
// no se puede abrir no sirve para diagnosticar, que es justo para lo que está.
const LOG_MAX_BYTES = 5 * 1024 * 1024
const logFilePrevio = join(logDir, 'backend.1.log')
let bytesDesdeUltimaRevision = 0

function rotarLogSiHaceFalta(bytesNuevos: number): void {
  // Se consulta el tamaño real cada 256 KB escritos, no en cada línea: un `statSync`
  // por línea sería una llamada al sistema por cada mensaje del renderer.
  bytesDesdeUltimaRevision += bytesNuevos
  if (bytesDesdeUltimaRevision < 262144) return
  bytesDesdeUltimaRevision = 0
  try {
    if (!existsSync(logFile) || statSync(logFile).size < LOG_MAX_BYTES) return
    if (existsSync(logFilePrevio)) unlinkSync(logFilePrevio)
    renameSync(logFile, logFilePrevio)
  } catch {
    // si no se puede rotar se sigue escribiendo: quedarse sin log es peor
  }
}

// El directorio se crea una vez, no en cada línea: `existsSync` por línea es una
// llamada al sistema por cada mensaje del motor (que escribe una por página al
// rasterizar en lote).
let logDirListo = false

function safeLog(level: string, msg: string): void {
  try {
    if (!logDirListo) {
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
      logDirListo = true
    }
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
    rotarLogSiHaceFalta(Buffer.byteLength(line))
    appendFileSync(logFile, line)
  } catch {
    // silently ignore logging failures
  }
}

// El PID del motor que lanzó ESTA app, para no volver a matar por nombre de imagen
// (ver enginePid.ts). Vive junto a los logs porque es el directorio por usuario que
// la app ya crea.
const pidFile = join(logDir, 'engine.pid')

function recordarPidMotor(pid: number | undefined): void {
  if (!pid) return
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    writeFileSync(pidFile, String(pid), 'utf-8')
  } catch { /* sin pidfile solo se pierde la limpieza del arranque siguiente */ }
}

function olvidarPidMotor(): void {
  try { if (existsSync(pidFile)) unlinkSync(pidFile) } catch { /* ignore */ }
}

/** Mata el motor huérfano del arranque anterior — solo el nuestro, y solo si el PID
 * sigue siendo un pdf-engine.exe. Si el 8745 lo tiene otro proceso, el motor nuevo
 * fallará al bindear y eso se ve en el log: preferible a matar algo ajeno. */
function killExistingBackend(): void {
  let pid: number | null = null
  try {
    pid = pidGuardado(existsSync(pidFile) ? readFileSync(pidFile, 'utf-8') : null)
  } catch { pid = null }
  if (!pid) return
  try {
    const salida = execSync(comandoTasklist(pid), { windowsHide: true }).toString()
    if (esNuestroMotor(salida, pid)) {
      execSync(comandoMatarArbol(pid), { windowsHide: true, stdio: 'ignore' })
      safeLog('INFO', `[Main] Motor huerfano ${pid} terminado`)
    }
  } catch {
    // tasklist/taskkill fallan si el PID ya no existe: es el caso normal
  }
  olvidarPidMotor()
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
    // `child` es la referencia estable de ESTE proceso. Los handlers de abajo la usan
    // en vez de `backendProcess`: al reiniciar el motor, el 'exit' del proceso viejo
    // llegaba después de haber lanzado el nuevo y ponía `backendProcess = null`, así
    // que al salir de la app ya no había a quién matar y quedaba un pdf-engine.exe
    // huérfano ocupando el 8745 (en dev, donde no corre el taskkill, el arranque
    // siguiente no podía abrir el puerto).
    let child: ChildProcess
    if (is.dev) {
      exePath = join(process.cwd(), '..', 'backend', 'venv', 'Scripts', 'python.exe')
      child = spawn(exePath, ['main.py'], {
        cwd: join(process.cwd(), '..', 'backend'),
        windowsHide: true,
        env: backendEnv,
      })
    } else {
      exePath = join(process.resourcesPath, 'backend', 'pdf-engine.exe')
      child = spawn(exePath, [], {
        windowsHide: true,
        env: backendEnv,
      })
    }
    backendProcess = child
    recordarPidMotor(child.pid)

    let resolved = false
    const maybeResolve = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }

    child.stdout?.on('data', (data) => {
      const str = String(data)
      safeLog('INFO', str.trim())
      if (str.includes('Uvicorn running on')) {
        maybeResolve()
      }
    })

    child.stderr?.on('data', (data) => {
      safeLog('ERROR', String(data).trim())
    })

    // Prevent EPIPE crash when console is not attached
    child.stdout?.on('error', () => {})
    child.stderr?.on('error', () => {})

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    child.on('exit', (code) => {
      safeLog('INFO', `Backend exited with code ${code}`)
      // Solo si sigue siendo el proceso vigente: el 'exit' de uno ya reemplazado no
      // puede borrar la referencia al que está corriendo.
      if (backendProcess === child) {
        backendProcess = null
        olvidarPidMotor()
      }
      if (!resolved) {
        resolved = true
        reject(new Error(`Backend exited with code ${code}`))
      }
    })
  })
}

function stopBackend() {
  if (!backendProcess) return
  const pid = backendProcess.pid
  backendProcess.kill()
  backendProcess = null
  // pdf-engine.exe es PyInstaller onefile: el bootloader lanza un hijo, y matar solo
  // al padre dejaba ese hijo con el puerto tomado (era lo que el taskkill por nombre
  // acababa barriendo en el arranque siguiente).
  if (pid && !is.dev) {
    try { execSync(comandoMatarArbol(pid), { windowsHide: true, stdio: 'ignore' }) } catch { /* ya murió */ }
  }
  olvidarPidMotor()
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
    forgetWindow(win.id)
    forceClosing.delete(win.id)
    if (mainWindow === win) mainWindow = BrowserWindow.getAllWindows()[0] || null
  })

  win.maximize()
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setAlwaysOnTop(false)

  // El aviso de cambios sin guardar lo pinta la propia app (con opción de guardar):
  // el cuadro nativo de Windows desentonaba y solo ofrecía perder el trabajo.
  win.on('close', (e) => {
    if (!isWindowDirty(win.id) || win.isDestroyed() || forceClosing.has(win.id)) return
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
    // Solo esquemas de navegación: un PDF hostil no debe poder lanzar file:// ni
    // un protocolo registrado en el sistema cuando sus enlaces sean clicables.
    if (/^(https?|mailto):/i.test(details.url)) shell.openExternal(details.url)
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

/** Los avisos del updater usaban `mainWindow!`: si el usuario cerró la ventana antes
 * de que llegara la comprobación (10 s tras arrancar), Electron recibía null como
 * padre y reventaba. Sin ventana, el cuadro va sin padre. */
function mostrarAviso(opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const padre = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0]
  return padre && !padre.isDestroyed() ? dialog.showMessageBox(padre, opts) : dialog.showMessageBox(opts)
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
    mostrarAviso({
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
    const sucias = dirtyWindowCount()
    mostrarAviso(avisoActualizacionLista(info.version, sucias)).then(({ response }) => {
      if (!respuestaEsReiniciar(response, sucias)) return
      // `quitAndInstall` cierra las ventanas y sale. El guard de `close` haría
      // preventDefault por los cambios sucios y la instalación quedaba a medias, así
      // que la decisión ya tomada se marca como salida confirmada.
      for (const w of BrowserWindow.getAllWindows()) {
        forceClosing.add(w.id)
        setWindowDirty(w.id, false)
      }
      autoUpdater.quitAndInstall(false, true)
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

  // Los cuadros de archivo iban sin ventana padre: en Windows eso los deja
  // NO modales, así que podían quedar detrás de la app (el usuario veía la app
  // congelada esperando una respuesta a un cuadro que no encontraba) y con varias
  // ventanas abiertas no se sabía cuál había pedido el archivo.
  const ventanaDe = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle('dialog:openFile', async (event, filters?: Electron.FileFilter[]) => {
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
    }
    const padre = ventanaDe(event)
    const { canceled, filePaths } = padre
      ? await dialog.showOpenDialog(padre, opts)
      : await dialog.showOpenDialog(opts)
    if (canceled) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:openFiles', async (event, filters?: Electron.FileFilter[], defaultPath?: string) => {
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: filters || [{ name: 'PDF Files', extensions: ['pdf'] }],
      ...(defaultPath ? { defaultPath } : {})
    }
    const padre = ventanaDe(event)
    const { canceled, filePaths } = padre
      ? await dialog.showOpenDialog(padre, opts)
      : await dialog.showOpenDialog(opts)
    if (canceled) return null
    return filePaths
  })

  // Carpeta de destino para las operaciones por lotes. Sin esto, exportar 60 planos a
  // Word se bajaba por 60 `data:` URLs a la carpeta de Descargas, sin decir a dónde
  // iban ni poder elegir — el mismo camino que el resto de exportaciones ya había
  // abandonado por poco fiable.
  ipcMain.handle('dialog:chooseFolder', async (event, defaultPath?: string) => {
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    }
    const padre = ventanaDe(event)
    const { canceled, filePaths } = padre
      ? await dialog.showOpenDialog(padre, opts)
      : await dialog.showOpenDialog(opts)
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (event, options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
    const opts: Electron.SaveDialogOptions = {
      filters: options?.filters || [{ name: 'PDF Files', extensions: ['pdf'] }],
      defaultPath: options?.defaultPath || 'document.pdf'
    }
    const padre = ventanaDe(event)
    const { canceled, filePath } = padre
      ? await dialog.showSaveDialog(padre, opts)
      : await dialog.showSaveDialog(opts)
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
    const ruta = rutaParaMostrarEnCarpeta(filePath)
    if (!ruta) return false
    try {
      shell.showItemInFolder(ruta)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('shell:openPath', (_event, dirPath: string) => {
    const ruta = rutaCarpetaAbrible(dirPath)
    if (!ruta) return false
    try {
      shell.openPath(ruta)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('api:token', () => API_TOKEN)

  /** Un archivo de texto con versiones, estado del motor y la cola de los logs, para
   * adjuntar cuando algo falla en una máquina ajena. Todo lo que arma ya estaba en
   * disco; lo que faltaba era poder pedirlo sin explicar dónde vive %APPDATA%. */
  ipcMain.handle('diag:export', async () => {
    let motorRespondio = false
    let motorVersion: string | null = null
    try {
      const res = await engineFetch('/pdf/health', { signal: AbortSignal.timeout(2000) })
      motorRespondio = res.ok
      const body = await res.json().catch(() => null)
      motorVersion = body?.version ?? null
    } catch { /* el motor caído es justo lo que se quiere reportar */ }

    const leer = (ruta: string, maxCaracteres: number): string => {
      try {
        return existsSync(ruta) ? colaDeTexto(readFileSync(ruta, 'utf-8'), maxCaracteres) : ''
      } catch (err) {
        return `(no se pudo leer: ${err})`
      }
    }

    const informe = construirDiagnostico({
      generadoEn: new Date().toISOString(),
      appVersion: app.getVersion(),
      motorVersion,
      motorRespondio,
      plataforma: `${process.platform} ${release()} ${process.arch}`,
      versiones: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
      rutas: { logs: logDir, motor: pidFile, datos: app.getPath('userData') },
      ventanasConCambios: dirtyWindowCount(),
      enVuelo: leer(join(logDir, 'inflight.txt'), 2000).trim(),
      logs: [
        { nombre: 'backend.log (cola)', contenido: leer(logFile, 200000) },
        { nombre: 'backend.1.log (cola)', contenido: leer(logFilePrevio, 50000) },
      ],
    })

    const destino = await dialog.showSaveDialog({
      title: 'Guardar diagnóstico',
      defaultPath: join(app.getPath('documents'), nombreArchivoDiagnostico(new Date())),
      filters: [{ name: 'Texto', extensions: ['txt'] }],
    })
    if (destino.canceled || !destino.filePath) return null
    try {
      writeFileSync(destino.filePath, informe, 'utf-8')
      return destino.filePath
    } catch (err) {
      safeLog('ERROR', `[Main] No se pudo escribir el diagnóstico: ${err}`)
      return null
    }
  })

  ipcMain.handle('log:error', (_event, message: string) => {
    safeLog('RENDERER', String(message).slice(0, 2000))
  })

  ipcMain.on('app:dirty-state', (event, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) setWindowDirty(win.id, !!dirty)
  })

  ipcMain.on('app:force-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    forceClosing.add(win.id)
    setWindowDirty(win.id, false)
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
  ipcMain.handle('pdf:print', async (_event, docId: string, opts?: { pageRanges?: string; copies?: number; landscape?: boolean }) => {
    let tempPath: string | null = null
    let printWin: BrowserWindow | null = null
    try {
      // marks=1: con las marcas sin guardar dibujadas. Sin esto se imprimía el
      // documento limpio y el usuario descubría en el papel que faltaban.
      const res = await engineFetch(`/pdf/raw/${docId}?marks=1`)
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
        // Sin esto Chromium imprime en VERTICAL: un juego de láminas apaisadas salía
        // girado y encogido a una esquina del papel salvo que el usuario se diera cuenta
        // y lo cambiara en el diálogo. La orientación la decide el renderer, que sabe el
        // tamaño de las páginas que se van a imprimir.
        if (opts?.landscape !== undefined) printOpts.landscape = opts.landscape
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

  // Asistente IA: streaming directo a la API de Claude (claude-opus-5).
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
      let tooBig = false
      // El tope de la API son 32 MB de REQUEST, y base64 infla un 37 %: medir el
      // buffer crudo contra 28 MB dejaba pasar PDFs que la API rechazaba.
      const MAX_RAW = 22 * 1024 * 1024
      if (docId && scope === 'page') {
        const res = await engineFetch(`/pdf/page-image/${docId}/${page}?zoom=2.0`)
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length <= MAX_RAW) {
            docBlock = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') } }
          } else tooBig = true
        }
      } else if (docId) {
        // marks=1: con las marcas sin guardar dibujadas. Sin esto se imprimía el
      // documento limpio y el usuario descubría en el papel que faltaban.
      const res = await engineFetch(`/pdf/raw/${docId}?marks=1`)
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length <= MAX_RAW) {
            docBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
          } else tooBig = true
        }
      }
      if (docId && !docBlock) {
        throw new Error(tooBig
          ? 'El PDF pesa más de 22 MB: probá con el contexto "Página actual".'
          : 'No se pudo leer el documento del motor.')
      }

      const apiMessages = messages.map((m, i) => {
        if (m.role === 'user' && docBlock && i === messages.findIndex((x) => x.role === 'user')) {
          // cache_control: el documento va en cada petición; sin caché se re-lee
          // (y se cobra) entero en cada turno de la conversación.
          return {
            role: 'user',
            content: [{ ...docBlock, cache_control: { type: 'ephemeral' } }, { type: 'text', text: m.text }],
          }
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
          model: 'claude-opus-5',
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
      const parse = createAiStreamParser()
      let stopReason: string | null = null
      // @ts-ignore — resp.body es async-iterable en undici (Node 18+)
      for await (const chunk of resp.body) {
        for (const ev of parse(decoder.decode(chunk as Buffer, { stream: true }))) {
          if (ev.kind === 'text') send('ai:chunk', { text: ev.text })
          else if (ev.kind === 'stop') stopReason = ev.reason
          else throw new Error(ev.message)
        }
      }
      // La respuesta se corta al llegar a max_tokens y antes se avisaba igual que un
      // final normal: el usuario veía la frase cortada a la mitad y parecía un fallo
      // de la app. Ahora el panel lo dice.
      send('ai:done', { truncated: stopReason === 'max_tokens' })
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
    const ruta = rutaImagenLegible(filePath, allowed)
    if (!ruta) return null
    try {
      const buffer = readFileSync(ruta)
      return buffer.toString('base64')
    } catch (err) {
      safeLog('ERROR', `[Main] Failed to read file: ${err}`)
      return null
    }
  })

  // Los temporales de impresión que quedaron de sesiones muertas: son copias del
  // documento CON las marcas sin guardar, así que no pueden vivir en %TEMP% para
  // siempre. Se barre al arrancar, nunca mientras se imprime.
  try {
    const ahora = Date.now()
    for (const nombre of readdirSync(tmpdir())) {
      if (!esTempDeImpresion(nombre)) continue
      const ruta = join(tmpdir(), nombre)
      try {
        if (debeBorrarse(nombre, statSync(ruta).mtimeMs, ahora)) unlinkSync(ruta)
      } catch { /* en uso o sin permiso: se intenta el próximo arranque */ }
    }
  } catch (err) {
    safeLog('ERROR', `[Main] No se pudo barrer los temporales: ${err}`)
  }

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
