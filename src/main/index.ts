import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron'
import { basename, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

// The renderer is served from app://piano/ so that fetch() can load the piano samples.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const BG = '#0b0c10'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    backgroundColor: BG,
    title: 'קלידים',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG, symbolColor: '#d6d3cd', height: 48 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadURL('app://piano/index.html')
}

app.whenReady().then(() => {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle('app', (req) => {
    const p = normalize(join(root, decodeURIComponent(new URL(req.url).pathname)))
    if (p !== root && !p.startsWith(root + sep)) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(p).toString())
  })

  const midiPerm = (perm: string): boolean => perm === 'midi' || perm === 'midiSysex'
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(midiPerm(perm)))
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => midiPerm(perm))

  ipcMain.handle('open-midi', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'פתיחת שיר',
      properties: ['openFile'],
      filters: [{ name: 'קובצי MIDI', extensions: ['mid', 'midi'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const data = await readFile(r.filePaths[0])
    return { name: basename(r.filePaths[0]), data: new Uint8Array(data) }
  })

  ipcMain.handle('save-midi', async (e, name: string, data: Uint8Array) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      title: 'שמירת ההקלטה',
      defaultPath: name,
      filters: [{ name: 'קובץ MIDI', extensions: ['mid'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, Buffer.from(data))
    return r.filePath
  })

  ipcMain.handle('install-update', async (e, url: string, fileName: string) => {
    try {
      const parsed = new URL(url)
      const allowed =
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'github.com' ||
          parsed.hostname.endsWith('.githubusercontent.com') ||
          parsed.hostname === 'github.com')
      if (!allowed) return { ok: false, error: 'כתובת הורדה לא מורשית' }

      const res = await net.fetch(url)
      if (!res.ok || !res.body) return { ok: false, error: `שגיאת הורדה (${res.status})` }

      const total = Number(res.headers.get('content-length') || 0)
      const safeName = basename(fileName).replace(/[^\w.\-]/g, '_')
      const dest = join(app.getPath('temp'), safeName)

      const reader = res.body.getReader()
      const stream = createWriteStream(dest)
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          loaded += value.byteLength
          stream.write(value)
          if (total > 0) e.sender.send('update-progress', Math.min(99, Math.round((loaded / total) * 100)))
        }
      }
      await new Promise<void>((resolve, reject) => {
        stream.end(() => resolve())
        stream.on('error', reject)
      })
      e.sender.send('update-progress', 100)

      const openErr = await shell.openPath(dest)
      if (openErr) return { ok: false, error: openErr }
      setTimeout(() => app.quit(), 600)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בהתקנת העדכון' }
    }
  })

  createWindow()
})

app.on('window-all-closed', () => app.quit())
