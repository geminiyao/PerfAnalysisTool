import React from 'react'
import { Select } from 'antd'
import { useDeviceStore } from '@/store/deviceStore'
import styles from './index.module.less'

const DeviceSelector: React.FC = () => {
  const { devices, selectedDevice, apps, selectedApp, setSelectedDevice, setSelectedApp } = useDeviceStore()

  return (
    <>
      <div className={styles.section}>
        <div className={styles.label}>
          <span className={styles.required}>*</span> 设备：
        </div>
        <Select
          placeholder="请选择设备"
          value={selectedDevice?.id}
          onChange={(val) => {
            const device = devices.find((d) => d.id === val)
            setSelectedDevice(device || null)
          }}
          options={devices.map((d) => ({
            value: d.id,
            label: d.name
          }))}
          style={{ width: '100%' }}
          size="small"
        />
      </div>

      <div className={styles.section}>
        <div className={styles.label}>
          <span className={styles.required}>*</span> 应用：
        </div>
        <Select
          placeholder="请选择应用"
          value={selectedApp?.id}
          onChange={(val) => {
            const app = apps.find((a) => a.id === val)
            setSelectedApp(app || null)
          }}
          options={apps.map((a) => ({
            value: a.id,
            label: a.name
          }))}
          style={{ width: '100%' }}
          size="small"
        />
      </div>

      <div className={styles.section}>
        <div className={styles.label}>符号：</div>
        <Select placeholder="选择符号" style={{ width: '100%' }} size="small" />
      </div>

      <div className={styles.section}>
        <div className={styles.label}>标签：</div>
        <Select placeholder="选择或创建标签" mode="tags" style={{ width: '100%' }} size="small" />
      </div>
    </>
  )
}

export default DeviceSelector
