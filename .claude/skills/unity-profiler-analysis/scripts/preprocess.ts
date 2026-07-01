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
import { ProfileData, ProfileAnalysisResult, MarkerDataResult, RenderingSummary, MemorySummary, FrameCounters } from './lib/profiler/types'
import {
  getFrameCallTree,
  buildCallTree,
  findHotPath,
  findCallChain,
  formatCallTree,
  formatHotPath,
  formatCallChain,
  aggregateCallTrees,
  type AggregatedCallTree
} from './lib/profiler/call-tree'
import { detectAllSpikes, SpikeCategory } from './lib/profiler/spike-detector'

// ============ Types ============

export interface Config {
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

export interface PreprocessResult {
  config: { targetFps: number; frameBudgetMs: number }
  frameSummary: FrameSummaryOutput
  markers: MarkerOutput[]
  /** Phase X.1: 每线程独立的 marker 列表（key = threadNameWithIndex）。
   *  用于跨源对位、多线程分析。markers[] 字段保持原状（跨线程聚合），不互相替代。 */
  markersByThread?: Record<string, MarkerOutput[]>
  /** Phase X.2: 每线程的全 trace 聚合 callTree（洋葱剥离用真实 ms/帧）。
   *  阻塞 cross-source §3 主循环阶段 + unity diff + 三源对位。 */
  aggregatedCallTrees?: AggregatedCallTree[]
  markerSpikes: MarkerSpikeOutput[]
  jankFrames: JankFrameOutput[]
  frameTrees: FrameTreeOutput[]
  frameTimings: number[]
  threads: ThreadOutput[]
  /** Render counters 聚合（缺 sidecar 时 undefined） */
  rendering?: RenderingSummary
  /** Memory counters 聚合（缺 sidecar 时 undefined） */
  memory?: MemorySummary
}

export interface FrameSummaryOutput {
  count: number
  actualFps: number
  mean: number
  median: number
  min: number
  max: number
  q1: number
  q3: number
  /** Phase X.4: 90/95/99/999 percentiles (ms/帧) */
  p90?: number
  p95?: number
  p99?: number
  p999?: number
  worstFrameIndex: number
  medianFrameIndex: number
  jankCount: number
  bigJankCount: number
}

export interface MarkerOutput {
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

export interface MarkerSpikeOutput {
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

export interface JankFrameOutput {
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
  /** Phase X.5: 此 jank 帧的 top 3 markers，便于跨场景 diff 时直接看哪些 marker 触发了 jank */
  topMarkers?: { name: string; msSelf: number; thread: string }[]
}

export interface FrameTreeOutput {
  frameIndex: number
  label: string
  msFrame: number
  treeText: string
  hotPathText: string
}

export interface ThreadOutput {
  name: string
  msMedian: number
  msMax: number
  /** Phase X.6: 全 trace 平均 ms/帧（与 aggregatedCallTrees.msPerFrameTotal 对账）*/
  msPerFrameTotal?: number
  /** Phase X.6: 该线程上 top 5 markers（按 selfMean）*/
  topMarkers?: { name: string; msSelfMean: number; percentOfFrame: number }[]
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

export function loadConfig(scriptDir: string): Config {
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

export function loadProfileData(inputPath: string, outputDir: string): ProfileData {
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
  config: Config,
  /** Phase X.1: 可选——指定 markers 来源（默认是 selfAnalysis.markers, 跨线程聚合）。
   *  传入特定线程的 markers 数组时，本函数对该线程单独算 selfTime/spike */
  markersOverride?: MarkerDataResult[]
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

  const sourceMarkers = markersOverride ?? selfAnalysis.markers

  for (const marker of sourceMarkers) {
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

// ============ Render / Memory aggregation ============

interface CounterSeries {
  /** 与 frames 同长，缺测项为 NaN */
  values: number[]
  frameIndices: number[]
}

function pickSeries(frames: FrameCounters[], field: keyof FrameCounters): CounterSeries {
  const values: number[] = []
  const frameIndices: number[] = []
  for (const f of frames) {
    const v = f[field]
    if (typeof v === 'number') {
      values.push(v)
      frameIndices.push(f.frameIndex)
    }
  }
  return { values, frameIndices }
}

function statsOf(series: CounterSeries): { mean: number; median: number; max: number; p95: number; maxFrameIndex: number } {
  if (series.values.length === 0) {
    return { mean: 0, median: 0, max: 0, p95: 0, maxFrameIndex: 0 }
  }
  let max = -Infinity
  let maxFrameIndex = 0
  let sum = 0
  for (let i = 0; i < series.values.length; i++) {
    const v = series.values[i]
    sum += v
    if (v > max) {
      max = v
      maxFrameIndex = series.frameIndices[i]
    }
  }
  const sorted = [...series.values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)
  const p95 = sorted[p95Idx]
  return {
    mean: sum / series.values.length,
    median,
    max,
    p95,
    maxFrameIndex
  }
}

function meanMax(series: CounterSeries): { mean: number; max: number } {
  if (series.values.length === 0) return { mean: 0, max: 0 }
  let max = -Infinity
  let sum = 0
  for (const v of series.values) {
    sum += v
    if (v > max) max = v
  }
  return { mean: sum / series.values.length, max }
}

function meanMedianMax(series: CounterSeries): { mean: number; median: number; max: number } {
  if (series.values.length === 0) return { mean: 0, median: 0, max: 0 }
  let max = -Infinity
  let sum = 0
  for (const v of series.values) {
    sum += v
    if (v > max) max = v
  }
  const sorted = [...series.values].sort((a, b) => a - b)
  return { mean: sum / series.values.length, median: sorted[Math.floor(sorted.length / 2)], max }
}

/**
 * 用首尾帧线性回归近似 growth rate（bytes/sec）。
 * 假设帧均匀分布在 totalDurationMs 内。
 * totalDurationMs 由 ProfileData 的首尾 frame.msStartTime 推断。
 */
function growthRateBytesPerSec(series: CounterSeries, totalDurationMs: number): number {
  if (series.values.length < 2 || totalDurationMs <= 0) return 0
  const first = series.values[0]
  const last = series.values[series.values.length - 1]
  return ((last - first) / totalDurationMs) * 1000
}

function gcAllocStats(series: CounterSeries): { mean: number; median: number; max: number; p95: number; allocFrames: number } {
  if (series.values.length === 0) return { mean: 0, median: 0, max: 0, p95: 0, allocFrames: 0 }
  const allocFrames = series.values.filter(v => v > 0).length
  const s = statsOf(series)
  return {
    mean: s.mean,
    median: s.median,
    max: s.max,
    p95: s.p95,
    allocFrames
  }
}

/**
 * 抽样 perFrame 序列：worst（max draw calls 帧）+ median + 等距抽样，最多 50 帧。
 */
function sampleRenderingPerFrame(frames: FrameCounters[]): { frameIndex: number; drawCalls: number; batches: number }[] {
  if (frames.length === 0) return []
  const dcSeries = pickSeries(frames, 'drawCalls')
  if (dcSeries.values.length === 0) return []
  const dcStats = statsOf(dcSeries)
  const wantedSet = new Set<number>()
  wantedSet.add(dcStats.maxFrameIndex)
  // 中位帧
  const sortedIdx = dcSeries.values
    .map((v, i) => ({ v, idx: dcSeries.frameIndices[i] }))
    .sort((a, b) => a.v - b.v)
  wantedSet.add(sortedIdx[Math.floor(sortedIdx.length / 2)].idx)
  // 等距抽样 ~48 帧（加上 worst+median 共 50）
  const sampleStep = Math.max(1, Math.floor(frames.length / 48))
  for (let i = 0; i < frames.length; i += sampleStep) {
    wantedSet.add(frames[i].frameIndex)
  }
  const out: { frameIndex: number; drawCalls: number; batches: number }[] = []
  for (const f of frames) {
    if (!wantedSet.has(f.frameIndex)) continue
    out.push({
      frameIndex: f.frameIndex,
      drawCalls: typeof f.drawCalls === 'number' ? f.drawCalls : 0,
      batches: typeof f.batches === 'number' ? f.batches : 0
    })
  }
  return out
}

function sampleMemoryPerFrame(frames: FrameCounters[]): { frameIndex: number; gcAllocatedInFrame: number; totalUsedMemory: number }[] {
  if (frames.length === 0) return []
  const wantedSet = new Set<number>()
  // worst GC alloc 帧
  let maxGc = -Infinity
  let maxGcIdx = 0
  for (const f of frames) {
    const v = typeof f.gcAllocatedInFrame === 'number' ? f.gcAllocatedInFrame : 0
    if (v > maxGc) {
      maxGc = v
      maxGcIdx = f.frameIndex
    }
  }
  wantedSet.add(maxGcIdx)
  // 等距抽样
  const sampleStep = Math.max(1, Math.floor(frames.length / 49))
  for (let i = 0; i < frames.length; i += sampleStep) {
    wantedSet.add(frames[i].frameIndex)
  }
  const out: { frameIndex: number; gcAllocatedInFrame: number; totalUsedMemory: number }[] = []
  for (const f of frames) {
    if (!wantedSet.has(f.frameIndex)) continue
    out.push({
      frameIndex: f.frameIndex,
      gcAllocatedInFrame: typeof f.gcAllocatedInFrame === 'number' ? f.gcAllocatedInFrame : 0,
      totalUsedMemory: typeof f.totalUsedMemory === 'number' ? f.totalUsedMemory : 0
    })
  }
  return out
}

function round(n: number, dp: number = 0): number {
  const m = Math.pow(10, dp)
  return Math.round(n * m) / m
}

function computeRenderingMemory(
  profileData: ProfileData
): { rendering?: RenderingSummary; memory?: MemorySummary } {
  const sidecar = profileData.counters
  if (!sidecar || sidecar.frames.length === 0) return {}

  const frames = sidecar.frames

  // ----- Rendering -----
  const drawCalls = pickSeries(frames, 'drawCalls')
  const batches = pickSeries(frames, 'batches')
  const setPass = pickSeries(frames, 'setPassCalls')
  const triangles = pickSeries(frames, 'triangles')
  const vertices = pickSeries(frames, 'vertices')
  const usedTexBytes = pickSeries(frames, 'usedTexturesBytes')
  const usedTexCount = pickSeries(frames, 'usedTexturesCount')

  let rendering: RenderingSummary | undefined
  if (drawCalls.values.length > 0 || batches.values.length > 0) {
    const dcStats = statsOf(drawCalls)
    const bStats = statsOf(batches)
    const spStats = statsOf(setPass)
    rendering = {
      drawCalls: { mean: round(dcStats.mean, 1), median: round(dcStats.median), max: round(dcStats.max), p95: round(dcStats.p95), maxFrameIndex: dcStats.maxFrameIndex },
      batches: { mean: round(bStats.mean, 1), median: round(bStats.median), max: round(bStats.max), p95: round(bStats.p95), maxFrameIndex: bStats.maxFrameIndex },
      setPassCalls: { mean: round(spStats.mean, 1), median: round(spStats.median), max: round(spStats.max), p95: round(spStats.p95), maxFrameIndex: spStats.maxFrameIndex },
      triangles: (() => {
        const s = meanMedianMax(triangles)
        return { mean: round(s.mean), median: round(s.median), max: round(s.max) }
      })(),
      vertices: (() => {
        const s = meanMedianMax(vertices)
        return { mean: round(s.mean), median: round(s.median), max: round(s.max) }
      })(),
      usedTexturesBytes: (() => {
        const s = meanMax(usedTexBytes)
        return { mean: round(s.mean), max: round(s.max) }
      })(),
      usedTexturesCount: (() => {
        const s = meanMax(usedTexCount)
        return { mean: round(s.mean, 1), max: round(s.max) }
      })(),
      perFrame: sampleRenderingPerFrame(frames)
    }
  }

  // ----- Memory -----
  const totalReserved = pickSeries(frames, 'totalReservedMemory')
  const totalUsed = pickSeries(frames, 'totalUsedMemory')
  const gcAlloc = pickSeries(frames, 'gcAllocatedInFrame')
  const gcReserved = pickSeries(frames, 'gcReservedMemory')
  const sysUsed = pickSeries(frames, 'systemUsedMemory')
  const particleMem = pickSeries(frames, 'particleMemory')
  const meshMem = pickSeries(frames, 'meshMemory')
  const materialCount = pickSeries(frames, 'materialCount')
  const objectCount = pickSeries(frames, 'objectCount')

  // 推算 trace 总时长 (ms)：用 ProfileData.frames 首尾 msStartTime
  let traceDurationMs = 0
  if (profileData.frames.length >= 2) {
    const firstStart = profileData.frames[0].msStartTime
    const lastFrame = profileData.frames[profileData.frames.length - 1]
    traceDurationMs = (lastFrame.msStartTime + lastFrame.msFrame) - firstStart
  }

  let memory: MemorySummary | undefined
  if (totalReserved.values.length > 0 || gcAlloc.values.length > 0 || totalUsed.values.length > 0) {
    const trMM = meanMax(totalReserved)
    const tuMM = meanMax(totalUsed)
    const grMM = meanMax(gcReserved)
    const suMM = meanMax(sysUsed)
    const gcStats = gcAllocStats(gcAlloc)
    const optionalMM = (s: CounterSeries) =>
      s.values.length > 0 ? (() => { const m = meanMax(s); return { mean: round(m.mean), max: round(m.max) } })() : undefined
    memory = {
      totalReservedMemory: {
        mean: round(trMM.mean),
        max: round(trMM.max),
        growthRate: round(growthRateBytesPerSec(totalReserved, traceDurationMs))
      },
      totalUsedMemory: {
        mean: round(tuMM.mean),
        max: round(tuMM.max),
        growthRate: round(growthRateBytesPerSec(totalUsed, traceDurationMs))
      },
      gcAllocatedInFrame: {
        mean: round(gcStats.mean, 1),
        median: round(gcStats.median),
        max: round(gcStats.max),
        p95: round(gcStats.p95),
        allocFrames: gcStats.allocFrames
      },
      gcReservedMemory: { mean: round(grMM.mean), max: round(grMM.max) },
      systemUsedMemory: { mean: round(suMM.mean), max: round(suMM.max) },
      particleMemory: optionalMM(particleMem),
      meshMemory: optionalMM(meshMem),
      materialCount: optionalMM(materialCount),
      objectCount: optionalMM(objectCount),
      perFrame: sampleMemoryPerFrame(frames)
    }
  }

  return { rendering, memory }
}

// ============ Reusable analysis core (shared by CLI main() and UnityProfilerProvider) ============

/**
 * Run the full deterministic preprocessing analysis on parsed ProfileData.
 * Pure: no file IO. The CLI main() and the platform Provider both call this so the
 * analysis logic (markers / jank / spikes / call chains / frame trees) stays single-sourced.
 */
export function buildPreprocessResult(
  profileData: ProfileData,
  config: Config,
  targetFps: number
): PreprocessResult {
  const frameBudgetMs = 1000 / targetFps

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

  // Phase X.1: 构造 markersByThread —— 同名 marker 在每条线程上的独立统计
  const markersByThread: Record<string, MarkerOutput[]> = {}
  if (selfAnalysis.markersByThread) {
    for (const [threadName, threadMarkers] of Object.entries(selfAnalysis.markersByThread)) {
      // 用同样的 computeMarkerSelfTimes + map 逻辑，但用该线程的 markers 数据
      const totalAnalysisForThread = analysis.markersByThread?.[threadName]
      // totalAnalysis 缺时 fallback 用全局，msTotalMean 会偏差但不致命
      const fakeTotalAnalysis = totalAnalysisForThread
        ? { ...analysis, markers: totalAnalysisForThread }
        : analysis
      const fakeSelfAnalysis = { ...selfAnalysis, markers: threadMarkers }
      const threadInfos = computeMarkerSelfTimes(fakeSelfAnalysis, fakeTotalAnalysis, profileData, config, threadMarkers)
      markersByThread[threadName] = threadInfos.map(info => {
        const denominator = info.msFrameMeanPresent > 0 ? info.msFrameMeanPresent : fs2.msMean
        const percentOfFrame = denominator > 0 ? (info.msSelfMean / denominator) * 100 : 0
        const callsPerFrame = info.presentOnFrameCount > 0 ? info.count / info.presentOnFrameCount : 0
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
          thread: threadName,
          callChain: '',  // per-thread 不重复算 callChain (用 markers[].callChain 就够了)
          spikeRatio: info.msSelfMedian > 0 ? parseFloat((info.msSelfMax / info.msSelfMedian).toFixed(1)) : 0,
          mustReport: false,  // mustReport 仍以全局 markers 为准
          mustReportReason: ''
        }
      })
    }
    const threadCount = Object.keys(markersByThread).length
    const totalMarkerLines = Object.values(markersByThread).reduce((s, arr) => s + arr.length, 0)
    console.error(`[preprocess] markersByThread: ${threadCount} threads, ${totalMarkerLines} marker lines`)
  }

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

  // Phase X.2 + X.3: 全 trace 聚合 callTree per-thread + GC.Alloc 业务子树归因
  // 选 msMedian > 1ms 的线程做聚合，其它线程负载太低不值得
  const targetThreads = analysis.threads
    .filter(t => t.msMedian > 1)
    .sort((a, b) => b.msMedian - a.msMedian)
    .slice(0, 8)  // 最多 8 条线程，避免输出爆炸
  // 识别 GC.Alloc marker（[[methodology_gc_alloc_attribution]]）
  const gcAllocSet = new Set<string>()
  for (const name of profileData.markerNames) {
    if (/GC\.Alloc/i.test(name)) gcAllocSet.add(name)
  }
  const aggregatedCallTrees: AggregatedCallTree[] = []
  for (const t of targetThreads) {
    const aggTree = aggregateCallTrees(profileData, t.threadNameWithIndex, { gcAllocMarkerNames: gcAllocSet })
    if (aggTree) aggregatedCallTrees.push(aggTree)
  }
  console.error(`[preprocess] aggregatedCallTrees: ${aggregatedCallTrees.length} threads (gcAlloc markers: ${gcAllocSet.size})`)

  // Build threads output
  // Phase X.6: 加 msPerFrameTotal + topMarkers
  const threadsOutput: ThreadOutput[] = analysis.threads
    .filter(t => t.msMedian > 0.5)
    .sort((a, b) => b.msMedian - a.msMedian)
    .map(t => {
      const threadName = t.threadGroupName || t.threadNameWithIndex
      // 从 markersByThread 取 top 5
      const threadMarkers = markersByThread[t.threadNameWithIndex] ?? []
      const topMarkers = threadMarkers
        .filter(m => !/^Idle$|Sleep|Wait/i.test(m.name))
        .sort((a, b) => b.msSelfMean - a.msSelfMean)
        .slice(0, 5)
        .map(m => ({ name: m.name, msSelfMean: m.msSelfMean, percentOfFrame: m.percentOfFrame }))
      // 从 aggregatedCallTrees 取该线程的 msPerFrameTotal
      const aggTree = aggregatedCallTrees.find(a => a.threadName === t.threadNameWithIndex)
      return {
        name: threadName,
        msMedian: parseFloat(t.msMedian.toFixed(2)),
        msMax: parseFloat(t.msMax.toFixed(2)),
        msPerFrameTotal: aggTree?.msPerFrameTotal,
        topMarkers,
      }
    })

  // Phase X.5: 给 jankFrames 挂 topMarkers — 该 jank 帧 self-time top 3 marker
  if (jankResult.jankFrames.length) {
    for (const jank of jankResult.jankFrames) {
      const offset = jank.frameIndex - profileData.frameIndexOffset
      if (offset < 0 || offset >= profileData.frames.length) continue
      const frame = profileData.frames[offset]
      // 简易算 self：父子按 depth 关系，self = own msMarkerTotal - 直接子节点 total
      const allEntries: { name: string; msSelf: number; thread: string }[] = []
      for (const thread of frame.threads) {
        const tn = profileData.threadNames[thread.threadIndex] || ''
        const selfMs = thread.markers.map(m => m.msMarkerTotal)
        // 减去直接子节点：扫描 stack
        const stack: number[] = []  // 存索引
        for (let i = 0; i < thread.markers.length; i++) {
          const m = thread.markers[i]
          while (stack.length > 0 && thread.markers[stack[stack.length - 1]].depth >= m.depth) stack.pop()
          if (stack.length > 0) selfMs[stack[stack.length - 1]] -= m.msMarkerTotal
          stack.push(i)
        }
        for (let i = 0; i < thread.markers.length; i++) {
          if (selfMs[i] < 0.5) continue  // 噪声过滤
          allEntries.push({
            name: profileData.markerNames[thread.markers[i].nameIndex] || '?',
            msSelf: parseFloat(selfMs[i].toFixed(2)),
            thread: tn,
          })
        }
      }
      jank.topMarkers = allEntries
        .filter(e => !/^Idle$|^Sleep$|WaitFor/i.test(e.name))
        .sort((a, b) => b.msSelf - a.msSelf)
        .slice(0, 3)
    }
  }

  // Build per-frame timings array for timeline visualization
  const frameTimings: number[] = profileData.frames.map(f =>
    parseFloat(f.msFrame.toFixed(2))
  )

  // Phase X.4: 计算 frame 百分位数
  const sortedFrameMs = [...frameTimings].sort((a, b) => a - b)
  const pct = (p: number): number | undefined => {
    if (sortedFrameMs.length === 0) return undefined
    const idx = Math.min(Math.floor(sortedFrameMs.length * p), sortedFrameMs.length - 1)
    return parseFloat(sortedFrameMs[idx].toFixed(2))
  }

  // Render/Memory 聚合（缺 sidecar 时返回空对象，rendering/memory 字段为 undefined）
  const { rendering, memory } = computeRenderingMemory(profileData)
  if (rendering || memory) {
    console.error(
      `[preprocess] counters loaded: ` +
        `${rendering ? `rendering(drawCalls=${rendering.drawCalls.mean}/${rendering.drawCalls.max}) ` : ''}` +
        `${memory ? `memory(reserved=${memory.totalReservedMemory.mean}B mean, growth=${memory.totalReservedMemory.growthRate}B/s)` : ''}`
    )
  }

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
      p90: pct(0.90),
      p95: pct(0.95),
      p99: pct(0.99),
      p999: pct(0.999),
      worstFrameIndex: fs2.maxFrameIndex,
      medianFrameIndex: fs2.medianFrameIndex,
      jankCount: jankResult.jankCount,
      bigJankCount: jankResult.bigJankCount
    },
    markers: markersOutput,
    markersByThread,
    aggregatedCallTrees,
    markerSpikes,
    jankFrames: jankResult.jankFrames,
    frameTrees,
    frameTimings,
    threads: threadsOutput,
    rendering,
    memory
  }

  return result
}

// ============ Main ============

function main(): void {
  const { input, targetFps: cliTargetFps, outputDir: cliOutputDir } = parseArgs()
  const scriptDir = __dirname
  const config = loadConfig(scriptDir)

  // CLI target-fps overrides config
  const targetFps = cliTargetFps ?? config.targetFps

  // Determine output directory: CLI > config > default
  // Relative paths are resolved relative to cwd (where the command is run)
  const rawOutputDir = cliOutputDir || config.outputDir || './output'
  const outputDir = path.resolve(rawOutputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  // Load and parse data
  const profileData = loadProfileData(path.resolve(input), outputDir)
  console.error(`[preprocess] Loaded ${profileData.frames.length} frames, ${profileData.markerNames.length} markers`)

  const result = buildPreprocessResult(profileData, config, targetFps)

  // Write full output file (for web frontend, query-frame, etc.)
  const outputPath = path.join(outputDir, 'preprocess-result.json')
  const jsonOutput = JSON.stringify(result, null, 2)
  fs.writeFileSync(outputPath, jsonOutput, 'utf-8')
  console.error(`[preprocess] Full output saved to: ${outputPath} (${(jsonOutput.length / 1024).toFixed(0)}KB)`)

  // Write summary file (for AI consumption — small, ~15-20KB)
  // AI MUST read this file instead of preprocess-result.json to avoid 100K+ token waste
  const markersOutput = result.markers
  const markerSpikes = result.markerSpikes
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
    jankFrames: result.jankFrames.map(j => ({
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
    rendering: result.rendering ? {
      drawCalls: result.rendering.drawCalls,
      batches: result.rendering.batches,
      setPassCalls: result.rendering.setPassCalls,
      triangles: result.rendering.triangles,
      vertices: result.rendering.vertices,
      usedTexturesBytes: result.rendering.usedTexturesBytes,
      usedTexturesCount: result.rendering.usedTexturesCount
      // perFrame 不进 summary，体积控制
    } : undefined,
    memory: result.memory ? {
      totalReservedMemory: result.memory.totalReservedMemory,
      totalUsedMemory: result.memory.totalUsedMemory,
      gcAllocatedInFrame: result.memory.gcAllocatedInFrame,
      gcReservedMemory: result.memory.gcReservedMemory,
      systemUsedMemory: result.memory.systemUsedMemory,
      particleMemory: result.memory.particleMemory,
      meshMemory: result.memory.meshMemory,
      materialCount: result.memory.materialCount,
      objectCount: result.memory.objectCount
    } : undefined,
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

// 仅当作为 CLI 直接执行时才跑 main(); 被 Provider import 时不触发副作用。
if (require.main === module) {
  main()
}
