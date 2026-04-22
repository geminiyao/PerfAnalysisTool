/**
 * ProfileAnalyzer - statistical analysis engine.
 * Port of ProfileAnalyzer.cs Analyze() from Unity Profile Analyzer.
 */
import {
  ProfileData,
  ProfileFrame,
  ProfileMarker,
  AnalyzeOptions,
  ProfileAnalysisResult,
  FrameSummary,
  FrameTime,
  MarkerDataResult,
  ThreadDataResult,
  ThreadFrameTime,
  DEPTH_ALL,
  BUCKET_COUNT
} from './types'
import { offsetToDisplayFrame, displayFrameToOffset } from './pdata-parser'

// ============ Internal working structures ============

interface MarkerWork {
  name: string
  msTotal: number
  count: number
  lastFrame: number
  presentOnFrameCount: number
  firstFrameIndex: number
  msMean: number
  msMedian: number
  msLowerQuartile: number
  msUpperQuartile: number
  msMin: number
  msMax: number
  minFrameIndex: number
  maxFrameIndex: number
  msMinIndividual: number
  msMaxIndividual: number
  minIndividualFrameIndex: number
  maxIndividualFrameIndex: number
  msAtMedian: number
  medianFrameIndex: number
  minDepth: number
  maxDepth: number
  countMin: number
  countMax: number
  countMean: number
  countMedian: number
  countLowerQuartile: number
  countUpperQuartile: number
  threads: string[]
  frames: FrameTime[]
  buckets: number[]
  countBuckets: number[]
}

function createMarkerWork(name: string): MarkerWork {
  return {
    name,
    msTotal: 0,
    count: 0,
    lastFrame: -1,
    presentOnFrameCount: 0,
    firstFrameIndex: -1,
    msMean: 0,
    msMedian: 0,
    msLowerQuartile: 0,
    msUpperQuartile: 0,
    msMin: Number.MAX_VALUE,
    msMax: -Number.MAX_VALUE,
    minFrameIndex: 0,
    maxFrameIndex: 0,
    msMinIndividual: Number.MAX_VALUE,
    msMaxIndividual: -Number.MAX_VALUE,
    minIndividualFrameIndex: 0,
    maxIndividualFrameIndex: 0,
    msAtMedian: 0,
    medianFrameIndex: 0,
    minDepth: 0,
    maxDepth: 0,
    countMin: Number.MAX_SAFE_INTEGER,
    countMax: -Number.MAX_SAFE_INTEGER,
    countMean: 0,
    countMedian: 0,
    countLowerQuartile: 0,
    countUpperQuartile: 0,
    threads: [],
    frames: [],
    buckets: new Array(BUCKET_COUNT).fill(0),
    countBuckets: new Array(BUCKET_COUNT).fill(0)
  }
}

function getPercentageOffset(frames: FrameTime[], percent: number): FrameTime {
  const index = Math.floor(((frames.length - 1) * percent) / 100)
  return frames[Math.max(0, Math.min(index, frames.length - 1))]
}

function computeBuckets(frames: FrameTime[], min: number, max: number): number[] {
  const buckets = new Array(BUCKET_COUNT).fill(0)
  const range = max - min
  const maxIdx = BUCKET_COUNT - 1
  const scale = range > 0 ? BUCKET_COUNT / range : 0

  for (const ft of frames) {
    let idx = Math.floor((ft.ms - min) * scale)
    if (idx < 0) idx = 0
    if (idx > maxIdx) idx = maxIdx
    buckets[idx]++
  }

  if (range === 0) {
    for (let i = 1; i < BUCKET_COUNT; i++) {
      buckets[i] = buckets[0]
    }
  }
  return buckets
}

function computeCountBuckets(frames: FrameTime[], min: number, max: number): number[] {
  const buckets = new Array(BUCKET_COUNT).fill(0)
  const range = max - min
  const maxIdx = BUCKET_COUNT - 1
  const scale = range > 0 ? BUCKET_COUNT / range : 0

  for (const ft of frames) {
    let idx = Math.floor((ft.count - min) * scale)
    if (idx < 0) idx = 0
    if (idx > maxIdx) idx = maxIdx
    buckets[idx]++
  }

  if (range === 0) {
    for (let i = 1; i < BUCKET_COUNT; i++) {
      buckets[i] = buckets[0]
    }
  }
  return buckets
}

function matchThreadFilter(threadName: string, filters: string[] | null): boolean {
  if (!filters || filters.length === 0) return false
  return filters.includes(threadName)
}

/**
 * Run statistical analysis on parsed ProfileData.
 */
