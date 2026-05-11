/**
 * preprocess.ts - Performance analysis data preprocessing script.
 *
 * Reads a .pdata file or parsed JSON, runs deterministic analysis,
 * and outputs a structured summary for AI consumption.
 *
 * Usage:
 *   npx tsx preprocess.ts --input ./recording.pdata --target-fps 60
 *   npx tsx preprocess.ts --input ./parsed-data.json --target-fps 30
 */
import * as fs from 'fs'
import * as path from 'path'
import { parsePdataFile } from './lib/profiler/pdata-parser'
import { analyzeProfileData } from './lib/profiler/profile-analyzer'
import { ProfileData, ProfileAnalysisResult } from './lib/profiler/types'
import {
  getFrameCallTree,
  buildCallTree,
  findHotPath,
  findCallChain,
  formatCallTree,
  formatHotPath,
  formatCallChain
} from './lib/profiler/call-tree'
import { detectAllSpikes, SpikeCategory } from './lib/profiler/spike-detector'

// ============ Types ============

interface Config {
  targetFps: number
  projectPath: string
  outputDir?: string
  jank: { jankMultiplier: number; bigJankMultiplier: number }
  callTree: { maxDepth: number }
  markerSpike: { spikeRatioThreshold: number; minSpikeFrames: number }
  mustReport: { budgetRatio: number }
  blacklist: string[]
  filter: { minSelfTimeMs: number }
}

interface PreprocessResult {
  config: { targetFps: number; frameBudgetMs: number }
  frameSummary: FrameSummaryOutput
  markers: MarkerOutput[]
  markerSpikes: MarkerSpikeOutput[]
  jankFrames: JankFrameOutput[]
  frameTrees: FrameTreeOutput[]
  threads: ThreadOutput[]
}

interface FrameSummaryOutput {
  count: number
  actualFps: number
  mean: number
  median: number
  min: number
  max: number
  q1: number
  q3: number
  worstFrameIndex: number
  medianFrameIndex: number
  jankCount: number
  bigJankCount: number
}

interface MarkerOutput {
  name: string
  msSelfMean: number
  msSelfMedian: number
  msSelfMax: number
  msTotalMean: number
  percentOfFrame: number
  count: number
  presentOnFrameCount: number
  callsPerFrame: number
  depth: number
  thread: string
  callChain: string
  spikeRatio: number
  mustReport: boolean
  mustReportReason: string
}

interface MarkerSpikeOutput {
  name: string
  msSelfMean: number
  msSelfMedian: number
  msSelfMax: number
  msSelfP95: number
  spikeRatio: number
  spikeFrameCount: number
  totalFrameCount: number
  spikeFrameIndices: number[]
}

interface JankFrameOutput {
  frameIndex: number
  msFrame: number
  prevThreeAvg: number
  ratio: number
  jankLevel: 'Jank' | 'BigJank'
  category: string
  dominantMarker: string
  hotPath: string
  callTreeSummary: string
  mustReport: boolean
  mustReportReason: string
}

interface FrameTreeOutput {
  frameIndex: number
  label: string
  msFrame: number
  treeText: string
  hotPathText: string
}

interface ThreadOutput {
  name: string
  msMedian: number
  msMax: number
}

// ============ CLI Argument Parsing ============

function parseArgs(): { input: string; targetFps?: number; outputDir: string } {
  const args = process.argv.slice(2)
  let input = ''
  let targetFps: number | undefined
  let outputDir = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[++i]
    } else if (args[i] === '--target-fps' && args[i + 1]) {
      targetFps = parseFloat(args[++i])
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      outputDir = args[++i]
    }
  }

  if (!input) {
    console.error('Usage: npx tsx preprocess.ts --input <file.pdata|file.json> [--target-fps 60] [--output-dir ./output]')
    process.exit(1)
  }

  return { input, targetFps, outputDir }
}

// ============ Load Config ============

