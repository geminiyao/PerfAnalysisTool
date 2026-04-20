import React from 'react'
import { Collapse, InputNumber, Input, Checkbox } from 'antd'
import { useSessionStore } from '@/store/sessionStore'
import styles from './index.module.less'

const ConfigSection: React.FC = () => {
  const { config, updateConfig } = useSessionStore()

  return (
    <>
      <div className={styles.checkboxRow}>
        <Checkbox
          checked={config.enableMallocStack}
          onChange={(e) => updateConfig({ enableMallocStack: e.target.checked })}
        />
        <span>启用 malloc stack logging</span>
      </div>

      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'advanced',
            label: <span style={{ color: '#94a3b8', fontSize: 12 }}>更多选项（参数、环境变量等）</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className={styles.section}>
                  <div className={styles.label}>启动参数：</div>
                  <Input
                    placeholder="例如：-tracehost=127.0.0.1"
                    size="small"
                    value={config.startupArgs}
                    onChange={(e) => updateConfig({ startupArgs: e.target.value })}
                  />
                </div>
                <div className={styles.section}>
                  <div className={styles.label}>环境变量：</div>
                  <Input
                    placeholder="格式：key=value;key1=value1"
                    size="small"
                    value={config.envVariables}
                    onChange={(e) => updateConfig({ envVariables: e.target.value })}
                  />
                </div>
              </div>
            )
          }
        ]}
      />

      <div className={styles.section}>
        <div className={styles.label}>Footprint 采样周期：</div>
        <div className={styles.inlineInput}>
          <InputNumber
            size="small"
            min={100}
            max={10000}
            step={100}
            value={config.intervalMs}
            onChange={(val) => updateConfig({ intervalMs: val || 1000 })}
            style={{ flex: 1 }}
          />
          <span className={styles.unitLabel}>ms</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>DB 内存限制：</div>
        <div className={styles.inlineInput}>
          <InputNumber
            size="small"
            min={1}
            max={64}
            step={1}
            value={config.maxCacheGB}
            onChange={(val) => updateConfig({ maxCacheGB: val || 5 })}
            style={{ flex: 1 }}
          />
          <span className={styles.unitLabel}>GB</span>
        </div>
      </div>
    </>
  )
}

export default ConfigSection
