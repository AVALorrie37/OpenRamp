import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getServiceStatus: () => ipcRenderer.invoke('system:getServiceStatus')
})