export function analyzeProfileData(
  profileData: ProfileData,
  options: AnalyzeOptions = {}
): ProfileAnalysisResult | null {
  if (!profileData || profileData.frames.length === 0) return null

  const {
    depthFilter = DEPTH_ALL,
    selfTimes = false,
    parentMarker = null,
    timeScaleMax: inputTimeScaleMax = 0
  } = options

  // Build selection indices (default: all frames)
  // frameRange takes priority over selectionIndices
  let selectionIndices: number[]
  if (options.frameRange) {
    const [start, end] = options.frameRange
    selectionIndices = []
    for (let i = start; i <= end; i++) {
      selectionIndices.push(i)
    }
  } else if (options.selectionIndices) {
    selectionIndices = options.selectionIndices
  } else {
    selectionIndices = profileData.frames.map((_, i) => offsetToDisplayFrame(profileData, i))
  }

  // Build thread filters (default: all threads)
  const threadFilters: string[] | null = options.threadFilters
    ? options.threadFilters
    : profileData.threadNames.slice()

  if (selectionIndices.length === 0) return null

  const processMarkers = threadFilters !== null

  // Frame summary
  const frameSummary: FrameSummary = {
    msTotal: 0,
    first: selectionIndices[0],
    last: selectionIndices[selectionIndices.length - 1],
    count: 0,
    msMean: 0,
    msMedian: 0,
    msLowerQuartile: 0,
    msUpperQuartile: 0,
    msMin: Number.MAX_VALUE,
    msMax: 0,
    medianFrameIndex: selectionIndices[0],
    minFrameIndex: selectionIndices[0],
    maxFrameIndex: selectionIndices[0],
    maxMarkerDepth: 0,
    totalMarkers: 0,
    markerCountMax: 0,
    markerCountMaxMean: 0,
    buckets: new Array(BUCKET_COUNT).fill(0),
    frames: []
  }

  const threadMap = new Map<string, ThreadDataResult>()
  const markerMap = new Map<string, MarkerWork>()
  const allMarkerNames = new Set<string>()
  let maxMarkerDepthFound = 0

  // Parent marker filtering
  let filteringByParent = false
  let parentMarkerIndex = -1
  if (parentMarker) {
    parentMarkerIndex = profileData.markerNames.indexOf(parentMarker)
    filteringByParent = true
  }

  const frameTimeline: { frameIndex: number; ms: number }[] = []

  for (const frameIndex of selectionIndices) {
    const frameOffset = displayFrameToOffset(profileData, frameIndex)
    const frameData = profileData.frames[frameOffset]
    if (!frameData) continue

    const msFrame = frameData.msFrame

    // Update frame summary
    frameSummary.msTotal += msFrame
    frameSummary.count++
    if (msFrame < frameSummary.msMin) {
      frameSummary.msMin = msFrame
      frameSummary.minFrameIndex = frameIndex
    }
    if (msFrame > frameSummary.msMax) {
      frameSummary.msMax = msFrame
      frameSummary.maxFrameIndex = frameIndex
    }
    frameSummary.frames.push({ frameIndex, ms: msFrame, count: 1 })
    frameTimeline.push({ frameIndex, ms: msFrame })

    if (!processMarkers) continue

    for (let ti = 0; ti < frameData.threads.length; ti++) {
      const threadData = frameData.threads[ti]
      const threadNameWithIndex = profileData.threadNames[threadData.threadIndex] || `${threadData.threadIndex}:[Unknown]`

      let threadResult = threadMap.get(threadNameWithIndex)
      if (!threadResult) {
        const info = threadNameWithIndex.split(':')
        threadResult = {
          threadNameWithIndex,
          threadGroupIndex: parseInt(info[0], 10) || 0,
          threadGroupName: info[1] || '',
          threadsInGroup: 1,
          msMedian: 0,
          msLowerQuartile: 0,
          msUpperQuartile: 0,
          msMin: 0,
          msMax: 0,
          medianFrameIndex: -1,
          minFrameIndex: -1,
          maxFrameIndex: -1,
          frames: []
        }
        threadMap.set(threadNameWithIndex, threadResult)
      }

      const include = matchThreadFilter(threadNameWithIndex, threadFilters)

      let parentMarkerDepth = -1
      let msTimeOfMinDepth = 0
      let msIdleOfMinDepth = 0

      for (const markerData of threadData.markers) {
        const markerName = profileData.markerNames[markerData.nameIndex] || 'Unknown'
        allMarkerNames.add(markerName)

        const ms = markerData.msMarkerTotal - (selfTimes ? markerData.msChildren : 0)
        const markerDepth = markerData.depth

        if (markerDepth > maxMarkerDepthFound) maxMarkerDepthFound = markerDepth

        if (markerDepth === 1) {
          if (markerName === 'Idle') msIdleOfMinDepth += ms
          else msTimeOfMinDepth += ms
        }

        if (!include) continue
        if (depthFilter !== DEPTH_ALL && markerDepth !== depthFilter) continue

        // Parent marker filtering
        if (filteringByParent) {
          if (markerData.nameIndex === parentMarkerIndex) {
            if (parentMarkerDepth < 0) parentMarkerDepth = markerData.depth
          } else {
            if (markerData.depth <= parentMarkerDepth) parentMarkerDepth = -1
          }
          if (parentMarkerDepth < 0) continue
        }

        let marker = markerMap.get(markerName)
        if (!marker) {
          marker = createMarkerWork(markerName)
          marker.firstFrameIndex = frameIndex
          marker.minDepth = markerDepth
          marker.maxDepth = markerDepth
          marker.threads.push(threadNameWithIndex)
          markerMap.set(markerName, marker)
        } else {
          if (!marker.threads.includes(threadNameWithIndex)) {
            marker.threads.push(threadNameWithIndex)
          }
        }

        marker.count++
        marker.msTotal += ms

        if (ms < marker.msMinIndividual) {
          marker.msMinIndividual = ms
          marker.minIndividualFrameIndex = frameIndex
        }
        if (ms > marker.msMaxIndividual) {
          marker.msMaxIndividual = ms
          marker.maxIndividualFrameIndex = frameIndex
        }
        if (markerDepth < marker.minDepth) marker.minDepth = markerDepth
        if (markerDepth > marker.maxDepth) marker.maxDepth = markerDepth

        if (frameIndex !== marker.lastFrame) {
          marker.presentOnFrameCount++
          marker.frames.push({ frameIndex, ms, count: 1 })
          marker.lastFrame = frameIndex
        } else {
          const last = marker.frames[marker.frames.length - 1]
          marker.frames[marker.frames.length - 1] = {
            frameIndex: last.frameIndex,
            ms: last.ms + ms,
            count: last.count + 1
          }
        }
      }

      if (include) {
        threadResult.frames.push({ frameIndex, ms: msTimeOfMinDepth, msIdle: msIdleOfMinDepth })
      }
    }
  }

  // Finalize frame summary
  finalizeFrameSummary(frameSummary, inputTimeScaleMax, maxMarkerDepthFound, allMarkerNames.size)

  // Finalize markers
  const markers = finalizeMarkers(Array.from(markerMap.values()), frameSummary)

  // Finalize threads
  const threads = finalizeThreads(Array.from(threadMap.values()))

  return {
    frameSummary,
    markers,
    threads,
    frameTimeline,
    threadNames: profileData.threadNames,
    markerNames: profileData.markerNames
  }
}

