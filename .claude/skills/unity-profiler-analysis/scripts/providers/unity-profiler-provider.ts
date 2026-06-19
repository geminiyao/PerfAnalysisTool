/**
 * UnityProfilerProvider — Layer 1 提取器 (源 id = unity_profiler)。
 *
 * 职责 (出数据, 确定性代码): 解析 UnityProfilerData (.pdata) → 产出统一 PerfProfile 片段。
 *   - core.metrics: 按 docs/metric-key-naming-spec.md 写 key (frame.* / marker.<name>.msPerFrame / gc.* / jank.* / spike.*)
 *   - core.frame[unity_profiler]: 帧口径显式 'playerloop'
 *   - detail.unity_profiler: 富数据 (frameSummary / 统一 callTrees / markers / markerSpikes / jankFrames / threadSummary)
 *
 * 复用现有 preprocess 分析逻辑 (buildPreprocessResult), 不重写 jank/spike/marker 统计。
 * 依据: docs/report-spec-and-data-contract.md §2/§7 (验收契约), §1.5 (统一 CallTree),
 *       docs/analysis-framework-design.md §5, docs/metric-key-naming-spec.md。
 *
 * 注意: 本文件由 tsx 运行 (skill 侧), 不参与 web 的 tsc 编译; 故跨树 import web/shared/perf-model
 * 仅为类型 + schemaVersion 常量 (single source of truth)。DB 入库由 web 侧 ingest 读本 Provider 产出的
 * unity-profile.json 完成 (两侧只通过磁盘上的 PerfProfile JSON 契约耦合)。
 */
import * as path from 'path'
import {
  buildPreprocessResult,
  loadConfig,
  loadProfileData,
  type Config,
  type PreprocessResult,
} from '../preprocess'
import { getFrameCallTree, type CallTreeNode as LibCallTreeNode } from '../lib/profiler/call-tree'
import type { ProfileData } from '../lib/profiler/types'
import {
  PERF_PROFILE_SCHEMA_VERSION,
  type PerfProfile,
  type Metric,
  type FrameStat,
  type CallTree,
  type CallTreeNode,
  type RawAssetRef,
} from '../../../../../web/shared/perf-model'

const SOURCE = 'unity_profiler' as const

// ------------------------------------------------------------
// 输入 / 输出
// ------------------------------------------------------------

export interface BuildUnityProfileOptions {
  /** .pdata 或已解析的 parsed-data.json 路径 (二选一与 profileData)。 */
  input?: string
  /** 已解析数据 (复用时避免重复 parse)。 */
  profileData?: ProfileData
  /** 目标帧率 (默认取 config.json)。 */
  targetFps?: number
  /** skill 目录 (用于加载 config.json); 默认按本文件相对定位。 */
  skillScriptDir?: string
  /** raw 文件指针 (web ingest 会补 assetId)。 */
  raw?: RawAssetRef[]
  /** parsed-data.json 落盘目录 (传给 loadProfileData 做中间产物缓存)。 */
  parseCacheDir?: string
}

/** detail.unity_profiler 的形状 (schemaless, 但 Provider 自产时类型化便于核对)。 */
export interface UnityProfilerDetail {
  frameSummary: PreprocessResult['frameSummary']
  callTrees: CallTree[]
  markers: PreprocessResult['markers']
  markerSpikes: PreprocessResult['markerSpikes']
  jankFrames: PreprocessResult['jankFrames']
  threadSummary: PreprocessResult['threads']
  frameTimings: number[]
}

export interface BuildUnityProfileResult {
  profile: PerfProfile
  /** 供 AI 消费的精简摘要 (不含全量 markers / 全树文本)。 */
  summary: Record<string, unknown>
  /** 底层 preprocess 结果 (供 build-profile 落 preprocess-result.json 做向后兼容)。 */
  preprocess: PreprocessResult
}

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------

/** 实体段命名: marker/线程名含 '.' 时改 '_' (metric-key-naming-spec §2)。 */
function sanitizeEntity(name: string): string {
  return name.replace(/\./g, '_')
}

