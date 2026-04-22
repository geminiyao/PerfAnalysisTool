import React from 'react'
import { useProfilerStore } from '@/store/profilerStore'

const statCards = [
  { key: 'count', label: 'Frame Count', color: '#7c3aed', getValue: (fs: any) => fs.count.toString() },
  { key: 'mean', label: 'Mean', color: '#f59e0b', getValue: (fs: any) => `${fs.msMean.toFixed(2)} ms` },
  { key: 'median', label: 'Median', color: '#3b82f6', getValue: (fs: any) => `${fs.msMedian.toFixed(2)} ms` },
  { key: 'min', label: 'Min', color: '#22c55e', getValue: (fs: any) => `${fs.msMin.toFixed(2)} ms` },
  { key: 'max', label: 'Max', color: '#ef4444', getValue: (fs: any) => `${fs.msMax.toFixed(2)} ms` },
  { key: 'lq', label: 'Lower Quartile', color: '#06b6d4', getValue: (fs: any) => `${fs.msLowerQuartile.toFixed(2)} ms` },
  { key: 'uq', label: 'Upper Quartile', color: '#8b5cf6', getValue: (fs: any) => `${fs.msUpperQuartile.toFixed(2)} ms` },
  { key: 'totalMarkers', label: 'Total Markers', color: '#ec4899', getValue: (fs: any) => fs.totalMarkers.toString() },
]

const FrameSummary: React.FC = () => {
  const { analysisData } = useProfilerStore()

  if (!analysisData) return null
  const fs = analysisData.frameSummary

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflow: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
        Frame Summary
      </div>
      {statCards.map((card) => (
        <div key={card.key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', borderRadius: 4,
          background: 'rgba(19,19,37,0.8)', border: '1px solid rgba(124,58,237,0.1)',
          transition: 'border-color 0.2s'
        }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = card.color)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.1)')}
        >
          <div style={{ width: 3, height: 24, borderRadius: 2, background: card.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{card.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: 'Roboto Mono, monospace' }}>
              {card.getValue(fs)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default FrameSummary
