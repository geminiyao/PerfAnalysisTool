export interface DeviceInfo {
  id: string
  name: string
  model: string
  osVersion: string
  platform: 'ios' | 'android' | 'desktop'
  isConnected: boolean
}

export interface AppInfo {
  id: string
  name: string
  bundleId: string
  icon?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
