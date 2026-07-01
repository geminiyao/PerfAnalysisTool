/**
 * Call tree utilities for CPU performance analysis.
 * Lightweight approach: build tree on-demand for a specific frame,
 * or find call chain for a specific marker by scanning backwards.
 */
import { ProfileData, ProfileMarker, ProfileFrame, ProfileThread } from './types'

// ============ Types ============

export interface CallTreeNode {
  name: string
  depth: number
  msTotal: number
  msSelf: number
  percentOfFrame: number
  children: CallTreeNode[]
}

export interface CallChainEntry {
  name: string
  depth: number
  msTotal: number
  percentOfFrame: number
}

export interface HotPathEntry extends CallChainEntry {
  msSelf: number
  isBottleneck: boolean // true if self time > 30% of parent
}

export interface FrameCallTreeResult {
  frameIndex: number
  msFrame: number
  threadName: string
  tree: CallTreeNode[]      // top-level nodes (depth=1)
  hotPath: HotPathEntry[]
}

// ============ Build call tree for a single frame + thread ============

export function buildCallTree(
  markers: ProfileMarker[],
  markerNames: string[],
  msFrame: number
): CallTreeNode[] {
  if (markers.length === 0) return []

  const root: CallTreeNode = {
    name: '__root__', depth: 0, msTotal: msFrame, msSelf: msFrame,
    percentOfFrame: 100, children: []
  }
  const stack: CallTreeNode[] = [root]

  for (const marker of markers) {
    const node: CallTreeNode = {
      name: markerNames[marker.nameIndex] || 'Unknown',
      depth: marker.depth,
      msTotal: marker.msMarkerTotal,
      msSelf: marker.msMarkerTotal,
      percentOfFrame: msFrame > 0 ? (marker.msMarkerTotal / msFrame) * 100 : 0,
      children: []
    }

    // Pop stack back to parent level
    while (stack.length > marker.depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    parent.children.push(node)
    parent.msSelf -= marker.msMarkerTotal

    stack.push(node)
  }

  return root.children
}

// ============ Find call chain for a specific marker (scan backwards) ============

export function findCallChain(
  markers: ProfileMarker[],
  markerNames: string[],
  targetMarkerName: string,
  msFrame: number
): CallChainEntry[] | null {
  // Find the target marker (pick the one with highest msTotal if multiple)
  let bestIdx = -1
  let bestMs = -1
  for (let i = 0; i < markers.length; i++) {
    const name = markerNames[markers[i].nameIndex]
    if (name === targetMarkerName && markers[i].msMarkerTotal > bestMs) {
      bestMs = markers[i].msMarkerTotal
      bestIdx = i
    }
  }
  if (bestIdx < 0) return null

  const chain: CallChainEntry[] = []
  const target = markers[bestIdx]
  chain.push({
    name: markerNames[target.nameIndex],
    depth: target.depth,
    msTotal: target.msMarkerTotal,
    percentOfFrame: msFrame > 0 ? (target.msMarkerTotal / msFrame) * 100 : 0
  })

  // Scan backwards to find each parent (depth-1, depth-2, ...)
  let currentDepth = target.depth
  for (let i = bestIdx - 1; i >= 0 && currentDepth > 1; i--) {
    if (markers[i].depth === currentDepth - 1) {
      chain.unshift({
        name: markerNames[markers[i].nameIndex],
        depth: markers[i].depth,
        msTotal: markers[i].msMarkerTotal,
        percentOfFrame: msFrame > 0 ? (markers[i].msMarkerTotal / msFrame) * 100 : 0
      })
      currentDepth--
    }
  }

  return chain
}

// ============ Find hot path (greedy: always pick heaviest child) ============

export function findHotPath(
  topNodes: CallTreeNode[],
  msFrame: number
): HotPathEntry[] {
  if (topNodes.length === 0) return []

  const path: HotPathEntry[] = []
  let current = topNodes.reduce((a, b) => a.msTotal > b.msTotal ? a : b)

  while (true) {
    const isBottleneck = current.msSelf > current.msTotal * 0.3
    path.push({
      name: current.name,
      depth: current.depth,
      msTotal: current.msTotal,
      msSelf: current.msSelf,
      percentOfFrame: current.percentOfFrame,
      isBottleneck
    })

    if (current.children.length === 0) break
    current = current.children.reduce((a, b) => a.msTotal > b.msTotal ? a : b)
  }

  return path
}

// ============ Format call tree as text (for AI prompt) ============

export function formatCallTree(
  nodes: CallTreeNode[],
  indent: number = 0,
  minMs: number = 0.5,
  maxDepth: number = 8
): string {
  if (indent >= maxDepth) return ''
  let result = ''
  // Sort children by msTotal descending
  const sorted = [...nodes].sort((a, b) => b.msTotal - a.msTotal)

  for (const node of sorted) {
    if (node.msTotal < minMs) continue
    const prefix = '  '.repeat(indent)
    const selfStr = node.msSelf > 0.1 ? ` [self=${node.msSelf.toFixed(1)}ms]` : ''
    result += `${prefix}${node.name}: ${node.msTotal.toFixed(1)}ms (${node.percentOfFrame.toFixed(1)}%)${selfStr}\n`
    if (node.children.length > 0) {
      result += formatCallTree(node.children, indent + 1, minMs, maxDepth)
    }
  }
  return result
}

export function formatHotPath(path: HotPathEntry[]): string {
  if (path.length === 0) return ''
  return path.map((p, i) => {
    const arrow = i > 0 ? ' -> ' : ''
    const tag = p.isBottleneck ? ' **BOTTLENECK**' : ''
    return `${arrow}${p.name} (${p.msTotal.toFixed(1)}ms, ${p.percentOfFrame.toFixed(1)}%)${tag}`
  }).join('')
}

export function formatCallChain(chain: CallChainEntry[]): string {
  return chain.map((c, i) => {
    const arrow = i > 0 ? ' -> ' : ''
    return `${arrow}${c.name} (${c.msTotal.toFixed(1)}ms, ${c.percentOfFrame.toFixed(1)}%)`
  }).join('')
}

// ============ Get call tree for a specific frame ============

export function getFrameCallTree(
  profileData: ProfileData,
  frameIndex: number,
  threadFilter?: string
): FrameCallTreeResult | null {
  const offset = frameIndex - profileData.frameIndexOffset
  if (offset < 0 || offset >= profileData.frames.length) return null

  const frame = profileData.frames[offset]

  // Find the target thread (default: first thread, usually Main Thread)
  let targetThread: ProfileThread | null = null
  let threadName = ''
  for (const thread of frame.threads) {
    const tn = profileData.threadNames[thread.threadIndex] || `${thread.threadIndex}:Unknown`
    if (threadFilter) {
      if (tn === threadFilter || tn.includes(threadFilter)) {
        targetThread = thread
        threadName = tn
        break
      }
    } else {
      // Default: pick the thread with most markers (usually Main Thread)
      if (!targetThread || thread.markers.length > targetThread.markers.length) {
        targetThread = thread
        threadName = tn
      }
    }
  }

  if (!targetThread) return null

  const tree = buildCallTree(targetThread.markers, profileData.markerNames, frame.msFrame)
  const hotPath = findHotPath(tree, frame.msFrame)

  return {
    frameIndex,
    msFrame: frame.msFrame,
    threadName,
    tree,
    hotPath
  }
}

// ============ Flatten tree to table-friendly format (for Hierarchy view) ============

export interface FlatTreeRow {
  key: string
  name: string
  depth: number
  msTotal: number
  msSelf: number
  percentOfFrame: number
  children?: FlatTreeRow[]
}

export function treeToFlatRows(nodes: CallTreeNode[], parentKey: string = ''): FlatTreeRow[] {
  return nodes
    .sort((a, b) => b.msTotal - a.msTotal)
    .map((node, idx) => {
      const key = parentKey ? `${parentKey}-${idx}` : `${idx}`
      const row: FlatTreeRow = {
        key,
        name: node.name,
        depth: node.depth,
        msTotal: node.msTotal,
        msSelf: node.msSelf,
        percentOfFrame: node.percentOfFrame
      }
      if (node.children.length > 0) {
        row.children = treeToFlatRows(node.children, key)
      }
      return row
    })
}

// ============ Phase X.2: 聚合多帧 callTree → 全 trace 平均 ms/帧 ============

export interface AggregatedCallTreeNode {
  name: string
  depth: number
  /** 此节点（含所有调用次数）累计 ms */
  msTotal: number
  /** 平均每帧总耗时 (msTotal / frameCount) */
  msPerFrameTotal: number
  /** 此节点 self 时间累计（不含 children）*/
  msSelf: number
  /** 平均每帧 self */
  msPerFrameSelf: number
  /** 出现在多少帧（同一帧多次调用记一次）*/
  presentOnFrameCount: number
  /** 出现在该子树中的帧数占总帧数% */
  presentRate: number
  /** 占线程总时间% (msTotal / 该线程 msTotal) */
  threadPct: number
  /** 调用次数累计 */
  count: number
  /** Phase X.3: GC.Alloc 在此子树触发的累计次数 */
  gcAllocCount: number
  children: AggregatedCallTreeNode[]
}

export interface AggregatedCallTree {
  threadName: string
  frameCount: number
  msTotalAllFrames: number
  msPerFrameTotal: number
  presentOnFrameCount: number
  /** 顶层节点列表（去掉伪 root）*/
  roots: AggregatedCallTreeNode[]
}

/**
 * 把单帧 buildCallTree 的结果聚合成跨多帧的 callTree。
 * 路径 key = depth + 父路径 + name，同位置同名节点累加。
 *
 * Phase X.2: 输入 frame 数组（多帧 + 同线程），输出全 trace 聚合树。
 */
export function aggregateCallTrees(
  profileData: ProfileData,
  threadName: string,
  options: { gcAllocMarkerNames?: Set<string> } = {}
): AggregatedCallTree | null {
  const allFrames = profileData.frames
  if (allFrames.length === 0) return null

  const gcAllocSet = options.gcAllocMarkerNames ?? new Set<string>()

  // pathKey → 聚合数据
  interface AggWork {
    name: string
    depth: number
    msTotal: number
    msSelf: number
    presentFrames: Set<number>
    count: number
    gcAllocCount: number
    childKeys: Set<string>
  }
  const aggMap = new Map<string, AggWork>()

  // 也记录每条路径的父子关系
  const childrenMap = new Map<string, string[]>()  // pathKey → ordered child keys

  let processedFrames = 0
  let msTotalAllFrames = 0

  for (let frameIdx = 0; frameIdx < allFrames.length; frameIdx++) {
    const frame = allFrames[frameIdx]
    // 找匹配 threadName 的线程
    const thread = frame.threads.find(t => {
      const tn = profileData.threadNames[t.threadIndex] || ''
      return tn === threadName
    })
    if (!thread || thread.markers.length === 0) continue
    processedFrames++
    msTotalAllFrames += frame.msFrame

    // 用 buildCallTree 拿单帧树
    const tree = buildCallTree(thread.markers, profileData.markerNames, frame.msFrame)

    // 递归累加到 aggMap，同时记 path
    const walk = (node: CallTreeNode, parentPath: string) => {
      const path = parentPath ? `${parentPath}▸${node.name}` : node.name
      let agg = aggMap.get(path)
      if (!agg) {
        agg = {
          name: node.name,
          depth: node.depth,
          msTotal: 0,
          msSelf: 0,
          presentFrames: new Set(),
          count: 0,
          gcAllocCount: 0,
          childKeys: new Set(),
        }
        aggMap.set(path, agg)
      }
      agg.msTotal += node.msTotal
      agg.msSelf += node.msSelf
      agg.presentFrames.add(frameIdx)
      agg.count += 1
      // GC.Alloc 沿祖先链累加（X.3）
      if (gcAllocSet.has(node.name)) {
        // 这个节点本身是 GC.Alloc - 但通常 GC.Alloc 是叶子，沿父链累加在 walk caller 那
      }
      for (const child of node.children) {
        const childPath = `${path}▸${child.name}`
        agg.childKeys.add(childPath)
        if (!childrenMap.has(path)) childrenMap.set(path, [])
        const arr = childrenMap.get(path)!
        if (!arr.includes(childPath)) arr.push(childPath)
        walk(child, path)
        // 子树里有 GC.Alloc 的话向上传播 gcAllocCount
        if (gcAllocSet.has(child.name)) {
          agg.gcAllocCount++
        }
      }
    }

    for (const root of tree) {
      const rootPath = root.name
      childrenMap.set('__roots__', (childrenMap.get('__roots__') ?? []).concat([rootPath]))
      walk(root, '')
    }
  }

  if (processedFrames === 0) return null

  // 第二遍：补每个节点的 gcAllocCount——子树聚合（深度优先，从底向上）
  // 上面 walk 内的 gcAllocCount 累加只统计了直接子节点，需要再做一次自底向上传播
  const sortedPaths = [...aggMap.keys()].sort((a, b) => b.split('▸').length - a.split('▸').length) // depth deep → shallow
  for (const path of sortedPaths) {
    const agg = aggMap.get(path)!
    for (const childKey of agg.childKeys) {
      const child = aggMap.get(childKey)
      if (child) agg.gcAllocCount += child.gcAllocCount
    }
  }

  // 装配最终树
  const buildAggNode = (path: string): AggregatedCallTreeNode | null => {
    const agg = aggMap.get(path)
    if (!agg) return null
    const childPaths = childrenMap.get(path) ?? []
    // 按 msTotal 降序
    const sortedChildKeys = [...agg.childKeys].sort((a, b) => (aggMap.get(b)?.msTotal ?? 0) - (aggMap.get(a)?.msTotal ?? 0))
    const children = sortedChildKeys
      .map(k => buildAggNode(k))
      .filter((n): n is AggregatedCallTreeNode => n != null)
    return {
      name: agg.name,
      depth: agg.depth,
      msTotal: parseFloat(agg.msTotal.toFixed(2)),
      msPerFrameTotal: parseFloat((agg.msTotal / processedFrames).toFixed(3)),
      msSelf: parseFloat(agg.msSelf.toFixed(2)),
      msPerFrameSelf: parseFloat((agg.msSelf / processedFrames).toFixed(3)),
      presentOnFrameCount: agg.presentFrames.size,
      presentRate: parseFloat(((agg.presentFrames.size / processedFrames) * 100).toFixed(1)),
      threadPct: msTotalAllFrames > 0 ? parseFloat(((agg.msTotal / msTotalAllFrames) * 100).toFixed(1)) : 0,
      count: agg.count,
      gcAllocCount: agg.gcAllocCount,
      children,
    }
  }

  // 顶层 roots
  const rootPaths = childrenMap.get('__roots__') ?? []
  const dedupedRoots = [...new Set(rootPaths)]
  const roots = dedupedRoots
    .map(p => buildAggNode(p))
    .filter((n): n is AggregatedCallTreeNode => n != null)
    .sort((a, b) => b.msTotal - a.msTotal)

  return {
    threadName,
    frameCount: processedFrames,
    msTotalAllFrames: parseFloat(msTotalAllFrames.toFixed(2)),
    msPerFrameTotal: parseFloat((msTotalAllFrames / processedFrames).toFixed(2)),
    presentOnFrameCount: processedFrames,
    roots,
  }
}
