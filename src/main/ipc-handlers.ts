import { ipcMain, BrowserWindow, dialog } from 'electron'
import { parsePdataFile } from './profiler/pdata-parser'
import { analyzeProfileData } from './profiler/profile-analyzer'
import { ProfileData, AnalyzeOptions, ProfileAnalysisResult } from './profiler/types'
import { analyzeWithAIStreaming, abortAnalysis, setAgentConfig, getAgentConfig } from './ai/agent-service'

let currentProfileData: ProfileData | null = null
let currentAnalysis: ProfileAnalysisResult | null = null

export function registerIpcHandlers(): void {
  // ============ Window controls ============
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized() ?? false
  })

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron')
    return app.getVersion()
  })

  ipcMain.handle('system:getMemoryUsage', () => {
    return process.memoryUsage()
  })

  // ============ Profiler: open file dialog ============
  ipcMain.handle('profiler:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Open Unity Profiler Data',
      filters: [
        { name: 'Profile Analyzer Data', extensions: ['pdata'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'canceled' }
    }

    const filePath = result.filePaths[0]
    return loadAndAnalyze(filePath)
  })

  // ============ Profiler: load file by path ============
  ipcMain.handle('profiler:loadFile', async (_event, filePath: string) => {
    return loadAndAnalyze(filePath)
  })

  // ============ Profiler: re-analyze with new options ============
  ipcMain.handle('profiler:reanalyze', async (_event, options: AnalyzeOptions) => {
    if (!currentProfileData) {
      return { success: false, error: 'No profile data loaded' }
    }
    const analysis = analyzeProfileData(currentProfileData, options)
    if (!analysis) {
      return { success: false, error: 'Analysis failed' }
    }
    currentAnalysis = analysis
    return { success: true, data: analysis }
  })

  // ============ Profiler: get current analysis ============
  ipcMain.handle('profiler:getCurrentAnalysis', async () => {
    if (!currentAnalysis) {
      return { success: false, error: 'No analysis available' }
    }
    return { success: true, data: currentAnalysis }
  })

  // ============ Profiler: export CSV ============
  ipcMain.handle('profiler:exportCsv', async (event) => {
    if (!currentAnalysis) {
      return { success: false, error: 'No analysis data to export' }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }

    const result = await dialog.showSaveDialog(win, {
      title: 'Export Analysis as CSV',
      defaultPath: 'profiler-analysis.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'canceled' }
    }

    const fs = require('fs')
    const csvHeader = 'Name,Median (ms),Mean (ms),Min (ms),Max (ms),Count,Total (ms),Depth,Threads\n'
    const csvRows = currentAnalysis.markers.map(m =>
      `"${m.name}",${m.msMedian.toFixed(4)},${m.msMean.toFixed(4)},${m.msMin.toFixed(4)},${m.msMax.toFixed(4)},${m.count},${m.msTotal.toFixed(4)},${m.minDepth}-${m.maxDepth},"${m.threads.join('; ')}"`
    ).join('\n')

    fs.writeFileSync(result.filePath, csvHeader + csvRows, 'utf8')
    return { success: true, filePath: result.filePath }
  })

  // ============ AI: analyze with CodeBuddy Agent SDK ============
  ipcMain.handle('ai:analyze', async (event, prompt: string) => {
    if (!currentAnalysis) {
      return { success: false, error: 'No analysis data available for AI' }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      return { success: false, error: 'No window found' }
    }

    const result = await analyzeWithAIStreaming(win, currentAnalysis, prompt || undefined)
    return result
  })

  // ============ AI: abort current analysis ============
  ipcMain.handle('ai:abort', async () => {
    abortAnalysis()
    return { success: true }
  })

  // ============ AI: set agent config ============
  ipcMain.handle('ai:setConfig', async (_event, config: any) => {
    setAgentConfig(config)
    return { success: true }
  })

  // ============ AI: get agent config ============
  ipcMain.handle('ai:getConfig', async () => {
    return { success: true, data: getAgentConfig() }
  })
}

function loadAndAnalyze(filePath: string): { success: boolean; data?: ProfileAnalysisResult; error?: string; fileName?: string } {
  const startTime = Date.now()
  console.log(`[Profiler] Loading file: ${filePath}`)

  let profileData: ProfileData
  try {
    profileData = parsePdataFile(filePath)
  } catch (e: any) {
    console.error(`[Profiler] Parse error: ${e.message}`)
    return { success: false, error: `Failed to parse file: ${e.message}` }
  }

  console.log(`[Profiler] Parsed ${profileData.frames.length} frames, ${profileData.markerNames.length} markers, ${profileData.threadNames.length} threads in ${Date.now() - startTime}ms`)

  currentProfileData = profileData

  const analysis = analyzeProfileData(profileData)
  if (!analysis) {
    return { success: false, error: 'Analysis produced no results' }
  }

  currentAnalysis = analysis
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath

  console.log(`[Profiler] Analysis complete in ${Date.now() - startTime}ms. ${analysis.markers.length} unique markers.`)

  return { success: true, data: analysis, fileName }
}
