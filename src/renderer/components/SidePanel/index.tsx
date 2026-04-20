import React, { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { useDeviceStore } from '@/store/deviceStore'
import DeviceSelector from './DeviceSelector'
import ConfigSection from './ConfigSection'
import SessionList from './SessionList'
import styles from './index.module.less'

const SidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'perf' | 'allocation'>('perf')
  const { status, startSession, stopSession } = useSessionStore()
  const { setConnectionStatus } = useDeviceStore()
  const isRunning = status === 'running'

  const handleToggleSession = () => {
    if (isRunning) {
      stopSession()
      setConnectionStatus('disconnected')
    } else {
      startSession()
      setConnectionStatus('connected')
    }
  }

  return (
    <div className={styles.sidePanel}>
      <div className={styles.tabHeader}>
        <button
          className={`${styles.tab} ${activeTab === 'perf' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('perf')}
        >
          Performance
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'allocation' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('allocation')}
        >
          Allocation
        </button>
      </div>

      <div className={styles.scrollArea}>
        <DeviceSelector />
        <ConfigSection />

        <button
          className={`${styles.startButton} ${isRunning ? styles.stopButton : ''}`}
          onClick={handleToggleSession}
        >
          {isRunning ? (
            <>
              <Square size={14} /> 停止
            </>
          ) : (
            <>
              <Play size={14} /> 启动
            </>
          )}
        </button>

        <SessionList />
      </div>
    </div>
  )
}

export default SidePanel
