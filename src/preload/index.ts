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
  },
  profiler: {
    openFile: () => ipcRenderer.invoke('profiler:openFile'),
    loadFile: (filePath: string) => ipcRenderer.invoke('profiler:loadFile', filePath),
    reanalyze: (options: any) => ipcRenderer.invoke('profiler:reanalyze', options),
    getCurrentAnalysis: () => ipcRenderer.invoke('profiler:getCurrentAnalysis'),
    exportCsv: () => ipcRenderer.invoke('profiler:exportCsv'),
    getCallTree: (frameIndex: number, threadFilter?: string) => ipcRenderer.invoke('profiler:getCallTree', frameIndex, threadFilter),
    getSpikes: () => ipcRenderer.invoke('profiler:getSpikes')
  },
  ai: {
    analyze: (prompt: string) => ipcRenderer.invoke('ai:analyze', prompt),
    abort: () => ipcRenderer.invoke('ai:abort'),
    setConfig: (config: any) => ipcRenderer.invoke('ai:setConfig', config),
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    onStream: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('ai:stream', handler)
      return () => ipcRenderer.removeListener('ai:stream', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
