/**
 * Standalone Unity Profiler .pdata analysis script (pure Node.js, no TS compilation needed).
 * Pipeline: parse → analyze → spike detect → call tree → build report
 */

'use strict'

const fs = require('fs')
const path = require('path')

// ─── BinaryReader ────────────────────────────────────────────────────────────

class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer
    this.offset = 0
  }
  get position() { return this.offset }
  set position(v) { this.offset = v }
  get length() { return this.buffer.length }
  get remaining() { return this.buffer.length - this.offset }

  readInt32() {
    if (this.offset + 4 > this.buffer.length)
      throw new RangeError(`readInt32 at ${this.offset} exceeds buffer`)
    const v = this.buffer.readInt32LE(this.offset)
    this.offset += 4
    return v
  }
  readFloat() {
    if (this.offset + 4 > this.buffer.length)
      throw new RangeError(`readFloat at ${this.offset} exceeds buffer`)
    const v = this.buffer.readFloatLE(this.offset)
    this.offset += 4
    return v
  }
  readDouble() {
    if (this.offset + 8 > this.buffer.length)
      throw new RangeError(`readDouble at ${this.offset} exceeds buffer`)
    const v = this.buffer.readDoubleLE(this.offset)
    this.offset += 8
    return v
  }
  readString() {
    const len = this._read7bit()
    if (this.offset + len > this.buffer.length)
      throw new RangeError(`readString(len=${len}) at ${this.offset} exceeds buffer`)
    const v = this.buffer.toString('utf8', this.offset, this.offset + len)
    this.offset += len
    return v
  }
  _read7bit() {
    let result = 0, shift = 0, byte
    do {
      if (this.offset >= this.buffer.length)
        throw new RangeError('read7bit unexpected end')
      byte = this.buffer[this.offset++]
      result |= (byte & 0x7f) << shift
      shift += 7
    } while (byte & 0x80)
    return result
  }
}

// ─── .pdata parser ───────────────────────────────────────────────────────────

const LATEST_VERSION = 7

function correctThreadName(name) {
  const info = name.split(':')
  if (info.length >= 2) {
    const idx = info[0]
    const tname = info[1]
    if (tname.trim() === '') return `${idx}:[Unknown]`
    const m = /^(.*[^\s])\s+([\d]+)$/.exec(tname)
    if (m) return `${1 + parseInt(m[2], 10)}:${m[1]}`
  }
  return name.trim()
}

function readMarker(reader, ver) {
  const nameIndex = reader.readInt32()
  const msMarkerTotal = reader.readFloat()
  const depth = reader.readInt32()
  let msChildren = 0
  if (ver === 3) msChildren = reader.readFloat()
  return { nameIndex, msMarkerTotal, depth, msChildren }
}

function readThread(reader, ver) {
  const threadIndex = reader.readInt32()
  const markerCount = reader.readInt32()
  const markers = []
  for (let m = 0; m < markerCount; m++) markers.push(readMarker(reader, ver))
  return { threadIndex, markers }
}

function readFrame(reader, ver) {
  let msStartTime = 0
  if (ver > 1) {
    if (ver >= 6) msStartTime = reader.readDouble()
    else msStartTime = reader.readDouble() * 1000.0
  }
  const msFrame = reader.readFloat()
  const threadCount = reader.readInt32()
  const threads = []
  for (let t = 0; t < threadCount; t++) threads.push(readThread(reader, ver))
  return { msStartTime, msFrame, threads }
}

function calcChildTimes(data) {
  for (const frame of data.frames) {
    if (!frame) continue
    for (const thread of frame.threads) {
      for (const m of thread.markers) m.msChildren = 0
      const stack = []
      for (const marker of thread.markers) {
        const depth = marker.depth
        if (depth >= stack.length) {
          if (depth === stack.length) popRecord(stack)
        } else {
          while (stack.length >= depth) popRecord(stack)
        }
        stack.push(marker)
      }
    }
  }
}

function popRecord(stack) {
  if (stack.length === 0) return null
  const child = stack.pop()
  if (stack.length > 0) stack[stack.length - 1].msChildren += child.msMarkerTotal
  return child
}

function parsePdata(filePath) {
  const buf = fs.readFileSync(filePath)
  const reader = new BinaryReader(buf)

  const version = reader.readInt32()
  if (version < 0 || version > LATEST_VERSION)
    throw new Error(`Unsupported .pdata version: ${version}`)

  const frameIndexOffset = reader.readInt32()
  const frameCount = reader.readInt32()
  const frames = []
  for (let f = 0; f < frameCount; f++) frames.push(readFrame(reader, version))

  const markerNameCount = reader.readInt32()
  const markerNames = []
  for (let m = 0; m < markerNameCount; m++) markerNames.push(reader.readString())

  const threadNameCount = reader.readInt32()
  const threadNames = []
  for (let t = 0; t < threadNameCount; t++) threadNames.push(correctThreadName(reader.readString()))

  const data = { version, frameIndexOffset, frames, markerNames, threadNames, filePath }
  calcChildTimes(data)
  return data
}

// ─── Profile Analyzer ────────────────────────────────────────────────────────

const BUCKET_COUNT = 20
const DEPTH_ALL = -1

