import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openMidi: (): Promise<{ name: string; data: Uint8Array } | null> => ipcRenderer.invoke('open-midi'),
  saveMidi: (name: string, data: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('save-midi', name, data)
})
