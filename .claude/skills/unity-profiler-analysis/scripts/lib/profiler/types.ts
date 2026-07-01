/**
 * Main process Profiler data types
 * Mirrors Unity Profile Analyzer C# data structures
 */

// ============ Raw parsed data from .pdata ============

export interface ProfileMarker {
  nameIndex: number
  msMarkerTotal: number
  depth: number
  msChildren: number // calculated after load
}

export interface ProfileThread {
  threadIndex: number
  markers: ProfileMarker[]
}

export interface ProfileFrame {
  msStartTime: number // ms
  msFrame: number // ms, total frame time
  threads: ProfileThread[]
}

export interface ProfileData {
  version: number
  frameIndexOffset: number
  frames: ProfileFrame[]
  markerNames: string[]
  threadNames: string[]
  filePath: string
  /** Render/Memory 计数器，从 sidecar `<basename>.counters.json` 加载；缺失则 undefined */
  counters?: CountersSidecar
}

// ============ Render / Memory counters (sidecar) ============

/** 与 sidecar JSON 中 `counters` 字段顺序一致的固定字段名集合。
 *  改顺序需要同步改 schemaVersion 和 C# 导出器。 */
export const COUNTER_FIELDS = [
  'drawCalls',
  'batches',
  'setPassCalls',
  'triangles',
  'vertices',
  'usedTexturesBytes',
  'usedTexturesCount',
  'totalReservedMemory',
  'totalUsedMemory',
  'gcAllocatedInFrame',
  'gcReservedMemory',
  'systemUsedMemory',
  // Unity 2019.4 Memory area 额外字段（2020+ 上 sidecar 也会保留 null）
  'particleMemory',
  'meshMemory',
  'materialCount',
  'objectCount'
] as const
export type CounterField = typeof COUNTER_FIELDS[number]

export interface FrameCounters {
  frameIndex: number
  drawCalls: number | null
  batches: number | null
  setPassCalls: number | null
  triangles: number | null
  vertices: number | null
  usedTexturesBytes: number | null
  usedTexturesCount: number | null
  totalReservedMemory: number | null
  totalUsedMemory: number | null
  gcAllocatedInFrame: number | null
  gcReservedMemory: number | null
  systemUsedMemory: number | null
  particleMemory: number | null
  meshMemory: number | null
  materialCount: number | null
  objectCount: number | null
}

export interface CountersSidecar {
  schemaVersion: number
  frameIndexOffset: number
  frameCount: number
  frames: FrameCounters[]
}

// ============ Rendering / Memory aggregated summaries ============

export interface CounterStats {
  mean: number
  median: number
  max: number
  p95: number
  /** 取得 max 时的绝对帧号；0 表示无数据 */
  maxFrameIndex: number
}

export interface MemoryGrowthStats {
  mean: number
  max: number
  /** bytes/sec — 用首尾帧线性回归，>0 提示内存持续上涨 */
  growthRate: number
}

export interface GCAllocStats {
  mean: number
  median: number
  max: number
  p95: number
  /** 真实发生 GC.Alloc 的帧数（>0 byte） */
  allocFrames: number
}

export interface RenderingSummary {
  drawCalls: CounterStats
  batches: CounterStats
  setPassCalls: CounterStats
  triangles: { mean: number; median: number; max: number }
  vertices: { mean: number; median: number; max: number }
  usedTexturesBytes: { mean: number; max: number }
  usedTexturesCount: { mean: number; max: number }
  /** 抽样的 per-frame 序列（worst + median + 等距抽样，<= 50 帧） */
  perFrame: { frameIndex: number; drawCalls: number; batches: number }[]
}

export interface MemorySummary {
  totalReservedMemory: MemoryGrowthStats
  totalUsedMemory: MemoryGrowthStats
  gcAllocatedInFrame: GCAllocStats
  gcReservedMemory: { mean: number; max: number }
  systemUsedMemory: { mean: number; max: number }
  /** Unity 2019.4 Memory area 额外字段；缺测时各 stats 字段为 0 */
  particleMemory?: { mean: number; max: number }
  meshMemory?: { mean: number; max: number }
  materialCount?: { mean: number; max: number }
  objectCount?: { mean: number; max: number }
  perFrame: { frameIndex: number; gcAllocatedInFrame: number; totalUsedMemory: number }[]
}

// ============ Analysis result types ============

export interface FrameTime {
  frameIndex: number
  ms: number
  count: number
}

export interface MarkerDataResult {
  name: string
  msTotal: number
  count: number
  countMin: number
  countMax: number
  countMean: number
  countMedian: number
  countLowerQuartile: number
  countUpperQuartile: number
  presentOnFrameCount: number
  firstFrameIndex: number
  lastFrame: number
  msMean: number
  msMedian: number
  msLowerQuartile: number
  msUpperQuartile: number
  msMin: number
  msMax: number
  msMinIndividual: number
  msMaxIndividual: number
  minIndividualFrameIndex: number
  maxIndividualFrameIndex: number
  msAtMedian: number
  medianFrameIndex: number
  minFrameIndex: number
  maxFrameIndex: number
  minDepth: number
  maxDepth: number
  threads: string[]
  buckets: number[] // 20 buckets
  countBuckets: number[] // 20 buckets
  frames: FrameTime[]
}

export interface ThreadFrameTime {
  frameIndex: number
  ms: number
  msIdle: number
}

export interface ThreadDataResult {
  threadNameWithIndex: string
  threadGroupIndex: number
  threadGroupName: string
  threadsInGroup: number
  msMedian: number
  msLowerQuartile: number
  msUpperQuartile: number
  msMin: number
  msMax: number
  medianFrameIndex: number
  minFrameIndex: number
  maxFrameIndex: number
  frames: ThreadFrameTime[]
}

export interface FrameSummary {
  msTotal: number
  first: number
  last: number
  count: number
  msMean: number
  msMedian: number
  msLowerQuartile: number
  msUpperQuartile: number
  msMin: number
  msMax: number
  medianFrameIndex: number
  minFrameIndex: number
  maxFrameIndex: number
  maxMarkerDepth: number
  totalMarkers: number
  markerCountMax: number
  markerCountMaxMean: number
  buckets: number[] // 20 buckets
  frames: FrameTime[]
}

export interface ProfileAnalysisResult {
  frameSummary: FrameSummary
  markers: MarkerDataResult[]
  /** Phase X.1: 每线程独立的 markers 列表（key = threadNameWithIndex）；与 markers 字段是双写关系，跨线程聚合不变 */
  markersByThread?: Record<string, MarkerDataResult[]>
  threads: ThreadDataResult[]
  frameTimeline: { frameIndex: number; ms: number }[]
  threadNames: string[]
  markerNames: string[]
}

// ============ Analysis options ============

export interface AnalyzeOptions {
  selectionIndices?: number[] // frame indices to analyze; null = all
  frameRange?: [number, number] // [startFrame, endFrame] inclusive; overrides selectionIndices if set
  threadFilters?: string[] // thread names to include; null = all
  depthFilter?: number // -1 = all depths
  selfTimes?: boolean // subtract child marker times
  parentMarker?: string | null
  timeScaleMax?: number
}

export const DEPTH_ALL = -1
export const BUCKET_COUNT = 20
