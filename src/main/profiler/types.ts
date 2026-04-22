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