function loadConfig(scriptDir: string): Config {
  const configPath = path.join(scriptDir, '..', 'config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as Config
  } catch (e: any) {
    console.warn(`[preprocess] Could not load config.json: ${e.message}, using defaults`)
    return {
      targetFps: 30,
      projectPath: '',
      jank: { jankMultiplier: 2, bigJankMultiplier: 3 },
      callTree: { maxDepth: 8 },
      markerSpike: { spikeRatioThreshold: 3, minSpikeFrames: 2 },
      mustReport: { budgetRatio: 0.3 },
      blacklist: ['Semaphore.WaitForSignal', 'WaitForJobGroupID', 'Idle', 'EditorIdle', 'Profiler.CollectGlobalStats', 'Profiler.FlushData'],
      filter: { minSelfTimeMs: 0.1 }
    }
  }
}

// ============ Load Profile Data ============

function loadProfileData(inputPath: string, outputDir: string): ProfileData {
  const ext = path.extname(inputPath).toLowerCase()

  if (ext === '.pdata') {
    console.error(`[preprocess] Parsing .pdata file: ${inputPath}`)
    const data = parsePdataFile(inputPath)

    // Save parsed data as intermediate output (skip if too large)
    if (outputDir) {
      try {
        const parsedPath = path.join(outputDir, 'parsed-data.json')
        const jsonStr = JSON.stringify(data)
        // Only save if < 100MB to avoid memory issues
        if (jsonStr.length < 100_000_000) {
          fs.writeFileSync(parsedPath, jsonStr, 'utf-8')
          console.error(`[preprocess] Saved parsed data to: ${parsedPath}`)
        } else {
          console.error(`[preprocess] Parsed data too large (${(jsonStr.length / 1_000_000).toFixed(0)}MB), skipping intermediate save`)
        }
      } catch (e: any) {
        console.error(`[preprocess] Could not save parsed data: ${e.message}, continuing...`)
      }
    }

    return data
  } else if (ext === '.json') {
    console.error(`[preprocess] Reading JSON file: ${inputPath}`)
    const raw = fs.readFileSync(inputPath, 'utf-8')
    return JSON.parse(raw) as ProfileData
  } else {
    console.error(`[preprocess] Error: unsupported file extension "${ext}". Use .pdata or .json`)
    process.exit(1)
  }
}

// ============ Jank Detection ============

interface JankDetectionResult {
  jankFrames: JankFrameOutput[]
  jankCount: number
  bigJankCount: number
}

function detectJank(
  profileData: ProfileData,
  analysis: ProfileAnalysisResult,
  config: Config
): JankDetectionResult {
  const { jankMultiplier, bigJankMultiplier } = config.jank
  const maxDepth = config.callTree.maxDepth
  const frames = analysis.frameTimeline
  const jankFrames: JankFrameOutput[] = []

  for (let i = 3; i < frames.length; i++) {
    const current = frames[i]
    const prevThreeAvg = (frames[i - 1].ms + frames[i - 2].ms + frames[i - 3].ms) / 3

    if (prevThreeAvg <= 0) continue

    const ratio = current.ms / prevThreeAvg
    let jankLevel: 'Jank' | 'BigJank' | null = null

    if (ratio >= bigJankMultiplier) {
      jankLevel = 'BigJank'
    } else if (ratio >= jankMultiplier) {
      jankLevel = 'Jank'
    }

    if (!jankLevel) continue

    // Build call tree for this jank frame
    const treeResult = getFrameCallTree(profileData, current.frameIndex)
    let hotPath = ''
    let callTreeSummary = ''
    let dominantMarker = ''
    let category = 'unknown'

    if (treeResult) {
      hotPath = formatHotPath(treeResult.hotPath)
      const fullTree = formatCallTree(treeResult.tree, 0, 0.3, maxDepth)
      // Limit callTreeSummary to ~30 lines to control output size
      const treeLines = fullTree.split('\n')
      callTreeSummary = treeLines.length > 30
        ? treeLines.slice(0, 30).join('\n') + '\n  ... (truncated, use query-frame for full tree)'
        : fullTree

      // Find dominant marker (highest self-time in hot path)
      if (treeResult.hotPath.length > 0) {
        const bottleneck = treeResult.hotPath.find(p => p.isBottleneck)
          || treeResult.hotPath[treeResult.hotPath.length - 1]
        dominantMarker = bottleneck.name
        category = categorizeMarker(dominantMarker)
      }
    }

    jankFrames.push({
      frameIndex: current.frameIndex,
      msFrame: current.ms,
      prevThreeAvg: parseFloat(prevThreeAvg.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(2)),
      jankLevel,
      category,
      dominantMarker,
      hotPath,
      callTreeSummary,
      mustReport: jankLevel === 'BigJank',
      mustReportReason: jankLevel === 'BigJank' ? 'BigJank' : ''
    })
  }

  // Sort by severity
  jankFrames.sort((a, b) => b.ratio - a.ratio)

  return {
    jankFrames,
    jankCount: jankFrames.filter(j => j.jankLevel === 'Jank').length,
    bigJankCount: jankFrames.filter(j => j.jankLevel === 'BigJank').length
  }
}

