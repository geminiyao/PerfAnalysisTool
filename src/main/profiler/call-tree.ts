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
