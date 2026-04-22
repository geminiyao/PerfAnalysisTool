import { create } from 'zustand'
import { ProfileAnalysisData, MarkerDataView, AiMessage } from '@/types/profiler'

interface ProfilerFilters {
  threadFilter: string[]
  depthFilter: number // -1 = all
  nameFilter: string
  selfTimes: boolean
  showRefLines: boolean
}

interface ProfilerState {
  // Data
  analysisData: ProfileAnalysisData | null
  fullFrameTimeline: ProfileAnalysisData['frameTimeline'] | null // always keeps full dataset for chart
  fullMarkers: MarkerDataView[] | null // always keeps full dataset markers for overlay curve
  fileName: string | null
  isLoading: boolean
  error: string | null

  // Selection
  selectedMarker: MarkerDataView | null
  selectedFrameRange: [number, number] | null

  // Filters
  filters: ProfilerFilters

  // AI
  aiMessages: AiMessage[]
  aiDrawerOpen: boolean
  aiLoading: boolean

  // Actions
  setAnalysisData: (data: ProfileAnalysisData, fileName: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSelectedMarker: (marker: MarkerDataView | null) => void
  setSelectedFrameRange: (range: [number, number] | null) => void
  setThreadFilter: (threads: string[]) => void
  setDepthFilter: (depth: number) => void
  setNameFilter: (name: string) => void
  setSelfTimes: (selfTimes: boolean) => void
  setShowRefLines: (show: boolean) => void
  setAiDrawerOpen: (open: boolean) => void
  addAiMessage: (msg: AiMessage) => void
  updateAiMessage: (id: string, content: string, isStreaming?: boolean) => void
  setAiLoading: (loading: boolean) => void
  clearData: () => void
}

export const useProfilerStore = create<ProfilerState>((set) => ({
  analysisData: null,
  fullFrameTimeline: null,
  fullMarkers: null,
  fileName: null,
  isLoading: false,
  error: null,
  selectedMarker: null,
  selectedFrameRange: null,
  filters: {
    threadFilter: [],
    depthFilter: -1,
    nameFilter: '',
    selfTimes: false,
    showRefLines: false
  },
  aiMessages: [],
  aiDrawerOpen: false,
  aiLoading: false,

  setAnalysisData: (data, fileName) =>
    set((state) => ({
      analysisData: data,
      fullFrameTimeline: state.fullFrameTimeline || data.frameTimeline,
      fullMarkers: state.fullMarkers || data.markers,
      fileName,
      error: null,
      selectedMarker: null,
      isLoading: false
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, isLoading: false }),

  setSelectedMarker: (marker) => set({ selectedMarker: marker }),

  setSelectedFrameRange: (range) => set({ selectedFrameRange: range }),

  setThreadFilter: (threads) =>
    set((state) => ({
      filters: { ...state.filters, threadFilter: threads }
    })),

  setDepthFilter: (depth) =>
    set((state) => ({
      filters: { ...state.filters, depthFilter: depth }
    })),

  setNameFilter: (name) =>
    set((state) => ({
      filters: { ...state.filters, nameFilter: name }
    })),

  setSelfTimes: (selfTimes) =>
    set((state) => ({
      filters: { ...state.filters, selfTimes }
    })),

  setShowRefLines: (show) =>
    set((state) => ({
      filters: { ...state.filters, showRefLines: show }
    })),

  setAiDrawerOpen: (open) => set({ aiDrawerOpen: open }),

  addAiMessage: (msg) =>
    set((state) => ({ aiMessages: [...state.aiMessages, msg] })),

  updateAiMessage: (id, content, isStreaming) =>
    set((state) => ({
      aiMessages: state.aiMessages.map((m) =>
        m.id === id ? { ...m, content, isStreaming: isStreaming ?? m.isStreaming } : m
      )
    })),

  setAiLoading: (loading) => set({ aiLoading: loading }),

  clearData: () =>
    set({
      analysisData: null,
      fullFrameTimeline: null,
      fullMarkers: null,
      fileName: null,
      error: null,
      selectedMarker: null,
      selectedFrameRange: null,
      aiMessages: []
    })
}))