function categorizeMarker(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('gc.') || n.includes('gc ')) return 'gc'
  if (n.includes('physics')) return 'physics'
  if (n.includes('camera') || n.includes('render') || n.includes('draw') || n.includes('gfx')) return 'rendering'
  if (n.includes('script') || n.includes('lua') || n.includes('xlua') || n.includes('behaviour')) return 'script'
  if (n.includes('load') || n.includes('resource') || n.includes('asset') || n.includes('bundle')) return 'loading'
  if (n.includes('animat') || n.includes('director') || n.includes('timeline')) return 'animation'
  return 'unknown'
}

// ============ Marker Self-Time Calculation ============

interface MarkerSelfTimeInfo {
  name: string
  msSelfMean: number
  msSelfMedian: number
  msSelfMax: number
  msTotalMean: number
  count: number
  presentOnFrameCount: number
  depth: number
  threads: string[]
  // Per-frame self-time data for spike detection
  frameSelfTimes: number[]
  // Average total frame time for frames where this marker is present.
  // Used as denominator for percentOfFrame so that markers appearing in only
  // a subset of frames get a correct ratio (not diluted by frames where they're absent).
  msFrameMeanPresent: number
}

function computeMarkerSelfTimes(
  selfAnalysis: ProfileAnalysisResult,
  totalAnalysis: ProfileAnalysisResult,
  profileData: ProfileData,
  config: Config
): MarkerSelfTimeInfo[] {
  const blacklistSet = new Set(config.blacklist.map(b => b.toLowerCase()))

  // Build total-time lookup from totalAnalysis
  const totalMap = new Map<string, number>()
  for (const marker of totalAnalysis.markers) {
    totalMap.set(marker.name, marker.msMean)
  }

  // Build frameIndex → msFrame lookup for computing per-marker frame average
  const frameTimeMap = new Map<number, number>()
  for (const frame of profileData.frames) {
    frameTimeMap.set(frame.msStartTime !== undefined
      ? profileData.frameIndexOffset + profileData.frames.indexOf(frame)
      : 0, frame.msFrame)
  }
  // More reliable: use offset-based indexing
  frameTimeMap.clear()
  for (let i = 0; i < profileData.frames.length; i++) {
    frameTimeMap.set(profileData.frameIndexOffset + i, profileData.frames[i].msFrame)
  }

  const results: MarkerSelfTimeInfo[] = []

  for (const marker of selfAnalysis.markers) {
    // Skip blacklisted markers
    if (blacklistSet.has(marker.name.toLowerCase())) continue
    // Skip very low impact markers (use self-time for filtering)
    if (marker.msMean < config.filter.minSelfTimeMs && marker.msMedian < config.filter.minSelfTimeMs) continue

    // marker.frames[].ms is now true self-time (selfTimes: true)
    const frameSelfTimes = marker.frames.map(f => f.ms)

    // Calculate percentiles
    const sorted = [...frameSelfTimes].sort((a, b) => a - b)
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0
    const mean = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0

    // Calculate average frame time for frames where this marker is present
    let msFrameSum = 0
    let msFrameCount = 0
    for (const f of marker.frames) {
      const msFrame = frameTimeMap.get(f.frameIndex)
      if (msFrame !== undefined) {
        msFrameSum += msFrame
        msFrameCount++
      }
    }
    const msFrameMeanPresent = msFrameCount > 0 ? msFrameSum / msFrameCount : 0

    results.push({
      name: marker.name,
      msSelfMean: mean,
      msSelfMedian: median,
      msSelfMax: max,
      msTotalMean: totalMap.get(marker.name) ?? marker.msMean,
      count: marker.count,
      presentOnFrameCount: marker.presentOnFrameCount,
      depth: marker.minDepth,
      threads: marker.threads,
      frameSelfTimes,
      msFrameMeanPresent
    })
  }

  // Sort by self-time mean descending
  results.sort((a, b) => b.msSelfMean - a.msSelfMean)

  return results
}

