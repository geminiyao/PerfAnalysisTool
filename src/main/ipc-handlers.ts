import { ipcMain, BrowserWindow, dialog } from 'electron'
import { parsePdataFile } from './profiler/pdata-parser'
import { analyzeProfileData } from './profiler/profile-analyzer'
import { ProfileData, AnalyzeOptions, ProfileAnalysisResult } from './profiler/types'
import { analyzeWithAIStreaming, abortAnalysis, setAgentConfig, getAgentConfig } from './ai/agent-service'
import { getFrameCallTree, treeToFlatRows, formatCallTree, formatHotPath, findCallChain, formatCallChain } from './profiler/call-tree'
import { detectAllSpikes } from './profiler/spike-detector'
import { DeepAnalysisContext, FrameTreeContext, SpikeFrameContext, MarkerCallChainContext } from './ai/prompt-builder'

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

  // ============ Profiler: get call tree for a specific frame ============
  ipcMain.handle('profiler:getCallTree', async (_event, frameIndex: number, threadFilter?: string) => {
    if (!currentProfileData) {
      return { success: false, error: 'No profile data loaded' }
    }
    const result = getFrameCallTree(currentProfileData, frameIndex, threadFilter)
    if (!result) {
      return { success: false, error: `Frame ${frameIndex} not found` }
    }
    return {
      success: true,
      data: {
        frameIndex: result.frameIndex,
        msFrame: result.msFrame,
        threadName: result.threadName,
        rows: treeToFlatRows(result.tree),
        hotPath: result.hotPath
      }
    }
  })

  // ============ Profiler: detect spikes ============
  ipcMain.handle('profiler:getSpikes', async () => {
    if (!currentAnalysis) {
      return { success: false, error: 'No analysis data available' }
    }
    const spikes = detectAllSpikes(currentAnalysis.markers)
    return { success: true, data: spikes }
  })

  // ============ AI: analyze with CodeBuddy Agent SDK ============
  ipcMain.handle('ai:analyze', async (event, prompt: string, targetFps?: number) => {
    if (!currentAnalysis) {
      return { success: false, error: 'No analysis data available for AI' }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      return { success: false, error: 'No window found' }
    }

    // Pre-compute DeepAnalysisContext from currentProfileData
    const deep = buildDeepContext(currentProfileData, currentAnalysis, targetFps ?? 30)

    const result = await analyzeWithAIStreaming(win, currentAnalysis, deep, prompt || undefined)
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

/**
 * Pre-compute DeepAnalysisContext from existing in-memory data.
 * Enhanced: builds call chains for spike frames and top markers.
 * No extra I/O -- uses currentProfileData + currentAnalysis already loaded.
 */
function buildDeepContext(
  profileData: ProfileData | null,
  analysis: ProfileAnalysisResult,
  targetFps: number = 30
): DeepAnalysisContext | undefined {
  if (!profileData) return undefined

  const fs = analysis.frameSummary
  const frameTrees: FrameTreeContext[] = []

  // Helper: build tree context for a specific frame
  const buildFrameTree = (frameIndex: number, label: string): FrameTreeContext | null => {
    const result = getFrameCallTree(profileData, frameIndex)
    if (!result) return null
    return {
      frameIndex,
      msFrame: result.msFrame,
      label,
      treeText: formatCallTree(result.tree, 0, 0.5, 6),
      hotPathText: formatHotPath(result.hotPath)
    }
  }

  // Worst frame
  const worstTree = buildFrameTree(fs.maxFrameIndex, 'Worst Frame')
  if (worstTree) frameTrees.push(worstTree)

  // Median frame
  const medianTree = buildFrameTree(fs.medianFrameIndex, 'Median Frame')
  if (medianTree) frameTrees.push(medianTree)

  // Spike detection (uses already-computed marker stats)
  const spikes = detectAllSpikes(analysis.markers, 15)

  // === NEW: Build call trees for spike frames ===
  const spikeFrames: SpikeFrameContext[] = []
  const processedSpikeFrameIndices = new Set<number>()

  for (const spike of spikes.slice(0, 10)) {
    // Avoid duplicates (same frame may appear in spike list)
    if (processedSpikeFrameIndices.has(spike.frameIndex)) continue
    processedSpikeFrameIndices.add(spike.frameIndex)

    const result = getFrameCallTree(profileData, spike.frameIndex)
    if (!result) continue

    spikeFrames.push({
      frameIndex: spike.frameIndex,
      msFrame: result.msFrame,
      ratio: fs.msMedian > 0 ? result.msFrame / fs.msMedian : 1,
      category: spike.category,
      treeText: formatCallTree(result.tree, 0, 0.3, 8),
      hotPathText: formatHotPath(result.hotPath),
      dominantMarker: spike.markerName
    })

    // Limit to 5 spike frame trees to avoid prompt overflow
    if (spikeFrames.length >= 5) break
  }

  // === NEW: Build call chains for top markers ===
  const topMarkerChains: MarkerCallChainContext[] = []
  const topMarkers = analysis.markers.slice(0, 10)

  for (const marker of topMarkers) {
    // Find the frame where this marker is at its worst to extract call chain
    const targetFrameIndex = marker.maxFrameIndex
    const offset = targetFrameIndex - profileData.frameIndexOffset
    if (offset < 0 || offset >= profileData.frames.length) continue

    const frame = profileData.frames[offset]
    if (!frame) continue

    // Search through threads for this marker
    let chainText = ''
    for (const thread of frame.threads) {
      const chain = findCallChain(
        thread.markers,
        profileData.markerNames,
        marker.name,
        frame.msFrame
      )
      if (chain && chain.length > 0) {
        chainText = formatCallChain(chain)
        break
      }
    }

    // Fallback: if not found in worst frame, try median frame
    if (!chainText) {
      const medOffset = marker.medianFrameIndex - profileData.frameIndexOffset
      if (medOffset >= 0 && medOffset < profileData.frames.length) {
        const medFrame = profileData.frames[medOffset]
        if (medFrame) {
          for (const thread of medFrame.threads) {
            const chain = findCallChain(
              thread.markers,
              profileData.markerNames,
              marker.name,
              medFrame.msFrame
            )
            if (chain && chain.length > 0) {
              chainText = formatCallChain(chain)
              break
            }
          }
        }
      }
    }

    topMarkerChains.push({
      markerName: marker.name,
      msMean: marker.msMean,
      msMedian: marker.msMedian,
      msMax: marker.msMax,
      count: marker.count,
      presentOnFrameCount: marker.presentOnFrameCount,
      percentOfFrame: fs.msMean > 0 ? (marker.msMean / fs.msMean) * 100 : 0,
      callChainText: chainText || `(depth=${marker.minDepth}, chain not resolved)`,
      threads: marker.threads,
      depth: marker.minDepth
    })
  }

  return { frameTrees, spikes, spikeFrames, topMarkerChains, targetFps }
}
