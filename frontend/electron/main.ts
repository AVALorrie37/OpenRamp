import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV !== 'production'
const backendHealthUrl = process.env.BACKEND_HEALTH_URL || 'http://127.0.0.1:8000/health'
const backendStartTimeoutMs = Number(process.env.BACKEND_START_TIMEOUT_MS || 20000)

type BackendStatus = 'backend_starting' | 'backend_up' | 'backend_error'

class BackendManager {
  private proc: ChildProcessWithoutNullStreams | null = null
  private status: BackendStatus = 'backend_starting'
  private errorMessage: string | null = null

  private resolveBackendExePath(): string {
    if (isDev) {
      return path.resolve(app.getAppPath(), '../backend-dist/openramp-backend.exe')
    }
    return path.join(process.resourcesPath, 'backend', 'openramp-backend.exe')
  }

  private async waitForHealth(url: string, timeoutMs: number): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        const res = await fetch(url)
        if (res.ok) return
      } catch {
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`Backend health timeout: ${timeoutMs}ms`)
  }

  async start() {
    if (this.proc) return
    this.status = 'backend_starting'
    this.errorMessage = null

    const exePath = this.resolveBackendExePath()
    if (!fs.existsSync(exePath)) {
      this.status = 'backend_error'
      this.errorMessage = `Backend executable not found: ${exePath}`
      return
    }

    const logsDir = app.getPath('userData')
    const outLogPath = path.join(logsDir, 'backend.out.log')
    const errLogPath = path.join(logsDir, 'backend.err.log')
    const outLog = fs.createWriteStream(outLogPath, { flags: 'a' })
    const errLog = fs.createWriteStream(errLogPath, { flags: 'a' })

    this.proc = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      windowsHide: true
    })
    this.proc.stdout.pipe(outLog)
    this.proc.stderr.pipe(errLog)
    this.proc.on('exit', () => {
      this.proc = null
      if (this.status !== 'backend_error') {
        this.status = 'backend_error'
        this.errorMessage = 'Backend process exited unexpectedly'
      }
    })

    try {
      await this.waitForHealth(backendHealthUrl, backendStartTimeoutMs)
      this.status = 'backend_up'
    } catch (err) {
      this.status = 'backend_error'
      this.errorMessage = err instanceof Error ? err.message : String(err)
    }
  }

  stop() {
    if (!this.proc) return
    this.proc.kill()
    this.proc = null
  }

  getStatus() {
    return {
      status: this.status,
      error: this.errorMessage
    }
  }
}

const backendManager = new BackendManager()

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('system:getServiceStatus', async () => {
    return backendManager.getStatus()
  })
  void backendManager.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  backendManager.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