// ============ Marker Spike Detection ============

function detectMarkerSpikes(
  markerInfos: MarkerSelfTimeInfo[],
  config: Config,
  totalFrameCount: number
): MarkerSpikeOutput[] {
  const { spikeRatioThreshold, minSpikeFrames } = config.markerSpike
  const results: MarkerSpikeOutput[] = []

  for (const info of markerInfos) {
    if (info.msSelfMedian <= 0) continue

    const spikeRatio = info.msSelfMax / info.msSelfMedian
    if (spikeRatio < spikeRatioThreshold) continue

    // Count frames where this marker exceeds threshold
    const spikeThreshold = info.msSelfMedian * spikeRatioThreshold
    const spikeFrameIndices: number[] = []
    for (let i = 0; i < info.frameSelfTimes.length; i++) {
      if (info.frameSelfTimes[i] > spikeThreshold) {
        spikeFrameIndices.push(i) // Note: index in frameSelfTimes, not absolute frame index
      }
    }

    if (spikeFrameIndices.length < minSpikeFrames) continue

    // Calculate P95
    const sorted = [...info.frameSelfTimes].sort((a, b) => a - b)
    const p95Idx = Math.floor(sorted.length * 0.95)
    const p95 = sorted[p95Idx] || info.msSelfMax

    results.push({
      name: info.name,
      msSelfMean: parseFloat(info.msSelfMean.toFixed(3)),
      msSelfMedian: parseFloat(info.msSelfMedian.toFixed(3)),
      msSelfMax: parseFloat(info.msSelfMax.toFixed(3)),
      msSelfP95: parseFloat(p95.toFixed(3)),
      spikeRatio: parseFloat(spikeRatio.toFixed(1)),
      spikeFrameCount: spikeFrameIndices.length,
      totalFrameCount,
      spikeFrameIndices: spikeFrameIndices.slice(0, 20) // Limit to 20
    })
  }

  // Sort by spike ratio descending
  results.sort((a, b) => b.spikeRatio - a.spikeRatio)

  return results
}

// ============ Build Call Chain for Top Markers ============

function buildMarkerCallChain(
  profileData: ProfileData,
  markerName: string,
  analysis: ProfileAnalysisResult
): string {
  const marker = analysis.markers.find(m => m.name === markerName)
  if (!marker) return ''

  // Try worst frame for this marker
  const targetFrameIndex = marker.maxFrameIndex
  const offset = targetFrameIndex - profileData.frameIndexOffset
  if (offset < 0 || offset >= profileData.frames.length) return ''

  const frame = profileData.frames[offset]
  if (!frame) return ''

  for (const thread of frame.threads) {
    const chain = findCallChain(thread.markers, profileData.markerNames, markerName, frame.msFrame)
    if (chain && chain.length > 0) {
      return formatCallChain(chain)
    }
  }

  // Fallback: try median frame
  if (marker.medianFrameIndex !== targetFrameIndex) {
    const medOffset = marker.medianFrameIndex - profileData.frameIndexOffset
    if (medOffset >= 0 && medOffset < profileData.frames.length) {
      const medFrame = profileData.frames[medOffset]
      if (medFrame) {
        for (const thread of medFrame.threads) {
          const chain = findCallChain(thread.markers, profileData.markerNames, markerName, medFrame.msFrame)
          if (chain && chain.length > 0) {
            return formatCallChain(chain)
          }
        }
      }
    }
  }

  return `(depth=${marker.minDepth}, chain not resolved)`
}

// ============ MUST_REPORT Logic ============

