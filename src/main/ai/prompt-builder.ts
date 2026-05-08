/**
 * Prompt builder - converts ProfileAnalysisResult + DeepAnalysisContext into AI prompt.
 *
 * Phase 1.5: integrates call-tree, hot-path, and spike-detector results
 * into the prompt so the AI can reason about call hierarchies, not just flat stats.
 */
import { ProfileAnalysisResult } from '../profiler/types'
import { SpikeInfo } from '../profiler/spike-detector'

// ============ Deep analysis context (pre-computed by ipc-handlers) ============

export interface FrameTreeContext {
  frameIndex: number
  msFrame: number
  treeText: string      // formatCallTree() output
  hotPathText: string   // formatHotPath() output
  label: string         // e.g. "Worst Frame" / "Median Frame"
}

export interface MarkerCallChainContext {
  markerName: string
  msMean: number
  msMedian: number
  msMax: number
  count: number
  presentOnFrameCount: number
  percentOfFrame: number  // msMean / frameMean * 100
  callChainText: string   // formatted call chain string
  threads: string[]
  depth: number
}

export interface SpikeFrameContext {
  frameIndex: number
  msFrame: number
  ratio: number           // relative to median frame
  category: string
  treeText: string        // call tree of this spike frame
  hotPathText: string     // hot path of this spike frame
  dominantMarker: string  // the marker that caused the spike
}

export interface DeepAnalysisContext {
  frameTrees: FrameTreeContext[]         // worst + median (extensible)
  spikes: SpikeInfo[]
  spikeFrames: SpikeFrameContext[]       // call trees for spike frames
  topMarkerChains: MarkerCallChainContext[] // call chains for top markers
  targetFps: number                      // user-specified target FPS
}

// ============ Main prompt builder ============

