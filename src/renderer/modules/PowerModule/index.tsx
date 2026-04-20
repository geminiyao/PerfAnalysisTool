import React from 'react'
import PowerChart from './PowerChart'

const PowerModule: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-tertiary)'
      }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>功耗分析</span>
        <span>|</span>
        <span>各子系统功耗分布（堆叠面积图）</span>
      </div>

      <div style={{ flex: 1, padding: 12, overflow: 'hidden' }}>
        <PowerChart />
      </div>

      <div style={{
        display: 'flex', borderTop: '1px solid var(--color-border)', height: 140
      }}>
        <div style={{
          flex: 1, padding: 12, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            功耗统计
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, flex: 1 }}>
            {[
              { label: '平均功耗', value: '2.8W', color: '#7c3aed' },
              { label: '峰值功耗', value: '4.2W', color: '#ef4444' },
              { label: '总能耗', value: '336J', color: '#f59e0b' },
              { label: 'CPU 均值', value: '1.6W', color: '#06b6d4' },
              { label: 'GPU 均值', value: '1.1W', color: '#3b82f6' },
              { label: '电池温度', value: '38.5°C', color: '#22c55e' }
            ].map((item) => (
              <div key={item.label} style={{
                background: 'var(--color-bg-tertiary)', borderRadius: 6, padding: '8px 10px',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PowerModule