function shouldMustReport(
  marker: MarkerSelfTimeInfo,
  percentOfFrame: number,
  analysis: ProfileAnalysisResult,
  frameBudgetMs: number,
  config: Config
): { mustReport: boolean; reason: string } {
  // self-time > 20% of frame
  if (percentOfFrame > 20) {
    return { mustReport: true, reason: `self-time 占帧 ${percentOfFrame.toFixed(1)}% > 20%` }
  }

  // self-time mean > budgetRatio of frame budget
  const budgetRatio = config.mustReport.budgetRatio
  const budgetThreshold = frameBudgetMs * budgetRatio
  if (marker.msSelfMean > budgetThreshold) {
    return { mustReport: true, reason: `self-time ${marker.msSelfMean.toFixed(1)}ms > ${(budgetRatio * 100).toFixed(0)}% of budget ${frameBudgetMs.toFixed(1)}ms` }
  }

  // Gfx.WaitForPresent > 30%
  if (marker.name === 'Gfx.WaitForPresent' && percentOfFrame > 30) {
    return { mustReport: true, reason: `GPU Bound: Gfx.WaitForPresent 占帧 ${percentOfFrame.toFixed(1)}%` }
  }

  // WaitForTargetFPS > 30%
  if (marker.name === 'WaitForTargetFPS' && percentOfFrame > 30) {
    return { mustReport: true, reason: `CPU 轻松: WaitForTargetFPS 占帧 ${percentOfFrame.toFixed(1)}%` }
  }

  // FixedUpdate related markers with callsPerFrame > 1
  const isPhysics = marker.name.toLowerCase().includes('fixedupdate') || marker.name.toLowerCase().includes('physics')
  if (isPhysics) {
    const callsPerFrame = marker.presentOnFrameCount > 0
      ? marker.count / marker.presentOnFrameCount
      : 0
    if (callsPerFrame > 1) {
      return { mustReport: true, reason: `物理追帧: 每帧调用 ${callsPerFrame.toFixed(1)} 次` }
    }
  }

  // GC.Collect (will be checked separately in jank frames)
  if (marker.name.includes('GC.Collect') || marker.name.includes('GC.Alloc')) {
    return { mustReport: true, reason: 'GC 相关 marker' }
  }

  return { mustReport: false, reason: '' }
}

// ============ Main ============