export function buildAnalysisPrompt(
  analysis: ProfileAnalysisResult,
  deep?: DeepAnalysisContext
): string {
  const fs = analysis.frameSummary
  const avgFps = fs.msMean > 0 ? (1000 / fs.msMean).toFixed(1) : '0'
  const targetFps = deep?.targetFps ?? 30

  const parts: string[] = []

  // --- Header ---
  parts.push('以下是 Unity Profiler 采集的 CPU 性能数据，请按照你的性能分析 Skill 进行完整分析。\n')

  // --- Section 1: Frame Summary ---
  const iqr = fs.msUpperQuartile - fs.msLowerQuartile
  const spikeThreshold = fs.msUpperQuartile + 1.5 * iqr
  const spikeCount = deep?.spikes?.length ?? analysis.frameTimeline.filter(f => f.ms > spikeThreshold).length

  parts.push(`## Frame Summary
- Frames: ${fs.count}
- Target FPS: ${targetFps}
- FPS: ${avgFps}
- Mean: ${fs.msMean.toFixed(2)}ms
- Median: ${fs.msMedian.toFixed(2)}ms
- Range: ${fs.msMin.toFixed(2)}ms ~ ${fs.msMax.toFixed(2)}ms (worst: frame #${fs.maxFrameIndex})
- Quartiles: Q1=${fs.msLowerQuartile.toFixed(2)}ms, Q3=${fs.msUpperQuartile.toFixed(2)}ms
- Spikes: ${spikeCount}/${fs.count} frames (threshold: ${spikeThreshold.toFixed(2)}ms)`)

  // --- Section 2: Top 10 Markers ---
  const topMarkers = analysis.markers.slice(0, 10)
  const truncName = (name: string) => name.length > 60 ? name.slice(0, 57) + '...' : name

  parts.push('\n## Top 10 Markers (by median time)')
  topMarkers.forEach((m, i) => {
    const pctOfFrame = fs.msMean > 0 ? ((m.msMean / fs.msMean) * 100).toFixed(1) : '0'
    parts.push(`${i + 1}. \`${truncName(m.name)}\` median=${m.msMedian.toFixed(2)}ms mean=${m.msMean.toFixed(2)}ms max=${m.msMax.toFixed(2)}ms count=${m.count} depth=${m.minDepth} thread=${m.threads[0] || '-'} %frame=${pctOfFrame}%`)
  })

  // --- Section 3: Top Marker Call Chains ---
  if (deep?.topMarkerChains && deep.topMarkerChains.length > 0) {
    parts.push('\n## Top Marker Call Chains (complete paths)')
    for (const chain of deep.topMarkerChains) {
      parts.push(`\n### ${truncName(chain.markerName)} (avg ${chain.msMean.toFixed(2)}ms, ${chain.percentOfFrame.toFixed(1)}% of frame)`)
      parts.push(`- Median: ${chain.msMedian.toFixed(2)}ms, Max: ${chain.msMax.toFixed(2)}ms`)
      parts.push(`- Count: ${chain.count}, Present on ${chain.presentOnFrameCount} frames`)
      parts.push(`- Depth: ${chain.depth}, Thread: ${chain.threads[0] || '-'}`)
      parts.push(`- Call Chain: ${chain.callChainText}`)
    }
  }

  // --- Section 4: Spike Frame Analysis ---
  if (deep?.spikeFrames && deep.spikeFrames.length > 0) {
    parts.push(`\n## Spike Frame Call Trees (${deep.spikeFrames.length} spike frames)`)
    for (const sf of deep.spikeFrames) {
      parts.push(`\n### Spike Frame #${sf.frameIndex} (${sf.msFrame.toFixed(2)}ms, ${sf.ratio.toFixed(1)}x median) [${sf.category}]`)
      parts.push(`- Dominant Marker: \`${sf.dominantMarker}\``)
      if (sf.hotPathText) {
        parts.push(`- Hot Path: ${sf.hotPathText}`)
      }
      if (sf.treeText) {
        parts.push(`- Call Tree:`)
        parts.push(sf.treeText.trimEnd())
      }
    }
  } else if (deep?.frameTrees && deep.frameTrees.length > 0) {
    // Fallback: use old-style frame trees (worst + median)
    for (const ft of deep.frameTrees) {
      if (ft.treeText) {
        parts.push(`\n## Call Tree - ${ft.label} #${ft.frameIndex} (${ft.msFrame.toFixed(2)}ms)`)
        parts.push(ft.treeText.trimEnd())
      }
      if (ft.hotPathText) {
        parts.push(`\n## Hot Path (${ft.label})`)
        parts.push(ft.hotPathText)
      }
    }
  }

  // --- Section 5: Spike List ---
  if (deep?.spikes && deep.spikes.length > 0) {
    parts.push('\n## Spike List (sorted by severity)')
    const topSpikes = deep.spikes.slice(0, 15)
    for (const s of topSpikes) {
      parts.push(`- Frame #${s.frameIndex}: \`${truncName(s.markerName)}\` ${s.ms.toFixed(2)}ms (${s.ratio.toFixed(1)}x median) [${s.category}]`)
    }
  }

  // --- Section 6: Active Threads ---
  const threads = analysis.threads
    .filter(t => t.msMedian > 0.5)
    .sort((a, b) => b.msMedian - a.msMedian)
    .slice(0, 5)
  if (threads.length > 0) {
    parts.push('\n## Active Threads')
    for (const t of threads) {
      parts.push(`- ${t.threadGroupName}: median=${t.msMedian.toFixed(2)}ms max=${t.msMax.toFixed(2)}ms`)
    }
  }

  // --- No explicit analysis instructions here ---
  // The Skill (system prompt) defines how to analyze this data.

  return parts.join('\n')
}

// ============ Follow-up prompt (for multi-turn) ============

export function buildFollowUpPrompt(
  userQuestion: string,
  analysis: ProfileAnalysisResult,
  deep?: DeepAnalysisContext
): string {
  const fs = analysis.frameSummary
  const avgFps = fs.msMean > 0 ? (1000 / fs.msMean).toFixed(1) : '0'

  let context = `Context: Unity Profiler data with ${fs.count} frames, ${avgFps} FPS avg, ${fs.msMean.toFixed(2)}ms mean frame time.`

  // Add hot path context for follow-ups
  if (deep?.frameTrees?.[0]?.hotPathText) {
    context += `\nWorst frame hot path: ${deep.frameTrees[0].hotPathText}`
  }

  return `${context}

Question: ${userQuestion}

Respond in Chinese with specific, actionable advice.`
}

// ============ Fallback report (when AI fails) ============

