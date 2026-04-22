import React, { useMemo } from 'react'
import { Tooltip } from 'antd'
import { useProfilerStore } from '@/store/profilerStore'

const COLORS = ['#7c3aed', '#06b6d4', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']
const TOP_N = 10

const TopMarkers: React.FC = () => {
  const { analysisData, setSelectedMarker } = useProfilerStore()

  const topMarkers = useMemo(() => {
    if (!analysisData || analysisData.markers.length === 0) return []
    return analysisData.markers.slice(0, TOP_N)
  }, [analysisData])

  const totalMs = useMemo(() => {
    return topMarkers.reduce((sum, m) => sum + m.msMedian, 0)
  }, [topMarkers])

  if (!analysisData || topMarkers.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11 }}>
        No marker data
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#64748b', marginRight: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>Top {TOP_N}:</span>
      <div style={{ flex: 1, display: 'flex', height: 20, borderRadius: 3, overflow: 'hidden' }}>
        {topMarkers.map((m, i) => {
          const pct = totalMs > 0 ? (m.msMedian / totalMs) * 100 : 0
          if (pct < 0.5) return null
          return (
            <Tooltip key={m.name} title={`${m.name}: ${m.msMedian.toFixed(2)} ms (median)`}>
              <div
                style={{
                  width: `${pct}%`, minWidth: 2, height: '100%',
                  background: COLORS[i % COLORS.length],
                  cursor: 'pointer',
                  transition: 'opacity 0.2s, transform 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden'
                }}
                onClick={() => setSelectedMarker(m)}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                {pct > 8 && (
                  <span style={{ fontSize: 9, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 2px' }}>
                    {m.name.length > 12 ? m.name.slice(0, 12) + '..' : m.name}
                  </span>
                )}
              </div>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

export default TopMarkers