function finalizeFrameSummary(
  fs: FrameSummary,
  timeScaleMax: number,
  maxMarkerDepth: number,
  totalMarkers: number
): void {
  if (fs.frames.length > 0) {
    fs.frames.sort((a, b) => a.ms - b.ms || a.frameIndex - b.frameIndex)
    fs.msMean = fs.msTotal / fs.count
    fs.msMedian = getPercentageOffset(fs.frames, 50).ms
    fs.medianFrameIndex = getPercentageOffset(fs.frames, 50).frameIndex
    fs.msLowerQuartile = getPercentageOffset(fs.frames, 25).ms
    fs.msUpperQuartile = getPercentageOffset(fs.frames, 75).ms
  } else {
    fs.msMean = 0
    fs.msMedian = 0
    fs.msLowerQuartile = 0
    fs.msUpperQuartile = 0
    if (fs.msMin === Number.MAX_VALUE) fs.msMin = 0
  }

  fs.maxMarkerDepth = maxMarkerDepth
  fs.totalMarkers = totalMarkers

  let tsMax = timeScaleMax
  if (tsMax <= 0) tsMax = fs.msMax
  else if (tsMax < fs.msMax) tsMax = fs.msMax

  // Compute frame buckets
  const range = tsMax
  const maxIdx = BUCKET_COUNT - 1
  const scale = range > 0 ? BUCKET_COUNT / range : 0

  fs.buckets = new Array(BUCKET_COUNT).fill(0)
  for (const ft of fs.frames) {
    let idx = Math.floor(ft.ms * scale)
    if (idx < 0) idx = 0
    if (idx > maxIdx) idx = maxIdx
    fs.buckets[idx]++
  }
}

