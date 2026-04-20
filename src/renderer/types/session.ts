export interface SamplingConfig {
  intervalMs: number
  maxCacheGB: number
  enableMallocStack: boolean
  startupArgs: string
  envVariables: string
}

export interface SessionRecord {
  id: string
  name: string
  dataSize: string
  duration: string
  timestamp: string
  deviceName: string
  tags: string[]
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped'
