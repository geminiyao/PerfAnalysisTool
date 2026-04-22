import React from 'react'
import { useProfilerStore } from '@/store/profilerStore'

const ThreadSummary: React.FC = () => {
  const { analysisData } = useProfilerStore()

  if (!analysisData || analysisData.threads.length === 0) {
    return (
      <div style={{ padding: 8, color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>
        No thread data
      </div>
    )
  }

  const threads = analysisData.threads.filter((t) => t.msMedian > 0).sort((a, b) => b.msMedian - a.msMedian)

  return (
    <div style={{ padding: '4px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Thread Summary
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
            <th style={{ textAlign: 'left', padding: '2px 4px', color: '#64748b', fontWeight: 500 }}>Thread</th>
            <th style={{ textAlign: 'right', padding: '2px 4px', color: '#64748b', fontWeight: 500 }}>Median</th>
            <th style={{ textAlign: 'right', padding: '2px 4px', color: '#64748b', fontWeight: 500 }}>Min</th>
            <th style={{ textAlign: 'right', padding: '2px 4px', color: '#64748b', fontWeight: 500 }}>Max</th>
          </tr>
        </thead>
        <tbody>
          {threads.slice(0, 15).map((t) => (
            <tr key={t.threadNameWithIndex} style={{ borderBottom: '1px solid rgba(124,58,237,0.06)' }}>
              <td style={{ padding: '2px 4px', color: '#e2e8f0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.threadGroupName || t.threadNameWithIndex}
              </td>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: '#8b5cf6', fontFamily: 'Roboto Mono, monospace' }}>
                {t.msMedian.toFixed(2)}
              </td>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: '#22c55e', fontFamily: 'Roboto Mono, monospace' }}>
                {t.msMin.toFixed(2)}
              </td>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: '#ef4444', fontFamily: 'Roboto Mono, monospace' }}>
                {t.msMax.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ThreadSummary