function finalizeMarkers(markersWork: MarkerWork[], frameSummary: FrameSummary): MarkerDataResult[] {
  let countMax = 0
  let countMaxMean = 0

  for (const m of markersWork) {
    m.msAtMedian = 0
    m.msMin = Number.MAX_VALUE
    m.msMax = -Number.MAX_VALUE
    m.countMin = Number.MAX_SAFE_INTEGER
    m.countMax = -Number.MAX_SAFE_INTEGER

    for (const ft of m.frames) {
      if (ft.ms < m.msMin) {
        m.msMin = ft.ms
        m.minFrameIndex = ft.frameIndex
      }
      if (ft.ms > m.msMax) {
        m.msMax = ft.ms
        m.maxFrameIndex = ft.frameIndex
      }
      if (ft.frameIndex === frameSummary.medianFrameIndex) {
        m.msAtMedian = ft.ms
      }
      if (ft.count < m.countMin) m.countMin = ft.count
      if (ft.count > m.countMax) m.countMax = ft.count
    }

    m.msMean = m.presentOnFrameCount > 0 ? m.msTotal / m.presentOnFrameCount : 0

    // Count statistics
    m.frames.sort((a, b) => a.count - b.count || a.frameIndex - b.frameIndex)
    m.countMedian = getPercentageOffset(m.frames, 50).count
    m.countLowerQuartile = getPercentageOffset(m.frames, 25).count
    m.countUpperQuartile = getPercentageOffset(m.frames, 75).count
    m.countMean = m.presentOnFrameCount > 0 ? m.count / m.presentOnFrameCount : 0

    // MS statistics (re-sort by ms)
    m.frames.sort((a, b) => a.ms - b.ms || a.frameIndex - b.frameIndex)
    m.msMedian = getPercentageOffset(m.frames, 50).ms
    m.medianFrameIndex = getPercentageOffset(m.frames, 50).frameIndex
    m.msLowerQuartile = getPercentageOffset(m.frames, 25).ms
    m.msUpperQuartile = getPercentageOffset(m.frames, 75).ms

    if (m.countMax > countMax) countMax = m.countMax
    if (m.countMean > countMaxMean) countMaxMean = m.countMean

    // Compute buckets
    m.buckets = computeBuckets(m.frames, m.msMin, m.msMax)
    m.countBuckets = computeCountBuckets(m.frames, m.countMin, m.countMax)
  }

  frameSummary.markerCountMax = countMax
  frameSummary.markerCountMaxMean = countMaxMean

  // Sort by msAtMedian descending
  markersWork.sort((a, b) => {
    if (a.msAtMedian === b.msAtMedian) return -(a.medianFrameIndex - b.medianFrameIndex)
    return -(a.msAtMedian - b.msAtMedian)
  })

  return markersWork.map(m => ({
    name: m.name,
    msTotal: m.msTotal,
    count: m.count,
    countMin: m.countMin === Number.MAX_SAFE_INTEGER ? 0 : m.countMin,
    countMax: m.countMax === -Number.MAX_SAFE_INTEGER ? 0 : m.countMax,
    countMean: m.countMean,
    countMedian: m.countMedian,
    countLowerQuartile: m.countLowerQuartile,
    countUpperQuartile: m.countUpperQuartile,
    presentOnFrameCount: m.presentOnFrameCount,
    firstFrameIndex: m.firstFrameIndex,
    lastFrame: m.lastFrame,
    msMean: m.msMean,
    msMedian: m.msMedian,
    msLowerQuartile: m.msLowerQuartile,
    msUpperQuartile: m.msUpperQuartile,
    msMin: m.msMin === Number.MAX_VALUE ? 0 : m.msMin,
    msMax: m.msMax === -Number.MAX_VALUE ? 0 : m.msMax,
    msMinIndividual: m.msMinIndividual === Number.MAX_VALUE ? 0 : m.msMinIndividual,
    msMaxIndividual: m.msMaxIndividual === -Number.MAX_VALUE ? 0 : m.msMaxIndividual,
    minIndividualFrameIndex: m.minIndividualFrameIndex,
    maxIndividualFrameIndex: m.maxIndividualFrameIndex,
    msAtMedian: m.msAtMedian,
    medianFrameIndex: m.medianFrameIndex,
    minFrameIndex: m.minFrameIndex,
    maxFrameIndex: m.maxFrameIndex,
    minDepth: m.minDepth,
    maxDepth: m.maxDepth,
    threads: m.threads,
    buckets: m.buckets,
    countBuckets: m.countBuckets,
    frames: m.frames
  }))
}

function finalizeThreads(threadsWork: ThreadDataResult[]): ThreadDataResult[] {
  for (const t of threadsWork) {
    if (t.frames.length > 0) {
      const sorted = [...t.frames].sort((a, b) => a.ms - b.ms)
      const getAt = (pct: number) => {
        const idx = Math.floor(((sorted.length - 1) * pct) / 100)
        return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
      }
      t.msMin = getAt(0).ms
      t.minFrameIndex = getAt(0).frameIndex
      t.msLowerQuartile = getAt(25).ms
      t.msMedian = getAt(50).ms
      t.medianFrameIndex = getAt(50).frameIndex
      t.msUpperQuartile = getAt(75).ms
      t.msMax = getAt(100).ms
      t.maxFrameIndex = getAt(100).frameIndex

      // Restore frame order
      t.frames.sort((a, b) => a.frameIndex - b.frameIndex)
    }
  }
  return threadsWork
}
