import { create } from 'zustand'
import { TimelineDataPoint } from '@/types/analysis'

interface AnalysisState {
  activeTab: string
  timelineData: Record<string, TimelineDataPoint[]>
  selectedTimeRange: [number, number] | null
  setActiveTab: (tab: string) => void
  setTimelineData: (moduleId: string, data: TimelineDataPoint[]) => void
  setSelectedTimeRange: (range: [number, number] | null) => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  activeTab: 'overview',
  timelineData: {},
  selectedTimeRange: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTimelineData: (moduleId, data) =>
    set((state) => ({
      timelineData: { ...state.timelineData, [moduleId]: data }
    })),
  setSelectedTimeRange: (range) => set({ selectedTimeRange: range })
}))