function getAt(sorted, pct) {
  const idx = Math.floor(((sorted.length - 1) * pct) / 100)
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

function analyzeProfileData(data, options = {}) {
  if (!data || data.frames.length === 0) return null

  const { depthFilter = DEPTH_ALL, selfTimes = false } = options
  const frameIndexOffset = data.frameIndexOffset

  // Build selection indices
  const selectionIndices = options.selectionIndices
    || data.frames.map((_, i) => i + 1 + frameIndexOffset)

  const threadFilters = options.threadFilters || data.threadNames.slice()

  if (selectionIndices.length === 0) return null

  const frameSummary = {
    msTotal: 0, first: selectionIndices[0], last: selectionIndices[selectionIndices.length - 1],
    count: 0, msMean: 0, msMedian: 0, msLowerQuartile: 0, msUpperQuartile: 0,
    msMin: Number.MAX_VALUE, msMax: 0,
    medianFrameIndex: selectionIndices[0], minFrameIndex: selectionIndices[0], maxFrameIndex: selectionIndices[0],
    maxMarkerDepth: 0, totalMarkers: 0, markerCountMax: 0, markerCountMaxMean: 0,
    buckets: new Array(BUCKET_COUNT).fill(0), frames: []
  }

  const threadMap = new Map()
  const markerMap = new Map()
  const allMarkerNames = new Set()
  let maxDepthFound = 0
  const frameTimeline = []

  for (const frameIndex of selectionIndices) {
    const frameOffset = frameIndex - 1 - frameIndexOffset
    const frame = data.frames[frameOffset]
    if (!frame) continue

    const msFrame = frame.msFrame
    frameSummary.msTotal += msFrame
    frameSummary.count++
    if (msFrame < frameSummary.msMin) { frameSummary.msMin = msFrame; frameSummary.minFrameIndex = frameIndex }
    if (msFrame > frameSummary.msMax) { frameSummary.msMax = msFrame; frameSummary.maxFrameIndex = frameIndex }
    frameSummary.frames.push({ frameIndex, ms: msFrame, count: 1 })
    frameTimeline.push({ frameIndex, ms: msFrame })

    for (const thread of frame.threads) {
      const tname = data.threadNames[thread.threadIndex] || `${thread.threadIndex}:[Unknown]`
      let tr = threadMap.get(tname)
      if (!tr) {
        const info = tname.split(':')
        tr = {
          threadNameWithIndex: tname, threadGroupIndex: parseInt(info[0], 10) || 0,
          threadGroupName: info[1] || '', threadsInGroup: 1,
          msMedian: 0, msLowerQuartile: 0, msUpperQuartile: 0,
          msMin: 0, msMax: 0, medianFrameIndex: -1, minFrameIndex: -1, maxFrameIndex: -1, frames: []
        }
        threadMap.set(tname, tr)
      }

      const include = threadFilters.includes(tname)
      let msTime = 0, msIdle = 0

      for (const marker of thread.markers) {
        const mname = data.markerNames[marker.nameIndex] || 'Unknown'
        allMarkerNames.add(mname)
        const ms = marker.msMarkerTotal - (selfTimes ? marker.msChildren : 0)
        const dep = marker.depth
        if (dep > maxDepthFound) maxDepthFound = dep
        if (dep === 1) {
          if (mname === 'Idle') msIdle += ms
          else msTime += ms
        }
        if (!include) continue
        if (depthFilter !== DEPTH_ALL && dep !== depthFilter) continue

        let mk = markerMap.get(mname)
        if (!mk) {
          mk = {
            name: mname, msTotal: 0, count: 0, lastFrame: -1, presentOnFrameCount: 0,
            firstFrameIndex: frameIndex, msMean: 0, msMedian: 0, msLowerQuartile: 0, msUpperQuartile: 0,
            msMin: Number.MAX_VALUE, msMax: -Number.MAX_VALUE,
            minFrameIndex: 0, maxFrameIndex: 0,
            msMinIndividual: Number.MAX_VALUE, msMaxIndividual: -Number.MAX_VALUE,
            minIndividualFrameIndex: 0, maxIndividualFrameIndex: 0,
            msAtMedian: 0, medianFrameIndex: 0, minDepth: dep, maxDepth: dep,
            countMin: Number.MAX_SAFE_INTEGER, countMax: -Number.MAX_SAFE_INTEGER,
            countMean: 0, countMedian: 0, countLowerQuartile: 0, countUpperQuartile: 0,
            threads: [tname], frames: [], buckets: new Array(BUCKET_COUNT).fill(0),
            countBuckets: new Array(BUCKET_COUNT).fill(0)
          }
          markerMap.set(mname, mk)
        } else {
          if (!mk.threads.includes(tname)) mk.threads.push(tname)
        }

        mk.count++
        mk.msTotal += ms
        if (ms < mk.msMinIndividual) { mk.msMinIndividual = ms; mk.minIndividualFrameIndex = frameIndex }
        if (ms > mk.msMaxIndividual) { mk.msMaxIndividual = ms; mk.maxIndividualFrameIndex = frameIndex }
        if (dep < mk.minDepth) mk.minDepth = dep
        if (dep > mk.maxDepth) mk.maxDepth = dep

        if (frameIndex !== mk.lastFrame) {
          mk.presentOnFrameCount++
          mk.frames.push({ frameIndex, ms, count: 1 })
          mk.lastFrame = frameIndex
        } else {
          const last = mk.frames[mk.frames.length - 1]
          mk.frames[mk.frames.length - 1] = { frameIndex: last.frameIndex, ms: last.ms + ms, count: last.count + 1 }
        }
      }

      if (include) tr.frames.push({ frameIndex, ms: msTime, msIdle })
    }
  }

  // Finalize frame summary
  if (frameSummary.frames.length > 0) {
    frameSummary.frames.sort((a, b) => a.ms - b.ms || a.frameIndex - b.frameIndex)
    frameSummary.msMean = frameSummary.msTotal / frameSummary.count
    frameSummary.msMedian = getAt(frameSummary.frames, 50).ms
    frameSummary.medianFrameIndex = getAt(frameSummary.frames, 50).frameIndex
    frameSummary.msLowerQuartile = getAt(frameSummary.frames, 25).ms
    frameSummary.msUpperQuartile = getAt(frameSummary.frames, 75).ms
  }
  if (frameSummary.msMin === Number.MAX_VALUE) frameSummary.msMin = 0
  frameSummary.maxMarkerDepth = maxDepthFound
  frameSummary.totalMarkers = allMarkerNames.size
  const tsMax = frameSummary.msMax
  const scale = tsMax > 0 ? BUCKET_COUNT / tsMax : 0
  for (const ft of frameSummary.frames) {
    let idx = Math.floor(ft.ms * scale)
    if (idx < 0) idx = 0
    if (idx >= BUCKET_COUNT) idx = BUCKET_COUNT - 1
    frameSummary.buckets[idx]++
  }

  // Finalize markers
  let countMax = 0, countMaxMean = 0
  for (const mk of markerMap.values()) {
    mk.msMin = Number.MAX_VALUE; mk.msMax = -Number.MAX_VALUE
    mk.countMin = Number.MAX_SAFE_INTEGER; mk.countMax = -Number.MAX_SAFE_INTEGER
    for (const ft of mk.frames) {
      if (ft.ms < mk.msMin) { mk.msMin = ft.ms; mk.minFrameIndex = ft.frameIndex }
      if (ft.ms > mk.msMax) { mk.msMax = ft.ms; mk.maxFrameIndex = ft.frameIndex }
      if (ft.frameIndex === frameSummary.medianFrameIndex) mk.msAtMedian = ft.ms
      if (ft.count < mk.countMin) mk.countMin = ft.count
      if (ft.count > mk.countMax) mk.countMax = ft.count
    }
    mk.msMean = mk.presentOnFrameCount > 0 ? mk.msTotal / mk.presentOnFrameCount : 0
    mk.frames.sort((a, b) => a.count - b.count)
    mk.countMedian = getAt(mk.frames, 50).count
    mk.countLowerQuartile = getAt(mk.frames, 25).count
    mk.countUpperQuartile = getAt(mk.frames, 75).count
    mk.countMean = mk.presentOnFrameCount > 0 ? mk.count / mk.presentOnFrameCount : 0
    mk.frames.sort((a, b) => a.ms - b.ms)
    mk.msMedian = getAt(mk.frames, 50).ms
    mk.medianFrameIndex = getAt(mk.frames, 50).frameIndex
    mk.msLowerQuartile = getAt(mk.frames, 25).ms
    mk.msUpperQuartile = getAt(mk.frames, 75).ms
    if (mk.countMax > countMax) countMax = mk.countMax
    if (mk.countMean > countMaxMean) countMaxMean = mk.countMean

    // Compute buckets
    const bMin = mk.msMin, bMax = mk.msMax
    const bRange = bMax - bMin
    const bScale = bRange > 0 ? BUCKET_COUNT / bRange : 0
    mk.buckets = new Array(BUCKET_COUNT).fill(0)
    for (const ft of mk.frames) {
      let idx = Math.floor((ft.ms - bMin) * bScale)
      if (idx < 0) idx = 0; if (idx >= BUCKET_COUNT) idx = BUCKET_COUNT - 1
      mk.buckets[idx]++
    }
    if (bRange === 0) mk.buckets = mk.buckets.map(() => mk.buckets[0])
  }
  frameSummary.markerCountMax = countMax
  frameSummary.markerCountMaxMean = countMaxMean

  const markers = Array.from(markerMap.values())
  markers.sort((a, b) => (a.msAtMedian === b.msAtMedian ? -(a.medianFrameIndex - b.medianFrameIndex) : -(a.msAtMedian - b.msAtMedian)))

  const cleanMarkers = markers.map(m => ({
    name: m.name, msTotal: m.msTotal, count: m.count,
    countMin: m.countMin === Number.MAX_SAFE_INTEGER ? 0 : m.countMin,
    countMax: m.countMax === -Number.MAX_SAFE_INTEGER ? 0 : m.countMax,
    countMean: m.countMean, countMedian: m.countMedian,
    countLowerQuartile: m.countLowerQuartile, countUpperQuartile: m.countUpperQuartile,
    presentOnFrameCount: m.presentOnFrameCount, firstFrameIndex: m.firstFrameIndex, lastFrame: m.lastFrame,
    msMean: m.msMean, msMedian: m.msMedian, msLowerQuartile: m.msLowerQuartile, msUpperQuartile: m.msUpperQuartile,
    msMin: m.msMin === Number.MAX_VALUE ? 0 : m.msMin,
    msMax: m.msMax === -Number.MAX_VALUE ? 0 : m.msMax,
    msMinIndividual: m.msMinIndividual === Number.MAX_VALUE ? 0 : m.msMinIndividual,
    msMaxIndividual: m.msMaxIndividual === -Number.MAX_VALUE ? 0 : m.msMaxIndividual,
    minIndividualFrameIndex: m.minIndividualFrameIndex, maxIndividualFrameIndex: m.maxIndividualFrameIndex,
    msAtMedian: m.msAtMedian, medianFrameIndex: m.medianFrameIndex,
    minFrameIndex: m.minFrameIndex, maxFrameIndex: m.maxFrameIndex,
    minDepth: m.minDepth, maxDepth: m.maxDepth,
    threads: m.threads, buckets: m.buckets, countBuckets: m.countBuckets || [],
    frames: m.frames
  }))

  // Finalize threads
  const threads = Array.from(threadMap.values())
  for (const t of threads) {
    if (t.frames.length > 0) {
      const sorted = [...t.frames].sort((a, b) => a.ms - b.ms)
      t.msMin = getAt(sorted, 0).ms; t.minFrameIndex = getAt(sorted, 0).frameIndex
      t.msLowerQuartile = getAt(sorted, 25).ms
      t.msMedian = getAt(sorted, 50).ms; t.medianFrameIndex = getAt(sorted, 50).frameIndex
      t.msUpperQuartile = getAt(sorted, 75).ms
      t.msMax = getAt(sorted, 100).ms; t.maxFrameIndex = getAt(sorted, 100).frameIndex
      t.frames.sort((a, b) => a.frameIndex - b.frameIndex)
    }
  }

  return { frameSummary, markers: cleanMarkers, threads, frameTimeline, threadNames: data.threadNames, markerNames: data.markerNames }
}

// ─── Spike Detector ──────────────────────────────────────────────────────────

function categorize(name) {
  const n = name.toLowerCase()
  if (n.includes('gc.') || n.includes('gc ')) return 'gc'
  if (n.includes('physics')) return 'physics'
  if (n.includes('camera') || n.includes('render') || n.includes('draw') || n.includes('gfx')) return 'rendering'
  if (n.includes('script') || n.includes('lua') || n.includes('xlua') || n.includes('behaviour')) return 'script'
  if (n.includes('load') || n.includes('resource') || n.includes('asset') || n.includes('bundle')) return 'loading'
  if (n.includes('animat') || n.includes('director') || n.includes('timeline')) return 'animation'
  return 'unknown'
}

function detectAllSpikes(markers, maxTotal = 20) {
  const all = []
  for (const m of markers) {
    if (m.msMedian < 0.1 || m.frames.length < 3 || m.msMedian <= 0) continue
    const iqr = m.msUpperQuartile - m.msLowerQuartile
    const threshold = Math.max(m.msMedian + 3 * iqr, m.msMedian * 2)
    for (const ft of m.frames) {
      if (ft.ms > threshold) {
        all.push({ frameIndex: ft.frameIndex, ms: ft.ms, ratio: ft.ms / m.msMedian, category: categorize(m.name), markerName: m.name })
      }
    }
  }
  all.sort((a, b) => b.ms - a.ms)
  const seen = new Set(), deduped = []
  for (const s of all) {
    if (!seen.has(s.frameIndex)) { seen.add(s.frameIndex); deduped.push(s) }
    if (deduped.length >= maxTotal) break
  }
  return deduped
}

// ─── Call Tree ───────────────────────────────────────────────────────────────

function buildCallTree(markers, markerNames, msFrame) {
  if (!markers.length) return []
  const root = { name: '__root__', depth: 0, msTotal: msFrame, msSelf: msFrame, percentOfFrame: 100, children: [] }
  const stack = [root]
  for (const marker of markers) {
    const node = {
      name: markerNames[marker.nameIndex] || 'Unknown',
      depth: marker.depth,
      msTotal: marker.msMarkerTotal,
      msSelf: marker.msMarkerTotal,
      percentOfFrame: msFrame > 0 ? (marker.msMarkerTotal / msFrame) * 100 : 0,
      children: []
    }
    while (stack.length > marker.depth) stack.pop()
    const parent = stack[stack.length - 1]
    parent.children.push(node)
    parent.msSelf -= marker.msMarkerTotal
    stack.push(node)
  }
  return root.children
}

function findHotPath(topNodes) {
  if (!topNodes.length) return []
  const path = []
  let current = topNodes.reduce((a, b) => a.msTotal > b.msTotal ? a : b)
  while (true) {
    path.push({ name: current.name, depth: current.depth, msTotal: current.msTotal, msSelf: current.msSelf, percentOfFrame: current.percentOfFrame, isBottleneck: current.msSelf > current.msTotal * 0.3 })
    if (!current.children.length) break
    current = current.children.reduce((a, b) => a.msTotal > b.msTotal ? a : b)
  }
  return path
}

function formatCallTree(nodes, indent = 0, minMs = 0.5, maxDepth = 8) {
  if (indent >= maxDepth) return ''
  let result = ''
  const sorted = [...nodes].sort((a, b) => b.msTotal - a.msTotal)
  for (const node of sorted) {
    if (node.msTotal < minMs) continue
    const prefix = '  '.repeat(indent)
    const selfStr = node.msSelf > 0.1 ? ` [self=${node.msSelf.toFixed(1)}ms]` : ''
    result += `${prefix}${node.name}: ${node.msTotal.toFixed(1)}ms (${node.percentOfFrame.toFixed(1)}%)${selfStr}\n`
    if (node.children.length) result += formatCallTree(node.children, indent + 1, minMs, maxDepth)
  }
  return result
}

function formatHotPath(path) {
  return path.map((p, i) => {
    const arrow = i > 0 ? ' -> ' : ''
    const tag = p.isBottleneck ? ' **BOTTLENECK**' : ''
    return `${arrow}${p.name} (${p.msTotal.toFixed(1)}ms, ${p.percentOfFrame.toFixed(1)}%)${tag}`
  }).join('')
}

function getFrameCallTree(profileData, frameIndex) {
  const offset = frameIndex - 1 - profileData.frameIndexOffset
  if (offset < 0 || offset >= profileData.frames.length) return null
  const frame = profileData.frames[offset]
  let targetThread = null, threadName = ''
  for (const thread of frame.threads) {
    const tn = profileData.threadNames[thread.threadIndex] || `${thread.threadIndex}:Unknown`
    if (!targetThread || thread.markers.length > targetThread.markers.length) {
      targetThread = thread; threadName = tn
    }
  }
  if (!targetThread) return null
  const tree = buildCallTree(targetThread.markers, profileData.markerNames, frame.msFrame)
  const hotPath = findHotPath(tree)
  return { frameIndex, msFrame: frame.msFrame, threadName, tree, hotPath }
}

// ─── Report Builder ──────────────────────────────────────────────────────────

function buildReport(analysis, spikes, profileData, targetFps = 30) {
  const fs_ = analysis.frameSummary
  const avgFps = fs_.msMean > 0 ? (1000 / fs_.msMean).toFixed(1) : '0'
  const budget = 1000 / targetFps
  const isOnTarget = parseFloat(avgFps) >= targetFps * 0.9
  const truncName = n => n.length > 60 ? n.slice(0, 57) + '...' : n

  const iqr = fs_.msUpperQuartile - fs_.msLowerQuartile
  const spikeThreshold = fs_.msUpperQuartile + 1.5 * iqr

  const lines = []

  lines.push('# Unity Profiler CPU 性能分析报告')
  lines.push('')
  lines.push(`> 分析时间：${new Date().toLocaleString('zh-CN')}`)
  lines.push('')

  // ── 1. 概览 ──────────────────────────────────────────────────────────────
  lines.push('## 一、概览')
  lines.push('')
  lines.push('| 指标 | 数值 |')
  lines.push('|------|------|')
  lines.push(`| 总帧数 | ${fs_.count} |`)
  lines.push(`| 目标帧率 | ${targetFps} FPS |`)
  lines.push(`| 实际平均帧率 | ${avgFps} FPS |`)
  lines.push(`| 帧预算 | ${budget.toFixed(2)} ms |`)
  lines.push(`| 判定结果 | ${isOnTarget ? '✅ 达标' : '❌ 未达标'} |`)
  lines.push(`| 平均帧耗时 | ${fs_.msMean.toFixed(2)} ms |`)
  lines.push(`| 中位帧耗时 | ${fs_.msMedian.toFixed(2)} ms |`)
  lines.push(`| 最小帧耗时 | ${fs_.msMin.toFixed(2)} ms（第 #${fs_.minFrameIndex} 帧） |`)
  lines.push(`| 最大帧耗时 | ${fs_.msMax.toFixed(2)} ms（第 #${fs_.maxFrameIndex} 帧） |`)
  lines.push(`| Q1/Q3 | ${fs_.msLowerQuartile.toFixed(2)} ms / ${fs_.msUpperQuartile.toFixed(2)} ms |`)
  lines.push(`| 卡顿帧数 | ${spikes.length} 帧（阈值 ${spikeThreshold.toFixed(2)} ms） |`)
  lines.push(`| Marker 种类 | ${fs_.totalMarkers} |`)
  lines.push(`| 最大 Marker 深度 | ${fs_.maxMarkerDepth} |`)
  lines.push('')

  // Performance rating
  const worstRatio = fs_.msMax / fs_.msMedian
  let severity
  if (!isOnTarget && parseFloat(avgFps) < targetFps * 0.6) severity = '🔴 Critical'
  else if (!isOnTarget) severity = '🟡 Warning'
  else severity = '🟢 Normal'

  lines.push(`**性能等级：${severity}**`)
  lines.push('')
  if (worstRatio > 10) lines.push(`> ⚠️ 最差帧耗时是中位帧的 ${worstRatio.toFixed(1)} 倍，存在极端卡顿帧，需重点排查。`)
  else if (worstRatio > 5) lines.push(`> ⚠️ 最差帧耗时是中位帧的 ${worstRatio.toFixed(1)} 倍，存在明显卡顿帧。`)
  lines.push('')

  // ── 2. Top Markers ────────────────────────────────────────────────────────
  lines.push('## 二、Top Markers 分析（按中位耗时排序）')
  lines.push('')
  lines.push('| # | Marker 名称 | 中位(ms) | 均值(ms) | 最大(ms) | 占帧% | 出现帧数 | 线程 |')
  lines.push('|---|-------------|---------|---------|---------|-------|---------|------|')

  const top20 = analysis.markers.slice(0, 20)
  top20.forEach((m, i) => {
    const pct = fs_.msMean > 0 ? ((m.msMean / fs_.msMean) * 100).toFixed(1) : '0'
    const thread = (m.threads[0] || '-').split(':')[1] || m.threads[0] || '-'
    lines.push(`| ${i + 1} | \`${truncName(m.name)}\` | ${m.msMedian.toFixed(2)} | ${m.msMean.toFixed(2)} | ${m.msMax.toFixed(2)} | ${pct}% | ${m.presentOnFrameCount} | ${thread} |`)
  })
  lines.push('')

  // Identify bottleneck categories
  const topMarkers = analysis.markers.slice(0, 10)
  const gpuBound = topMarkers.find(m => m.name.includes('Gfx.WaitForPresent') || m.name.includes('WaitForAvailableFrameBuffer') || m.name.includes('Gfx.PresentFrame'))
  const gcSpike = spikes.some(s => s.category === 'gc')
  const physicsHeavy = topMarkers.find(m => m.name.toLowerCase().includes('physics'))
  const scriptHeavy = topMarkers.find(m => m.name.includes('ScriptRunBehaviourUpdate'))
  const uiHeavy = topMarkers.find(m => m.name.includes('Canvas') || m.name.includes('UI.Layout'))
  const luaHeavy = topMarkers.find(m => m.name.includes('xlua') || m.name.includes('LuaEnv'))

  lines.push('### 瓶颈类型分析')
  lines.push('')
  if (gpuBound) {
    lines.push(`- 🔴 **GPU Bound 信号**：\`${gpuBound.name}\` 耗时中位 ${gpuBound.msMedian.toFixed(2)}ms，占帧 ${(gpuBound.msMean / fs_.msMean * 100).toFixed(1)}%`)
    lines.push('  - 优化方向：减少 DrawCall、降低渲染分辨率、简化 Shader、开启 GPU Instancing')
  }
  if (physicsHeavy) {
    lines.push(`- 🟡 **Physics Heavy**：\`${physicsHeavy.name}\` 检测到物理开销偏高`)
    lines.push('  - 优化方向：检查 FixedTimestep 设置、减少活跃 Collider 数量、简化碰撞层级')
  }
  if (scriptHeavy) {
    lines.push(`- 🟡 **Script Heavy**：\`${scriptHeavy.name}\` 耗时中位 ${scriptHeavy.msMedian.toFixed(2)}ms`)
    lines.push('  - 优化方向：减少 MonoBehaviour.Update() 数量、将轮询改为事件驱动')
  }
  if (gcSpike) {
    lines.push('- 🟡 **GC Spike**：检测到 GC 相关卡顿帧')
    lines.push('  - 优化方向：使用对象池、减少临时对象分配、避免装箱操作')
  }
  if (uiHeavy) {
    lines.push(`- 🟡 **UI Heavy**：\`${uiHeavy.name}\` 检测到 UI 重建开销`)
    lines.push('  - 优化方向：拆分 Canvas、减少 Layout 嵌套、避免频繁触发重建')
  }
  if (luaHeavy) {
    lines.push(`- 🟡 **xLua 开销**：\`${luaHeavy.name}\` 存在 xLua 桥接开销`)
    lines.push('  - 优化方向：缓存跨语言访问结果、减少每帧 xlua.call 次数')
  }
  if (!gpuBound && !physicsHeavy && !scriptHeavy && !gcSpike && !uiHeavy && !luaHeavy) {
    lines.push('- ✅ 未检测到明显的单一瓶颈类型，性能较为均衡')
  }
  lines.push('')

  // ── 3. Call Trees ─────────────────────────────────────────────────────────
  lines.push('## 三、关键帧调用树分析')
  lines.push('')

  const worstFrameResult = getFrameCallTree(profileData, fs_.maxFrameIndex)
  const medianFrameResult = getFrameCallTree(profileData, fs_.medianFrameIndex)

  if (worstFrameResult) {
    lines.push(`### 最差帧 #${fs_.maxFrameIndex}（${fs_.msMax.toFixed(2)}ms，${worstRatio.toFixed(1)}x median）`)
    lines.push('')
    const hotPathText = formatHotPath(worstFrameResult.hotPath)
    if (hotPathText) {
      lines.push(`**Hot Path**: ${hotPathText}`)
      lines.push('')
    }
    const treeText = formatCallTree(worstFrameResult.tree, 0, 1.0, 7)
    if (treeText) {
      lines.push('**调用树**（仅显示 ≥ 1ms 节点）：')
      lines.push('```')
      lines.push(treeText.trimEnd())
      lines.push('```')
    }
    lines.push('')
  }

  if (medianFrameResult && medianFrameResult.frameIndex !== worstFrameResult?.frameIndex) {
    lines.push(`### 中位帧 #${fs_.medianFrameIndex}（${fs_.msMedian.toFixed(2)}ms）`)
    lines.push('')
    const hotPathText = formatHotPath(medianFrameResult.hotPath)
    if (hotPathText) {
      lines.push(`**Hot Path**: ${hotPathText}`)
      lines.push('')
    }
    const treeText = formatCallTree(medianFrameResult.tree, 0, 0.5, 6)
    if (treeText) {
      lines.push('**调用树**（仅显示 ≥ 0.5ms 节点）：')
      lines.push('```')
      lines.push(treeText.trimEnd())
      lines.push('```')
    }
    lines.push('')
  }

  // ── 4. Spike Analysis ─────────────────────────────────────────────────────
  if (spikes.length > 0) {
    lines.push('## 四、卡顿帧分析')
    lines.push('')
    lines.push(`共检测到 **${spikes.length}** 个卡顿帧（阈值：${spikeThreshold.toFixed(2)}ms，占总帧数 ${(spikes.length / fs_.count * 100).toFixed(1)}%）`)
    lines.push('')

    // Category breakdown
    const catCount = {}
    for (const s of spikes) catCount[s.category] = (catCount[s.category] || 0) + 1
    const catLabels = { gc: 'GC', physics: '物理', rendering: '渲染', script: '脚本', loading: '加载', animation: '动画', unknown: '未知' }
    lines.push('**卡顿原因分类：**')
    for (const [cat, cnt] of Object.entries(catCount).sort(([, a], [, b]) => b - a)) {
      lines.push(`- ${catLabels[cat] || cat}: ${cnt} 帧`)
    }
    lines.push('')

    lines.push('**Top 10 最严重卡顿帧：**')
    lines.push('')
    lines.push('| 帧号 | 耗时(ms) | 中位倍数 | 类型 | 主要 Marker |')
    lines.push('|------|---------|---------|------|------------|')
    for (const s of spikes.slice(0, 10)) {
      const typeLabel = catLabels[s.category] || s.category
      lines.push(`| #${s.frameIndex} | ${s.ms.toFixed(2)} | ${s.ratio.toFixed(1)}x | ${typeLabel} | \`${truncName(s.markerName)}\` |`)
    }
    lines.push('')

    // Show call trees for top 3 spike frames
    const topSpikeFrames = spikes.slice(0, 3)
    if (topSpikeFrames.length > 0) {
      lines.push('**卡顿帧调用树（Top 3）：**')
      lines.push('')
      for (const spike of topSpikeFrames) {
        const spikeTree = getFrameCallTree(profileData, spike.frameIndex)
        if (!spikeTree) continue
        lines.push(`#### 卡顿帧 #${spike.frameIndex}（${spike.ms.toFixed(2)}ms，${spike.ratio.toFixed(1)}x median，类型：${catLabels[spike.category]}）`)
        const hp = formatHotPath(spikeTree.hotPath)
        if (hp) lines.push(`**Hot Path**: ${hp}`)
        const tree = formatCallTree(spikeTree.tree, 0, 1.0, 6)
        if (tree) {
          lines.push('```')
          lines.push(tree.trimEnd())
          lines.push('```')
        }
        lines.push('')
      }
    }
  } else {
    lines.push('## 四、卡顿帧分析')
    lines.push('')
    lines.push('✅ 未检测到明显卡顿帧。')
    lines.push('')
  }

  // ── 5. Thread Analysis ────────────────────────────────────────────────────
  lines.push('## 五、线程分析')
  lines.push('')
  const activeThreads = analysis.threads.filter(t => t.msMedian > 0.1).sort((a, b) => b.msMedian - a.msMedian)
  if (activeThreads.length > 0) {
    lines.push('| 线程名称 | 中位(ms) | 均值(ms) | 最大(ms) | 最小(ms) |')
    lines.push('|---------|---------|---------|---------|---------|')
    for (const t of activeThreads.slice(0, 10)) {
      const tname = t.threadGroupName || t.threadNameWithIndex
      lines.push(`| ${tname} | ${t.msMedian.toFixed(2)} | - | ${t.msMax.toFixed(2)} | ${t.msMin.toFixed(2)} |`)
    }
  } else {
    lines.push('无活跃线程数据。')
  }
  lines.push('')

  // ── 6. Optimization Recommendations ──────────────────────────────────────
  lines.push('## 六、优化建议')
  lines.push('')

  let recIndex = 1

  // Budget analysis
  if (fs_.msMean > budget) {
    const overBudgetPct = ((fs_.msMean - budget) / budget * 100).toFixed(1)
    lines.push(`**${recIndex++}. [Critical] 帧耗时超标**`)
    lines.push(`   - 当前平均帧耗时 ${fs_.msMean.toFixed(2)}ms，超出 ${targetFps}FPS 帧预算（${budget.toFixed(2)}ms）${overBudgetPct}%`)
    lines.push(`   - 需要将主要耗时 Marker 的总和降低至 ${(budget * 0.85).toFixed(2)}ms 以内（留 15% 余量）`)
    lines.push('')
  }

  // Top marker recommendations
  const significantMarkers = analysis.markers.filter(m => m.msMean / fs_.msMean > 0.1).slice(0, 5)
  for (const m of significantMarkers) {
    const pct = (m.msMean / fs_.msMean * 100).toFixed(1)
    const priority = m.msMean / fs_.msMean > 0.3 ? 'Critical' : m.msMean / fs_.msMean > 0.15 ? 'Warning' : 'Info'
    const emoji = priority === 'Critical' ? '🔴' : priority === 'Warning' ? '🟡' : '🔵'
    lines.push(`**${recIndex++}. [${priority}] ${emoji} 优化 \`${truncName(m.name)}\`**`)
    lines.push(`   - 均值 ${m.msMean.toFixed(2)}ms，占帧 ${pct}%，最大 ${m.msMax.toFixed(2)}ms`)

    const n = m.name.toLowerCase()
    if (n.includes('gfx.waitforpresent')) {
      lines.push('   - 这是 GPU Bound 的典型信号，CPU 在等 GPU 完成渲染')
      lines.push('   - 优化方向：降低渲染分辨率、减少 DrawCall 数量、简化 Shader 复杂度')
    } else if (n.includes('gc.')) {
      lines.push('   - 垃圾回收热点，会导致不规律卡顿')
      lines.push('   - 优化方向：使用对象池减少分配、避免 foreach 在值类型 Collection 上的装箱、缓存字符串拼接结果')
    } else if (n.includes('physics')) {
      lines.push('   - 物理计算热点')
      lines.push('   - 优化方向：增大 FixedTimestep（如 0.02→0.033）、减少活跃 Rigidbody/Collider 数量')
    } else if (n.includes('scriptrunbehaviourupdate') || n.includes('xlua')) {
      lines.push('   - 脚本/Lua 逻辑热点')
      lines.push('   - 优化方向：减少每帧 MonoBehaviour.Update() 调用数量、将高频操作改为事件驱动')
    } else if (n.includes('canvas') || n.includes('ui.layout')) {
      lines.push('   - UI 重建热点')
      lines.push('   - 优化方向：分拆动态/静态 Canvas、减少 Layout 计算嵌套层级、避免频繁修改 UI 属性')
    } else if (n.includes('mapmanager') || n.includes('mapsignificance')) {
      lines.push('   - AOE 地图管理热点（AOI 更新）')
      lines.push('   - 优化方向：减少 ProcessTasks 遍历频率、空间哈希优化、降低 AOI 更新精度')
    }
    lines.push('')
  }

  // Spike reduction
  if (spikes.length > 0) {
    const spikeRate = (spikes.length / fs_.count * 100).toFixed(1)
    lines.push(`**${recIndex++}. [Warning] 卡顿帧处理**`)
    lines.push(`   - 卡顿帧占比 ${spikeRate}%（${spikes.length}/${fs_.count} 帧），超过 5% 会明显影响体验`)
    if (gcSpike) lines.push('   - 存在 GC 触发的卡顿：建议检查 Update 函数中的临时对象创建，使用 StringBuilder/对象池')
    const loadingSpikes = spikes.filter(s => s.category === 'loading')
    if (loadingSpikes.length > 0) lines.push(`   - 存在 ${loadingSpikes.length} 帧资源加载卡顿：建议改为异步加载或在 Loading 界面预加载`)
    lines.push('')
  }

  // ── 7. Summary ────────────────────────────────────────────────────────────
  lines.push('## 七、总结')
  lines.push('')
  lines.push(`本次分析共 ${fs_.count} 帧数据，平均帧率 ${avgFps} FPS（目标 ${targetFps} FPS）。`)
  lines.push('')

  const topBottleneck = analysis.markers[0]
  if (topBottleneck) {
    lines.push(`**主要瓶颈**：\`${truncName(topBottleneck.name)}\`（中位 ${topBottleneck.msMedian.toFixed(2)}ms，占帧 ${(topBottleneck.msMean / fs_.msMean * 100).toFixed(1)}%）`)
  }

  if (spikes.length > 0) {
    const topSpike = spikes[0]
    lines.push(`**最严重卡顿**：第 #${topSpike.frameIndex} 帧，耗时 ${topSpike.ms.toFixed(2)}ms（中位帧的 ${topSpike.ratio.toFixed(1)} 倍），触发 Marker：\`${truncName(topSpike.markerName)}\``)
  }

  lines.push('')
  lines.push('**优化优先级建议**：')
  if (!isOnTarget) lines.push(`1. 降低主线程平均帧耗时至 ${budget.toFixed(2)}ms 以内（当前 ${fs_.msMean.toFixed(2)}ms）`)
  if (spikes.length > fs_.count * 0.05) lines.push(`2. 解决卡顿帧问题（当前卡顿率 ${(spikes.length / fs_.count * 100).toFixed(1)}%，目标 < 5%）`)
  if (gpuBound) lines.push('3. GPU Bound 优化（降低渲染负载）')
  if (gcSpike) lines.push('4. 减少 GC 触发频率（内存分配优化）')
  lines.push('')

  return lines.join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const inputFile = args[0]
const outputDir = args[1]

if (!inputFile || !outputDir) {
  console.error('Usage: node analyze-pdata.js <input.pdata> <outputDir>')
  process.exit(1)
}

console.log(`[1/4] 解析 .pdata 文件: ${inputFile}`)
const profileData = parsePdata(inputFile)
console.log(`      版本 v${profileData.version}，${profileData.frames.length} 帧，${profileData.markerNames.length} 个 Marker，${profileData.threadNames.length} 个线程`)

console.log('[2/4] 运行统计分析...')
const analysis = analyzeProfileData(profileData)
if (!analysis) { console.error('分析失败：无有效帧数据'); process.exit(1) }
const fs_ = analysis.frameSummary
const avgFps = fs_.msMean > 0 ? (1000 / fs_.msMean).toFixed(1) : '0'
console.log(`      平均 FPS: ${avgFps}，均值帧: ${fs_.msMean.toFixed(2)}ms，中位帧: ${fs_.msMedian.toFixed(2)}ms，最差帧: ${fs_.msMax.toFixed(2)}ms`)

console.log('[3/4] 检测卡顿帧...')
const spikes = detectAllSpikes(analysis.markers)
console.log(`      检测到 ${spikes.length} 个卡顿帧`)

console.log('[4/4] 生成报告...')
const report = buildReport(analysis, spikes, profileData, 30)

// Ensure output dir
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

// Write preprocess-result.json (strip per-frame data to keep size reasonable)
const preprocessResult = {
  meta: {
    filePath: inputFile,
    version: profileData.version,
    analyzedAt: new Date().toISOString(),
    totalFrames: profileData.frames.length,
    markerCount: profileData.markerNames.length,
    threadCount: profileData.threadNames.length
  },
  frameSummary: analysis.frameSummary,
  spikes: spikes,
  threads: analysis.threads,
  markers: analysis.markers.slice(0, 100).map(m => ({
    ...m,
    frames: m.frames.slice(0, 50)  // limit frame list size
  })),
  frameTimeline: analysis.frameTimeline,
  threadNames: analysis.threadNames,
  markerNames: analysis.markerNames
}

const jsonPath = path.join(outputDir, 'preprocess-result.json')
const mdPath = path.join(outputDir, 'performance-report.md')

fs.writeFileSync(jsonPath, JSON.stringify(preprocessResult, null, 2), 'utf8')
fs.writeFileSync(mdPath, report, 'utf8')

console.log('')
console.log('✅ 分析完成！')
console.log(`   preprocess-result.json → ${jsonPath}`)
console.log(`   performance-report.md  → ${mdPath}`)
