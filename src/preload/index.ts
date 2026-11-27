import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openMidi: (): Promise<{ name: string; data: Uint8Array } | null> => ipcRenderer.invoke('open-midi'),
  saveMidi: (name: string, data: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('save-midi', name, data),
  isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
  installUpdate: (url: string, fileName: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('install-update', url, fileName),
  onUpdateProgress: (cb: (pct: number) => void): (() => void) => {
    const listener = (_e: unknown, pct: number): void => cb(pct)
    ipcRenderer.on('update-progress', listener)
    return () => ipcRenderer.removeListener('update-progress', listener)
  }
})
