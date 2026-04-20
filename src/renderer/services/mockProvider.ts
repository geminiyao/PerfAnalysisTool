import { TimelineDataPoint, CpuData, MemoryRegion, FpsFrame, PowerData } from '@/types/analysis'

function generateTimeline(count: number, baseValue: number, variance: number): TimelineDataPoint[] {
  const data: TimelineDataPoint[] = []
  let value = baseValue
  for (let i = 0; i < count; i++) {
    value += (Math.random() - 0.48) * variance
    value = Math.max(baseValue * 0.3, Math.min(baseValue * 2.5, value))
    data.push({
      timestamp: Date.now() - (count - i) * 1000,
      value: Math.round(value * 100) / 100
    })
  }
  return data
}

export function getMockTimelineData(): TimelineDataPoint[] {
  return generateTimeline(120, 500, 80)
}

export function getMockCpuData(): CpuData[] {
  return [
    { processName: 'com.example.app', cpuPercent: 45.2, threads: 32, memory: '256 MB', pid: 1234 },
    { processName: 'RenderThread', cpuPercent: 22.8, threads: 8, memory: '128 MB', pid: 1235 },
    { processName: 'GpuProcess', cpuPercent: 18.5, threads: 4, memory: '512 MB', pid: 1236 },
    { processName: 'AudioService', cpuPercent: 5.1, threads: 2, memory: '32 MB', pid: 1237 },
    { processName: 'NetworkService', cpuPercent: 3.7, threads: 6, memory: '64 MB', pid: 1238 },
    { processName: 'SystemUI', cpuPercent: 2.4, threads: 12, memory: '96 MB', pid: 1239 },
    { processName: 'InputDispatcher', cpuPercent: 1.5, threads: 3, memory: '16 MB', pid: 1240 },
    { processName: 'SurfaceFlinger', cpuPercent: 0.8, threads: 4, memory: '48 MB', pid: 1241 }
  ]
}

export function getMockMemoryData(): MemoryRegion[] {
  return [
    { regionName: 'Total', memorySize: 497.76, memorySizeStr: '497.76 MB', memoryPercent: 100, leafNodes: 1054, leafNodePercent: 100, count: 581500, countPercent: 100, color: '#7c3aed', children: [] },
    { regionName: 'Network/URLSession', memorySize: 13.61, memorySizeStr: '13.61 MB', memoryPercent: 2.73, leafNodes: 77, leafNodePercent: 0.01, count: 69678, countPercent: 11.98, color: '#3b82f6' },
    { regionName: 'unfiltered', memorySize: 12.65, memorySizeStr: '12.65 MB', memoryPercent: 2.54, leafNodes: 1028, leafNodePercent: 97.58, count: 80375, countPercent: 13.82, color: '#64748b' },
    { regionName: 'Media Resources', memorySize: 8.04, memorySizeStr: '8.04 MB', memoryPercent: 1.62, leafNodes: 620, leafNodePercent: 0.06, count: 842, countPercent: 0.14, color: '#06b6d4' },
    { regionName: 'Render/MetalBuffer', memorySize: 8.02, memorySizeStr: '8.02 MB', memoryPercent: 1.61, leafNodes: 9, leafNodePercent: 0, count: 15, countPercent: 0, color: '#ec4899' },
    { regionName: 'System/Framework', memorySize: 7.20, memorySizeStr: '7.20 MB', memoryPercent: 1.45, leafNodes: 1498, leafNodePercent: 0.14, count: 99227, countPercent: 17.06, color: '#22c55e' },
    { regionName: 'UnityEngine/il2cpp', memorySize: 6.62, memorySizeStr: '6.62 MB', memoryPercent: 1.33, leafNodes: 620, leafNodePercent: 0.06, count: 12399, countPercent: 2.13, color: '#f59e0b' }
  ]
}

export function getMockFpsData(): FpsFrame[] {
  const data: FpsFrame[] = []
  for (let i = 0; i < 300; i++) {
    const fps = 55 + Math.random() * 10 - (Math.random() > 0.9 ? 20 : 0)
    data.push({
      timestamp: Date.now() - (300 - i) * 100,
      fps: Math.round(Math.max(15, fps)),
      frameTime: Math.round(1000 / Math.max(15, fps) * 100) / 100,
      isJank: fps < 40
    })
  }
  return data
}

export function getMockPowerData(): PowerData[] {
  const data: PowerData[] = []
  for (let i = 0; i < 120; i++) {
    const cpu = 1.2 + Math.random() * 0.8
    const gpu = 0.8 + Math.random() * 0.5
    const network = 0.2 + Math.random() * 0.3
    const display = 0.5 + Math.random() * 0.2
    const other = 0.1 + Math.random() * 0.1
    data.push({
      timestamp: Date.now() - (120 - i) * 1000,
      total: Math.round((cpu + gpu + network + display + other) * 100) / 100,
      cpu: Math.round(cpu * 100) / 100,
      gpu: Math.round(gpu * 100) / 100,
      network: Math.round(network * 100) / 100,
      display: Math.round(display * 100) / 100,
      other: Math.round(other * 100) / 100
    })
  }
  return data
}

export function getMockTreeMapData() {
  return [
    { name: 'DOTS/System...', value: 28.45, itemStyle: { color: '#7c3aed' } },
    { name: 'SDK', value: 22.41, itemStyle: { color: '#3b82f6' } },
    { name: 'Rend...', value: 20.8, itemStyle: { color: '#06b6d4' } },
    { name: 'TBUR...', value: 20.5, itemStyle: { color: '#22c55e' } },
    { name: 'Text...', value: 20.1, itemStyle: { color: '#f59e0b' } },
    { name: 'UnityEngine/il2Cpp', value: 80.99, itemStyle: { color: '#8b5cf6' } },
    { name: 'Media Resources', value: 27.0, itemStyle: { color: '#06b6d4' } },
    { name: 'DOTS/Sy...', value: 18.22, itemStyle: { color: '#a855f7' } },
    { name: 'Unit...', value: 14.6, itemStyle: { color: '#ec4899' } },
    { name: 'Net...', value: 13.5, itemStyle: { color: '#14b8a6' } },
    { name: 'un...', value: 12.1, itemStyle: { color: '#64748b' } },
    { name: 'Render/MetalBackbuffer', value: 25.0, itemStyle: { color: '#ef4444' } },
    { name: 'TBResManag...', value: 15.0, itemStyle: { color: '#f97316' } }
  ]
}