function metric(key: string, value: number, unit: Metric['unit']): Metric {
  return { key, value: round(value), unit, source: SOURCE }
}

function round(n: number, digits = 3): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(((sorted.length - 1) * pct) / 100)
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

/** 某 marker 在全部帧上的"每帧总耗时" (sum msMarkerTotal / totalFrames)。 */
function markerMsPerFrame(data: ProfileData, exactNames: Set<string>, hits: Map<string, number>): void {
  for (const frame of data.frames) {
    if (!frame) continue
    for (const thread of frame.threads) {
      for (const m of thread.markers) {
        const name = data.markerNames[m.nameIndex] ?? ''
        if (exactNames.has(name)) hits.set(name, (hits.get(name) ?? 0) + m.msMarkerTotal)
      }
    }
  }
}

function countMarker(data: ProfileData, exactName: string): number {
  let c = 0
  for (const frame of data.frames) {
    if (!frame) continue
    for (const thread of frame.threads) {
      for (const m of thread.markers) {
        if ((data.markerNames[m.nameIndex] ?? '') === exactName) c++
      }
    }
  }
  return c
}

/** lib 调用树节点 → 统一 CallTreeNode (§1.5)。 */
function toUnifiedNode(n: LibCallTreeNode, msFrame: number): CallTreeNode {
  return {
    name: n.name,
    totalMs: round(n.msTotal, 2),
    selfMs: round(n.msSelf, 2),
    totalPct: round(n.percentOfFrame, 1),
    selfPct: msFrame > 0 ? round((n.msSelf / msFrame) * 100, 1) : undefined,
    // layer 是 simpleperf 概念; unity 业务名本身即语义, 不填。
    children: n.children.map(c => toUnifiedNode(c, msFrame)),
  }
}

/** 取某帧主线程调用树, 包成统一 CallTree (root = 该线程一帧)。 */
function frameCallTree(data: ProfileData, frameIndex: number, label: string): CallTree | null {
  const res = getFrameCallTree(data, frameIndex)
  if (!res) return null
  const children = res.tree.map(n => toUnifiedNode(n, res.msFrame))
  const childSelf = children.reduce((s, c) => s + (c.totalMs ?? 0), 0)
  const root: CallTreeNode = {
    name: res.threadName,
    totalMs: round(res.msFrame, 2),
    selfMs: round(Math.max(0, res.msFrame - childSelf), 2),
    totalPct: 100,
    children,
  }
  return { thread: res.threadName, label, root }
}

// ------------------------------------------------------------
// 主函数
// ------------------------------------------------------------

/** 关注的特殊 marker (有则产 marker.<name>.msPerFrame; 名字含 '.' 在 key 里改 '_')。 */
const SPECIAL_MARKERS = [
  'PlayerLoop',
  'BehaviourUpdate',
  'WaitForTargetFPS',
  'GC.Collect',
  'Gfx.WaitForPresent',
  'Camera.Render',
  'Render.Mesh',
  'Physics.Processing',
  'Physics.Simulate',
  'PhysicsManager.FixedUpdate',
]
const GC_ALLOC_MARKER = 'GC.Alloc'

