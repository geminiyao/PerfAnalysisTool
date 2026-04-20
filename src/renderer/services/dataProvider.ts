import { DeviceInfo } from '@/types/device'
import { AnalysisSnapshot } from '@/types/analysis'

export interface DataProvider {
  connect(device: DeviceInfo): Promise<void>
  disconnect(): Promise<void>
  subscribe(moduleId: string, callback: (data: any) => void): () => void
  getSnapshot(moduleId: string, timeRange: [number, number]): Promise<AnalysisSnapshot>
}
