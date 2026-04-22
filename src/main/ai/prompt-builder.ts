/**
 * Prompt builder - converts ProfileAnalysisResult into compact AI prompt text.
 * Strategy: only send key summary + top bottlenecks + anomaly signals, not raw data dumps.
 */
import { ProfileAnalysisResult } from '../profiler/types'

export function buildAnalysisPrompt(analysis: ProfileAnalysisResult): string {
  const fs = analysis.frameSummary
  const avgFps = fs.msMean > 0 ? (1000 / fs.msMean).toFixed(1) : '0'

  // Only top 10 markers, truncate long names
  const topMarkers = analysis.markers.slice(0, 10)
  const truncName = (name: string) => name.length > 60 ? name.slice(0, 57) + '...' : name

  // Detect spikes
  const iqr = fs.msUpperQuartile - fs.msLowerQuartile
  const spikeThreshold = fs.msUpperQuartile + 1.5 * iqr
  const spikeFrames = analysis.frameTimeline.filter(f => f.ms > spikeThreshold)
  const spikeCount = spikeFrames.length
  const worstSpikes = spikeFrames.sort((a, b) => b.ms - a.ms).slice(0, 5)

  // Significant threads only
  const threads = analysis.threads
    .filter(t => t.msMedian > 0.5)
    .sort((a, b) => b.msMedian - a.msMedian)
    .slice(0, 5)

  let prompt = `Analyze this Unity Profiler data. Respond in Chinese, Markdown format.

## Summary
- Frames: ${fs.count}, FPS: ${avgFps}, Mean: ${fs.msMean.toFixed(2)}ms, Median: ${fs.msMedian.toFixed(2)}ms
- Range: ${fs.msMin.toFixed(2)}ms ~ ${fs.msMax.toFixed(2)}ms (worst: frame #${fs.maxFrameIndex})
- Quartiles: Q1=${fs.msLowerQuartile.toFixed(2)}ms, Q3=${fs.msUpperQuartile.toFixed(2)}ms
- Spike threshold: ${spikeThreshold.toFixed(1)}ms, Spikes: ${spikeCount}/${fs.count} (${((spikeCount / fs.count) * 100).toFixed(1)}%)

## Top 10 Bottleneck Markers
`
  topMarkers.forEach((m, i) => {
    prompt += `${i + 1}. \`${truncName(m.name)}\` median=${m.msMedian.toFixed(2)}ms mean=${m.msMean.toFixed(2)}ms max=${m.msMax.toFixed(2)}ms count=${m.count} depth=${m.minDepth} thread=${m.threads[0] || '-'}\n`
  })

  if (worstSpikes.length > 0) {
    prompt += `\n## Worst Spike Frames\n`
    worstSpikes.forEach(f => {
      prompt += `- Frame #${f.frameIndex}: ${f.ms.toFixed(2)}ms\n`
    })
  }

  if (threads.length > 0) {
    prompt += `\n## Active Threads\n`
    threads.forEach(t => {
      prompt += `- ${t.threadGroupName}: median=${t.msMedian.toFixed(2)}ms max=${t.msMax.toFixed(2)}ms\n`
    })
  }

  prompt += `
## Required Analysis
1. Identify top 3 performance bottlenecks with root cause
2. Analyze spike pattern and likely causes
3. Provide 3-5 concrete Unity optimization suggestions`

  return prompt
}

export function buildFollowUpPrompt(userQuestion: string, analysis: ProfileAnalysisResult): string {
  const fs = analysis.frameSummary
  const avgFps = fs.msMean > 0 ? (1000 / fs.msMean).toFixed(1) : '0'
  return `Context: Unity Profiler data with ${fs.count} frames, ${avgFps} FPS avg, ${fs.msMean.toFixed(2)}ms mean frame time.

Question: ${userQuestion}

Respond in Chinese with specific, actionable advice.`
}
