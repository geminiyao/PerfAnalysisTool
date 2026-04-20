import { create } from 'zustand'
import { SamplingConfig, SessionRecord, SessionStatus } from '@/types/session'

interface SessionState {
  status: SessionStatus
  config: SamplingConfig
  sessions: SessionRecord[]
  activeSessionId: string | null
  setStatus: (status: SessionStatus) => void
  updateConfig: (config: Partial<SamplingConfig>) => void
  setSessions: (sessions: SessionRecord[]) => void
  setActiveSession: (id: string | null) => void
  startSession: () => void
  stopSession: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle',
  config: {
    intervalMs: 1000,
    maxCacheGB: 5,
    enableMallocStack: true,
    startupArgs: '',
    envVariables: ''
  },
  sessions: [
    {
      id: '1',
      name: 'Run20',
      dataSize: '157 MB',
      duration: '1m50s',
      timestamp: '03-27 11:27:15',
      deviceName: 'iPhone 12 Pro Max',
      tags: ['memgraph']
    },
    {
      id: '2',
      name: 'Run19',
      dataSize: '89 MB',
      duration: '3m12s',
      timestamp: '03-27 10:15:42',
      deviceName: 'Pixel 7',
      tags: ['cpu', 'fps']
    },
    {
      id: '3',
      name: 'Run18',
      dataSize: '234 MB',
      duration: '5m30s',
      timestamp: '03-26 16:45:00',
      deviceName: 'Galaxy S24',
      tags: ['power']
    }
  ],
  activeSessionId: '1',
  setStatus: (status) => set({ status }),
  updateConfig: (partial) => set((state) => ({ config: { ...state.config, ...partial } })),
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  startSession: () => set({ status: 'running' }),
  stopSession: () => set({ status: 'stopped' })
}))
