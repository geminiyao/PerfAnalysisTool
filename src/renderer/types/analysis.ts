export interface TimelineDataPoint {
  timestamp: number
  value: number
  label?: string
}

export interface CpuData {
  processName: string
  cpuPercent: number
  threads: number
  memory: string
  pid: number
}

export interface MemoryRegion {
  regionName: string
  memorySize: number
  memorySizeStr: string
  memoryPercent: number
  leafNodes: number
  leafNodePercent: number
  count: number
  countPercent: number
  color: string
  children?: MemoryRegion[]
}

export interface FpsFrame {
  timestamp: number
  fps: number
  frameTime: number
  isJank: boolean
}

export interface PowerData {
  timestamp: number
  total: number
  cpu: number
  gpu: number
  network: number
  display: number
  other: number
}

export interface AnalysisSnapshot {
  moduleId: string
  timeRange: [number, number]
  timeline: TimelineDataPoint[]
  data: any
}
