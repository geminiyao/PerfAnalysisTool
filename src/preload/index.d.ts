export interface ElectronAPI {
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
  }
  app: {
    getVersion: () => Promise<string>
  }
  system: {
    getMemoryUsage: () => Promise<NodeJS.MemoryUsage>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
