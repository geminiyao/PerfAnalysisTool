/**
 * Spike detector: identifies abnormal frames where markers deviate significantly from their median.
 */
import { MarkerDataResult, FrameTime } from './types'

export interface SpikeInfo {
  frameIndex: number
  ms: number
  ratio: number                // relative to median
  category: SpikeCategory
  markerName: string
}

export type SpikeCategory = 'gc' | 'physics' | 'rendering' | 'script' | 'loading' | 'animation' | 'unknown'

function categorizeByName(name: string): SpikeCategory {
  const n = name.toLowerCase()
  if (n.includes('gc.') || n.includes('gc ')) return 'gc'
  if (n.includes('physics')) return 'physics'
  if (n.includes('camera') || n.includes('render') || n.includes('draw') || n.includes('gfx')) return 'rendering'
  if (n.includes('script') || n.includes('lua') || n.includes('xlua') || n.includes('behaviour')) return 'script'
  if (n.includes('load') || n.includes('resource') || n.includes('asset') || n.includes('bundle')) return 'loading'
  if (n.includes('animat') || n.includes('director') || n.includes('timeline')) return 'animation'
  return 'unknown'
}

/**
 * Detect spike frames for a single marker.
 * Spike = frame ms > median + 3*IQR AND > 2x median
 */
export function detectMarkerSpikes(marker: MarkerDataResult, maxSpikes: number = 5): SpikeInfo[] {
  if (marker.frames.length < 3 || marker.msMedian <= 0) return []

  const iqr = marker.msUpperQuartile - marker.msLowerQuartile
  const threshold = Math.max(
    marker.msMedian + 3 * iqr,
    marker.msMedian * 2
  )

  const spikes: SpikeInfo[] = []
  for (const frame of marker.frames) {
    if (frame.ms > threshold) {
      spikes.push({
        frameIndex: frame.frameIndex,
        ms: frame.ms,
        ratio: frame.ms / marker.msMedian,
        category: categorizeByName(marker.name),
        markerName: marker.name
      })
    }
  }

  return spikes.sort((a, b) => b.ms - a.ms).slice(0, maxSpikes)
}

/**
 * Detect spikes across all markers, return top N most severe.
 */
export function detectAllSpikes(markers: MarkerDataResult[], maxTotal: number = 20): SpikeInfo[] {
  const allSpikes: SpikeInfo[] = []

  for (const marker of markers) {
    // Skip very low-impact markers
    if (marker.msMedian < 0.1) continue
    const spikes = detectMarkerSpikes(marker, 3)
    allSpikes.push(...spikes)
  }

  // Sort by absolute ms (most severe first) and dedupe by frame
  allSpikes.sort((a, b) => b.ms - a.ms)

  // Dedupe: keep only the worst spike per frame
  const seenFrames = new Set<number>()
  const deduped: SpikeInfo[] = []
  for (const spike of allSpikes) {
    if (!seenFrames.has(spike.frameIndex)) {
      seenFrames.add(spike.frameIndex)
      deduped.push(spike)
    }
    if (deduped.length >= maxTotal) break
  }

  return deduped
}

/**
 * Classify a frame by its dominant cost category.
 */
export function classifyFrame(
  msFrame: number,
  budget: number = 33.33 // 30 FPS default
): 'normal' | 'warning' | 'critical' {
  if (msFrame > budget * 2) return 'critical'
  if (msFrame > budget * 1.2) return 'warning'
  return 'normal'
}
