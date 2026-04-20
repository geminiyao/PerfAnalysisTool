import React from 'react'
import FpsChart from './FpsChart'

const FpsModule: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-tertiary)'
      }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>帧率分析</span>
        <span>|</span>
        <span>FPS 曲线 + 帧时间分布（红色标记卡顿帧）</span>
      </div>

      <div style={{ flex: 1, padding: 12, overflow: 'hidden' }}>
        <FpsChart />
      </div>

      <div style={{
        display: 'flex', borderTop: '1px solid var(--color-border)', height: 120
      }}>
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            帧率统计
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flex: 1 }}>
            {[
              { label: '平均 FPS', value: '56.3', color: '#22c55e' },
              { label: '最低 FPS', value: '18', color: '#ef4444' },
              { label: '卡顿帧数', value: '23', color: '#f59e0b' },
              { label: '卡顿率', value: '7.6%', color: '#7c3aed' }
            ].map((item) => (
              <div key={item.label} style={{
                background: 'var(--color-bg-tertiary)', borderRadius: 6, padding: '8px 10px',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: item.color, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FpsModule
