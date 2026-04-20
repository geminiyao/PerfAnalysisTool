import { create } from 'zustand'
import { DeviceInfo, AppInfo, ConnectionStatus } from '@/types/device'

interface DeviceState {
  devices: DeviceInfo[]
  selectedDevice: DeviceInfo | null
  apps: AppInfo[]
  selectedApp: AppInfo | null
  connectionStatus: ConnectionStatus
  setDevices: (devices: DeviceInfo[]) => void
  setSelectedDevice: (device: DeviceInfo | null) => void
  setApps: (apps: AppInfo[]) => void
  setSelectedApp: (app: AppInfo | null) => void
  setConnectionStatus: (status: ConnectionStatus) => void
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [
    { id: '1', name: 'iPhone 12 Pro Max (18.3.2)', model: 'iPhone 12 Pro Max', osVersion: '18.3.2', platform: 'ios', isConnected: true },
    { id: '2', name: 'Pixel 7 (Android 14)', model: 'Pixel 7', osVersion: '14', platform: 'android', isConnected: true },
    { id: '3', name: 'Galaxy S24 (Android 15)', model: 'Galaxy S24', osVersion: '15', platform: 'android', isConnected: false }
  ],
  selectedDevice: null,
  apps: [
    { id: '1', name: 'com.example.app', bundleId: 'com.example.app' },
    { id: '2', name: 'com.game.demo', bundleId: 'com.game.demo' },
    { id: '3', name: 'com.browser.test', bundleId: 'com.browser.test' }
  ],
  selectedApp: null,
  connectionStatus: 'disconnected',
  setDevices: (devices) => set({ devices }),
  setSelectedDevice: (device) => set({ selectedDevice: device }),
  setApps: (apps) => set({ apps }),
  setSelectedApp: (app) => set({ selectedApp: app }),
  setConnectionStatus: (status) => set({ connectionStatus: status })
}))
