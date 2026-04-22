export interface ProfilerOpenResult {
  success: boolean
  data?: any
  error?: string
  fileName?: string
}

export interface ProfilerReanalyzeResult {
  success: boolean
  data?: any
  error?: string
}

export interface ProfilerExportResult {
  success: boolean
  filePath?: string
  error?: string
}

export interface AiAnalyzeResult {
  success: boolean
  message?: string
  error?: string
}

export interface AiConfigResult {
  success: boolean
  data?: {
    model?: string
    maxTurns?: number
    permissionMode?: string
    systemPromptAppend?: string
    pathToCodebuddyCode?: string
  }
}

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
  profiler: {
    openFile: () => Promise<ProfilerOpenResult>
    loadFile: (filePath: string) => Promise<ProfilerOpenResult>
    reanalyze: (options: any) => Promise<ProfilerReanalyzeResult>
    getCurrentAnalysis: () => Promise<ProfilerReanalyzeResult>
    exportCsv: () => Promise<ProfilerExportResult>
    getCallTree: (frameIndex: number, threadFilter?: string) => Promise<{ success: boolean; data?: any; error?: string }>
    getSpikes: () => Promise<{ success: boolean; data?: any; error?: string }>
  }
  ai: {
    analyze: (prompt: string) => Promise<AiAnalyzeResult>
    abort: () => Promise<{ success: boolean }>
    setConfig: (config: any) => Promise<{ success: boolean }>
    getConfig: () => Promise<AiConfigResult>
    onStream: (callback: (data: any) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