export function buildUnityProfile(opts: BuildUnityProfileOptions): BuildUnityProfileResult {
  const skillScriptDir = opts.skillScriptDir ?? path.resolve(__dirname, '..')
  const config: Config = loadConfig(skillScriptDir)
  const targetFps = opts.targetFps ?? config.targetFps

  const data: ProfileData = opts.profileData
    ?? loadProfileData(path.resolve(opts.input ?? ''), opts.parseCacheDir ?? '')

  const pre = buildPreprocessResult(data, config, targetFps)
  const fsum = pre.frameSummary

  // 帧分布 (从原始 msFrame 列表精确算 p50/p95/p99/slowRate)。
  const frameMs = data.frames.filter(Boolean).map(f => f.msFrame)
  const sorted = [...frameMs].sort((a, b) => a - b)
  const totalFrames = frameMs.length
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)
  const p99 = percentile(sorted, 99)
  const maxMs = sorted.length ? sorted[sorted.length - 1] : 0
  const avgMs = totalFrames ? frameMs.reduce((a, b) => a + b, 0) / totalFrames : 0
  const fps = avgMs > 0 ? 1000 / avgMs : 0
  // rate 一律按百分比 (0-100) 表达, 对齐 unit '%' (metric-key-naming-spec §3)。
  const slowRate33 = totalFrames ? (frameMs.filter(ms => ms > 33).length / totalFrames) * 100 : 0
  const slowRate50 = totalFrames ? (frameMs.filter(ms => ms > 50).length / totalFrames) * 100 : 0

  // ---- core.metrics (指标袋) ----
  const metrics: Metric[] = []

  // frame.*
  metrics.push(
    metric('frame.avgMs', avgMs, 'ms'),
    metric('frame.p50Ms', p50, 'ms'),
    metric('frame.p95Ms', p95, 'ms'),
    metric('frame.p99Ms', p99, 'ms'),
    metric('frame.maxMs', maxMs, 'ms'),
    metric('frame.fps', fps, 'fps'),
    metric('frame.slowRate33Ms', slowRate33, '%'),
    metric('frame.slowRate50Ms', slowRate50, '%'),
  )

  // marker.<name>.msPerFrame —— 特殊 marker + top markers by 每帧总耗时
  const specialSet = new Set(SPECIAL_MARKERS)
  const specialHits = new Map<string, number>()
  markerMsPerFrame(data, specialSet, specialHits)
  const emittedMarkerKeys = new Set<string>()
  for (const name of SPECIAL_MARKERS) {
    const total = specialHits.get(name)
    if (total == null) continue
    const key = `marker.${sanitizeEntity(name)}.msPerFrame`
    metrics.push(metric(key, total / totalFrames, 'ms'))
    emittedMarkerKeys.add(key)
  }
  // 再补 detail.markers 里最重的 top 15 (depth<=1) 进 core, 供趋势/列表。
  const topMarkers = pre.markers
    .filter(m => m.depth <= 1)
    .slice(0, 15)
  for (const m of topMarkers) {
    const key = `marker.${sanitizeEntity(m.name)}.msPerFrame`
    if (emittedMarkerKeys.has(key)) continue
    // markers[].msTotalMean 是 present 帧均; 折算到全帧均。
    const perFrame = totalFrames ? (m.msTotalMean * m.presentOnFrameCount) / totalFrames : 0
    metrics.push(metric(key, perFrame, 'ms'))
    emittedMarkerKeys.add(key)
  }

  // gc.*
  const gcAllocCount = countMarker(data, GC_ALLOC_MARKER)
  metrics.push(metric('gc.allocCount', totalFrames ? gcAllocCount / totalFrames : 0, 'count'))
  const gcCollect = specialHits.get('GC.Collect')
  if (gcCollect != null) metrics.push(metric('gc.collectMsPerFrame', gcCollect / totalFrames, 'ms'))

  // jank.* / spike.*
  const jankCount = fsum.jankCount
  const bigJankCount = fsum.bigJankCount
  metrics.push(
    metric('jank.count', jankCount, 'count'),
    metric('jank.bigCount', bigJankCount, 'count'),
    metric('jank.rate', totalFrames ? ((jankCount + bigJankCount) / totalFrames) * 100 : 0, '%'),
    metric('spike.count', pre.markerSpikes.length, 'count'),
  )

  // ---- core.frame ----
  const frame: FrameStat[] = [{
    source: SOURCE,
    frameDefinition: 'playerloop',
    p50Ms: round(p50, 2),
    p95Ms: round(p95, 2),
    p99Ms: round(p99, 2),
    fps: round(fps, 1),
    slowFrameRate: round(slowRate33, 2),
  }]

  // ---- 统一 callTrees (worst + median 帧, 主线程) ----
  const callTrees: CallTree[] = []
  const worst = frameCallTree(data, fsum.worstFrameIndex, `worstFrame#${fsum.worstFrameIndex}`)
  if (worst) callTrees.push(worst)
  if (fsum.medianFrameIndex !== fsum.worstFrameIndex) {
    const median = frameCallTree(data, fsum.medianFrameIndex, `medianFrame#${fsum.medianFrameIndex}`)
    if (median) callTrees.push(median)
  }

  // ---- detail.unity_profiler ----
  const detail: UnityProfilerDetail = {
    frameSummary: fsum,
    callTrees,
    markers: pre.markers,
    markerSpikes: pre.markerSpikes,
    jankFrames: pre.jankFrames,
    threadSummary: pre.threads,
    frameTimings: pre.frameTimings,
  }

  // ---- confidence ----
  const notes: string[] = []
  if (totalFrames < 300) {
    notes.push(`帧数 ${totalFrames} < 300, P95/P99 统计稳定性偏低 (data-sources-guide §3.3)。`)
  }

  const profile: PerfProfile = {
    raw: opts.raw ?? (opts.input
      ? [{ source: SOURCE, role: 'unity_profiler_data', localPath: path.resolve(opts.input), fileName: path.basename(opts.input) }]
      : []),
    core: {
      schemaVersion: PERF_PROFILE_SCHEMA_VERSION,
      metrics,
      frame,
      threads: [], // unity 不产调度态线程 (那是 perfetto); 线程负载在 detail.threadSummary
      system: {},
      confidence: { perFrameAlignmentOk: true, notes },
    },
    detail: { [SOURCE]: detail },
  }

  // ---- 精简摘要 (AI 读这个, 不读全量 detail) ----
  const summary = buildSummary(profile, detail, targetFps)

  return { profile, summary, preprocess: pre }
}