function main(): void {
  const { input, targetFps: cliTargetFps, outputDir: cliOutputDir } = parseArgs()
  const scriptDir = __dirname
  const config = loadConfig(scriptDir)

  // CLI target-fps overrides config
  const targetFps = cliTargetFps ?? config.targetFps
  const frameBudgetMs = 1000 / targetFps

  // Determine output directory: CLI > config > default
  // Relative paths are resolved relative to cwd (where the command is run)
  const rawOutputDir = cliOutputDir || config.outputDir || './output'
  const outputDir = path.resolve(rawOutputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  // Load and parse data
  const profileData = loadProfileData(path.resolve(input), outputDir)
  console.error(`[preprocess] Loaded ${profileData.frames.length} frames, ${profileData.markerNames.length} markers`)

  // Run statistical analysis (total time, for call chains and frame summary)
  const analysis = analyzeProfileData(profileData)
  if (!analysis) {
    console.error('[preprocess] Error: analysis produced no results')
    process.exit(1)
  }

  // Run self-time analysis (for marker ranking and mustReport)
  const selfAnalysis = analyzeProfileData(profileData, { selfTimes: true })
  if (!selfAnalysis) {
    console.error('[preprocess] Error: self-time analysis produced no results')
    process.exit(1)
  }

  const fs2 = analysis.frameSummary
  const actualFps = fs2.msMean > 0 ? 1000 / fs2.msMean : 0

  // Compute marker self-times using selfAnalysis (true self-time = total - children)
  // and totalAnalysis (for msTotalMean)
  const markerInfos = computeMarkerSelfTimes(selfAnalysis, analysis, profileData, config)
  console.error(`[preprocess] ${markerInfos.length} markers after filtering`)

  // Detect Jank frames
  const jankResult = detectJank(profileData, analysis, config)
  console.error(`[preprocess] Detected ${jankResult.jankCount} Jank + ${jankResult.bigJankCount} BigJank frames`)

  // Detect marker spikes
  const markerSpikes = detectMarkerSpikes(markerInfos, config, fs2.count)
  console.error(`[preprocess] ${markerSpikes.length} markers with significant spikes`)

  // Build marker output with call chains and must-report
  const markersOutput: MarkerOutput[] = markerInfos.map(info => {
    // percentOfFrame: use the average frame time of frames where this marker is present
    // This correctly handles markers that only appear in a subset of frames
    // (e.g. RenderManager_Shadow appearing in 100 of 600 frames)
    const denominator = info.msFrameMeanPresent > 0 ? info.msFrameMeanPresent : fs2.msMean
    const percentOfFrame = denominator > 0 ? (info.msSelfMean / denominator) * 100 : 0
    const callsPerFrame = info.presentOnFrameCount > 0 ? info.count / info.presentOnFrameCount : 0
    const callChain = buildMarkerCallChain(profileData, info.name, analysis)
    const { mustReport, reason } = shouldMustReport(info, percentOfFrame, analysis, frameBudgetMs, config)

    return {
      name: info.name,
      msSelfMean: parseFloat(info.msSelfMean.toFixed(3)),
      msSelfMedian: parseFloat(info.msSelfMedian.toFixed(3)),
      msSelfMax: parseFloat(info.msSelfMax.toFixed(3)),
      msTotalMean: parseFloat(info.msTotalMean.toFixed(3)),
      percentOfFrame: parseFloat(percentOfFrame.toFixed(1)),
      count: info.count,
      presentOnFrameCount: info.presentOnFrameCount,
      callsPerFrame: parseFloat(callsPerFrame.toFixed(2)),
      depth: info.depth,
      thread: info.threads[0] || '-',
      callChain,
      spikeRatio: info.msSelfMedian > 0 ? parseFloat((info.msSelfMax / info.msSelfMedian).toFixed(1)) : 0,
      mustReport,
      mustReportReason: reason
    }
  })

  // Build frame trees (worst + median)
  const frameTrees: FrameTreeOutput[] = []
  const maxDepth = config.callTree.maxDepth

  const truncateTree = (text: string, maxLines: number = 30): string => {
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n') + '\n  ... (truncated, use query-frame for full tree)'
  }

  const worstResult = getFrameCallTree(profileData, fs2.maxFrameIndex)
  if (worstResult) {
    frameTrees.push({
      frameIndex: fs2.maxFrameIndex,
      label: 'Worst Frame',
      msFrame: worstResult.msFrame,
      treeText: truncateTree(formatCallTree(worstResult.tree, 0, 0.3, maxDepth)),
      hotPathText: formatHotPath(worstResult.hotPath)
    })
  }

  const medianResult = getFrameCallTree(profileData, fs2.medianFrameIndex)
  if (medianResult) {
    frameTrees.push({
      frameIndex: fs2.medianFrameIndex,
      label: 'Median Frame',
      msFrame: medianResult.msFrame,
      treeText: truncateTree(formatCallTree(medianResult.tree, 0, 0.3, maxDepth)),
      hotPathText: formatHotPath(medianResult.hotPath)
    })
  }

  // Build threads output
  const threadsOutput: ThreadOutput[] = analysis.threads
    .filter(t => t.msMedian > 0.5)
    .sort((a, b) => b.msMedian - a.msMedian)
    .map(t => ({
      name: t.threadGroupName || t.threadNameWithIndex,
      msMedian: parseFloat(t.msMedian.toFixed(2)),
      msMax: parseFloat(t.msMax.toFixed(2))
    }))

  // Build per-frame timings array for timeline visualization
  const frameTimings: number[] = profileData.frames.map(f =>
    parseFloat(f.msFrame.toFixed(2))
  )

  // Assemble final output
  const result: PreprocessResult = {
    config: { targetFps, frameBudgetMs: parseFloat(frameBudgetMs.toFixed(2)) },
    frameSummary: {
      count: fs2.count,
      actualFps: parseFloat(actualFps.toFixed(1)),
      mean: parseFloat(fs2.msMean.toFixed(2)),
      median: parseFloat(fs2.msMedian.toFixed(2)),
      min: parseFloat(fs2.msMin.toFixed(2)),
      max: parseFloat(fs2.msMax.toFixed(2)),
      q1: parseFloat(fs2.msLowerQuartile.toFixed(2)),
      q3: parseFloat(fs2.msUpperQuartile.toFixed(2)),
      worstFrameIndex: fs2.maxFrameIndex,
      medianFrameIndex: fs2.medianFrameIndex,
      jankCount: jankResult.jankCount,
      bigJankCount: jankResult.bigJankCount
    },
    markers: markersOutput,
    markerSpikes,
    jankFrames: jankResult.jankFrames,
    frameTrees,
    frameTimings,
    threads: threadsOutput
  }

  // Write full output file (for web frontend, query-frame, etc.)
  const outputPath = path.join(outputDir, 'preprocess-result.json')
  const jsonOutput = JSON.stringify(result, null, 2)
  fs.writeFileSync(outputPath, jsonOutput, 'utf-8')
  console.error(`[preprocess] Full output saved to: ${outputPath} (${(jsonOutput.length / 1024).toFixed(0)}KB)`)

  // Write summary file (for AI consumption — small, ~15-20KB)
  // AI MUST read this file instead of preprocess-result.json to avoid 100K+ token waste
  const mustReportMarkers = markersOutput.filter(m => m.mustReport)
  const top20Markers = markersOutput.slice(0, 20)
  // Merge: top20 + any mustReport markers not already in top20
  const top20Names = new Set(top20Markers.map(m => m.name))
  const extraMustReport = mustReportMarkers.filter(m => !top20Names.has(m.name))
  const summaryMarkers = [...top20Markers, ...extraMustReport]

  const summary = {
    config: result.config,
    frameSummary: result.frameSummary,
    markers: summaryMarkers.map(m => ({
      name: m.name,
      msSelfMean: m.msSelfMean,
      msSelfMedian: m.msSelfMedian,
      msSelfMax: m.msSelfMax,
      msTotalMean: m.msTotalMean,
      percentOfFrame: m.percentOfFrame,
      count: m.count,
      presentOnFrameCount: m.presentOnFrameCount,
      callsPerFrame: m.callsPerFrame,
      depth: m.depth,
      thread: m.thread,
      callChain: m.callChain,
      spikeRatio: m.spikeRatio,
      mustReport: m.mustReport,
      mustReportReason: m.mustReportReason
    })),
    markerSpikes: markerSpikes.slice(0, 20).map(s => ({
      name: s.name,
      msSelfMean: s.msSelfMean,
      msSelfMedian: s.msSelfMedian,
      msSelfMax: s.msSelfMax,
      msSelfP95: s.msSelfP95,
      spikeRatio: s.spikeRatio,
      spikeFrameCount: s.spikeFrameCount,
      totalFrameCount: s.totalFrameCount
    })),
    jankFrames: jankResult.jankFrames.map(j => ({
      frameIndex: j.frameIndex,
      msFrame: j.msFrame,
      prevThreeAvg: j.prevThreeAvg,
      ratio: j.ratio,
      jankLevel: j.jankLevel,
      category: j.category,
      dominantMarker: j.dominantMarker,
      hotPath: j.hotPath,
      mustReport: j.mustReport,
      mustReportReason: j.mustReportReason
      // callTreeSummary omitted — use query-frame for full tree
    })),
    frameTrees: result.frameTrees,
    threads: result.threads,
    _meta: {
      fullResultFile: 'preprocess-result.json',
      totalMarkerCount: markersOutput.length,
      totalSpikeCount: markerSpikes.length,
      note: 'This is a summary for AI consumption. Use query-frame.ts for detailed per-frame analysis. Full data in preprocess-result.json.'
    }
  }

  const summaryPath = path.join(outputDir, 'preprocess-summary.json')
  const summaryJson = JSON.stringify(summary, null, 2)
  fs.writeFileSync(summaryPath, summaryJson, 'utf-8')
  console.error(`[preprocess] Summary saved to: ${summaryPath} (${(summaryJson.length / 1024).toFixed(0)}KB)`)

  // Print summary to stdout for AI consumption (NOT the full result)
  console.log(summaryJson)
}

main()
