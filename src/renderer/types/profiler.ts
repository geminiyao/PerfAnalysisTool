/**
 * Renderer-side Profiler analysis result types.
 * These mirror the main process types but are used in the UI layer.
 */

export interface FrameTimePoint {
  frameIndex: number
  ms: number
  count: number
}

export interface MarkerDataView {
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
  buckets: number[]
  countBuckets: number[]
  frames: FrameTimePoint[]
}

export interface ThreadDataView {
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
}

export interface FrameSummaryView {
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
  buckets: number[]
}

export interface ProfileAnalysisData {
  frameSummary: FrameSummaryView
  markers: MarkerDataView[]
  threads: ThreadDataView[]
  frameTimeline: { frameIndex: number; ms: number }[]
  threadNames: string[]
  markerNames: string[]
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}
