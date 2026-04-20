import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },
  system: {
    getMemoryUsage: () => ipcRenderer.invoke('system:getMemoryUsage')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
