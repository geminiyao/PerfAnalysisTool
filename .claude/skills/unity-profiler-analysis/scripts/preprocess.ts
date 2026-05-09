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
}

function computeMarkerSelfTimes(
  analysis: ProfileAnalysisResult,
  config: Config
): MarkerSelfTimeInfo[] {
  const blacklistSet = new Set(config.blacklist.map(b => b.toLowerCase()))

  const results: MarkerSelfTimeInfo[] = []

  for (const marker of analysis.markers) {
    // Skip blacklisted markers
    if (blacklistSet.has(marker.name.toLowerCase())) continue
    // Skip very low impact markers
    if (marker.msMean < config.filter.minSelfTimeMs && marker.msMedian < config.filter.minSelfTimeMs) continue

    // Approximate self-time: msTotal - msChildren is already calculated per marker
    // In the existing system, self-time = msMarkerTotal - msChildren at marker level
    // But in the analysis result, we have aggregated frame-level stats
    // For now, use the available data: markers already sorted by msAtMedian
    // The "self time" concept is approximated from the profiler data

    // Collect per-frame times for spike detection
    const frameSelfTimes = marker.frames.map(f => f.ms)

    // Calculate percentiles
    const sorted = [...frameSelfTimes].sort((a, b) => a - b)
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0
    const mean = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0

    results.push({
      name: marker.name,
      msSelfMean: mean,
      msSelfMedian: median,
      msSelfMax: max,
      msTotalMean: marker.msMean,
      count: marker.count,
      presentOnFrameCount: marker.presentOnFrameCount,
      depth: marker.minDepth,
      threads: marker.threads,
      frameSelfTimes
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

  // Run statistical analysis
  const analysis = analyzeProfileData(profileData)
  if (!analysis) {
    console.error('[preprocess] Error: analysis produced no results')
    process.exit(1)
  }

  const fs2 = analysis.frameSummary
  const actualFps = fs2.msMean > 0 ? 1000 / fs2.msMean : 0

  // Compute marker self-times and sort
  const markerInfos = computeMarkerSelfTimes(analysis, config)
  console.error(`[preprocess] ${markerInfos.length} markers after filtering`)

  // Detect Jank frames
  const jankResult = detectJank(profileData, analysis, config)
  console.error(`[preprocess] Detected ${jankResult.jankCount} Jank + ${jankResult.bigJankCount} BigJank frames`)

  // Detect marker spikes
  const markerSpikes = detectMarkerSpikes(markerInfos, config, fs2.count)
  console.error(`[preprocess] ${markerSpikes.length} markers with significant spikes`)

  // Build marker output with call chains and must-report
  const markersOutput: MarkerOutput[] = markerInfos.map(info => {
    const percentOfFrame = fs2.msMean > 0 ? (info.msSelfMean / fs2.msMean) * 100 : 0
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
    threads: threadsOutput
  }

  // Write output file
  const outputPath = path.join(outputDir, 'preprocess-result.json')
  const jsonOutput = JSON.stringify(result, null, 2)
  fs.writeFileSync(outputPath, jsonOutput, 'utf-8')
  console.error(`[preprocess] Output saved to: ${outputPath}`)

  // Also print to stdout for AI consumption
  console.log(jsonOutput)
}

main()