export function buildFallbackReport(
  analysis: ProfileAnalysisResult,
  deep?: DeepAnalysisContext
): string {
  const fs = analysis.frameSummary
  const avgFps = fs.msMean > 0 ? (1000 / fs.msMean).toFixed(1) : '0'
  const targetFps = deep?.targetFps ?? 30
  const truncName = (name: string) => name.length > 50 ? name.slice(0, 47) + '...' : name

  const lines: string[] = []

  lines.push('# CPU 性能分析报告（确定性分析）')
  lines.push('')
  lines.push('> AI 分析服务暂时不可用，以下为确定性分析结果。')
  lines.push('')

  // Frame overview
  const fpsRatio = (parseFloat(avgFps) / targetFps * 100).toFixed(1)
  const isOnTarget = parseFloat(avgFps) >= targetFps * 0.9
  lines.push('## 一、概览')
  lines.push('')
  lines.push(`| 指标 | 数值 |`)
  lines.push(`|------|------|`)
  lines.push(`| 总帧数 | ${fs.count} |`)
  lines.push(`| 目标帧率 | ${targetFps} FPS |`)
  lines.push(`| 实际平均帧率 | ${avgFps} FPS |`)
  lines.push(`| 达标率 | ${fpsRatio}% |`)
  lines.push(`| 判定结果 | ${isOnTarget ? '✅ 达标' : '❌ 不达标'} |`)
  lines.push(`| 平均帧耗时 | ${fs.msMean.toFixed(2)}ms |`)
  lines.push(`| 最差帧 | #${fs.maxFrameIndex} (${fs.msMax.toFixed(2)}ms) |`)
  lines.push(`| 卡顿帧数 | ${deep?.spikes?.length ?? '-'} |`)
  lines.push('')

  // Hot paths
  if (deep?.frameTrees) {
    for (const ft of deep.frameTrees) {
      if (ft.hotPathText) {
        lines.push(`## 最耗时调用链（${ft.label} #${ft.frameIndex}）`)
        lines.push(ft.hotPathText)
        lines.push('')
      }
      if (ft.treeText) {
        lines.push(`## 调用树（${ft.label} #${ft.frameIndex}, ${ft.msFrame.toFixed(2)}ms）`)
        lines.push(ft.treeText.trimEnd())
        lines.push('')
      }
    }
  }

  // Top marker call chains
  if (deep?.topMarkerChains && deep.topMarkerChains.length > 0) {
    lines.push('## Top Marker 调用链')
    for (const chain of deep.topMarkerChains.slice(0, 5)) {
      lines.push(`- **${truncName(chain.markerName)}** (avg ${chain.msMean.toFixed(2)}ms, 占帧 ${chain.percentOfFrame.toFixed(1)}%): ${chain.callChainText}`)
    }
    lines.push('')
  }

  // Top markers (flat stats)
  const top5 = analysis.markers.slice(0, 5)
  if (top5.length > 0) {
    lines.push('## Top 5 瓶颈 Markers')
    top5.forEach((m, i) => {
      lines.push(`${i + 1}. **${truncName(m.name)}**: median=${m.msMedian.toFixed(2)}ms, max=${m.msMax.toFixed(2)}ms, count=${m.count}`)
    })
    lines.push('')
  }

  // Spike frames with call trees
  if (deep?.spikeFrames && deep.spikeFrames.length > 0) {
    lines.push('## 卡顿帧分析')
    for (const sf of deep.spikeFrames.slice(0, 5)) {
      lines.push(`### Frame #${sf.frameIndex} (${sf.msFrame.toFixed(2)}ms, ${sf.ratio.toFixed(1)}x median) [${sf.category}]`)
      lines.push(`- 主要 Marker: \`${sf.dominantMarker}\``)
      if (sf.hotPathText) lines.push(`- Hot Path: ${sf.hotPathText}`)
      lines.push('')
    }
  } else if (deep?.spikes && deep.spikes.length > 0) {
    lines.push('## 检测到的异常帧')
    for (const s of deep.spikes.slice(0, 10)) {
      lines.push(`- Frame #${s.frameIndex}: \`${truncName(s.markerName)}\` ${s.ms.toFixed(2)}ms (正常值的 ${s.ratio.toFixed(1)} 倍) [${s.category}]`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
