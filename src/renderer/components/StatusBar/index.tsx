import React from 'react'
import { MonitorDot, HardDrive, Cpu, Info } from 'lucide-react'
import { useDeviceStore } from '@/store/deviceStore'
import styles from './index.module.less'

const StatusBar: React.FC = () => {
  const { connectionStatus } = useDeviceStore()
  const isConnected = connectionStatus === 'connected'

  return (
    <div className={styles.statusBar}>
      <div className={styles.left}>
        <div className={styles.statusItem}>
          <span
            className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`}
          />
          <span>{isConnected ? '已连接' : '未连接'}</span>
        </div>
        <div className={styles.separator} />
        <div className={styles.statusItem}>
          <MonitorDot size={12} />
          <span>PerfTrace 查看器</span>
        </div>
        <div className={styles.separator} />
        <div className={styles.statusItem}>
          <span>设备: 1</span>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.statusItem}>
          <HardDrive size={12} />
          <span>926.35 GB</span>
        </div>
        <div className={styles.statusItem}>
          <Cpu size={12} />
          <span>59%</span>
        </div>
        <div className={styles.separator} />
        <div className={styles.statusItem}>
          <Info size={12} />
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  )
}

export default StatusBar