/** 剪枝调用树供 AI 摘要消费 (全量树留在 unity-profile.json)。保留 totalPct >= minPct 且 depth <= maxDepth 的节点。 */
function pruneTree(node: CallTreeNode, minPct: number, maxDepth: number, depth = 0): CallTreeNode {
  const children = depth >= maxDepth
    ? []
    : node.children
        .filter(c => (c.totalPct ?? 0) >= minPct)
        .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
        .map(c => pruneTree(c, minPct, maxDepth, depth + 1))
  return { ...node, children }
}

/** 给 AI 的小摘要: core 全量 + detail 的 top 切片 (≈ 旧 preprocess-summary, ~15-30KB)。 */
function buildSummary(profile: PerfProfile, detail: UnityProfilerDetail, targetFps: number): Record<string, unknown> {
  const top20 = detail.markers.slice(0, 20)
  const mustReport = detail.markers.filter(m => m.mustReport)
  const top20Names = new Set(top20.map(m => m.name))
  const summaryMarkers = [...top20, ...mustReport.filter(m => !top20Names.has(m.name))]
  return {
    source: 'unity_profiler',
    schemaVersion: profile.core.schemaVersion,
    config: { targetFps },
    metrics: profile.core.metrics,
    frame: profile.core.frame,
    confidence: profile.core.confidence,
    frameSummary: detail.frameSummary,
    markers: summaryMarkers,
    markerSpikes: detail.markerSpikes.slice(0, 20),
    jankFrames: detail.jankFrames.map(j => ({
      frameIndex: j.frameIndex, msFrame: j.msFrame, ratio: j.ratio, jankLevel: j.jankLevel,
      category: j.category, dominantMarker: j.dominantMarker, hotPath: j.hotPath,
      mustReport: j.mustReport, mustReportReason: j.mustReportReason,
    })),
    // 剪枝树 (totalPct>=2% & depth<=8); 全量结构树在 unity-profile.json 的 detail.unity_profiler.callTrees。
    callTrees: detail.callTrees.map(t => ({ thread: t.thread, label: t.label, root: pruneTree(t.root, 2, 8) })),
    threadSummary: detail.threadSummary,
    _meta: {
      note: '单源 unity_profiler PerfProfile 摘要。全量 markers / 全量结构 callTrees 在 unity-profile.json 的 detail.unity_profiler。callTrees 此处已按 totalPct>=2% 剪枝。',
      totalMarkerCount: detail.markers.length,
      totalSpikeCount: detail.markerSpikes.length,
    },
  }
}
