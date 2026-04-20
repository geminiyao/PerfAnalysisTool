import React, { useState } from 'react'
import { Activity, Wrench, RefreshCw, Settings, Minus, Square, X } from 'lucide-react'
import styles from './index.module.less'

const TitleBar: React.FC = () => {
  const [activeNav, setActiveNav] = useState<'capture' | 'toolbox'>('capture')

  const handleMinimize = () => window.electronAPI?.window.minimize()
  const handleMaximize = () => window.electronAPI?.window.maximize()
  const handleClose = () => window.electronAPI?.window.close()

  return (
    <div className={styles.titleBar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>P</div>
        <span className={styles.logoText}>PerfAnalysis</span>
      </div>

      <div className={styles.navButtons}>
        <button
          className={`${styles.navBtn} ${activeNav === 'capture' ? styles.navBtnActive : ''}`}
          onClick={() => setActiveNav('capture')}
        >
          <Activity size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          性能采集
        </button>
        <button
          className={`${styles.navBtn} ${activeNav === 'toolbox' ? styles.navBtnActive : ''}`}
          onClick={() => setActiveNav('toolbox')}
        >
          <Wrench size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          工具箱
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.toolButtons}>
        <button className={styles.toolBtn} title="刷新">
          <RefreshCw size={15} />
        </button>
        <button className={styles.toolBtn} title="设置">
          <Settings size={15} />
        </button>
      </div>

      <div className={styles.windowControls}>
        <button className={styles.winBtn} onClick={handleMinimize} title="最小化">
          <Minus size={14} />
        </button>
        <button className={styles.winBtn} onClick={handleMaximize} title="最大化">
          <Square size={12} />
        </button>
        <button className={`${styles.winBtn} ${styles.winBtnClose}`} onClick={handleClose} title="关闭">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar
