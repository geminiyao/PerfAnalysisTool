import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { getMockTimelineData } from '@/services/mockProvider'

const OverviewModule: React.FC = () => {
  const metrics = useMemo(() => [
    { label: 'CPU 使用率', value: '45.2%', color: '#7c3aed', data: getMockTimelineData().slice(-30) },
    { label: '内存占用', value: '497 MB', color: '#06b6d4', data: getMockTimelineData().slice(-30) },
    { label: '帧率', value: '58 FPS', color: '#22c55e', data: getMockTimelineData().slice(-30) },
    { label: '功耗', value: '2.8 W', color: '#f59e0b', data: getMockTimelineData().slice(-30) }
  ], [])

  const getSparklineOption = (data: any[], color: string) => ({
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'line',
      data: data.map((d) => d.value),
      smooth: true,
      showSymbol: false,
      lineStyle: { color, width: 1.5 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: color + '40' },
          { offset: 1, color: color + '05' }
        ]}
      }
    }]
  })

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          style={{
            background: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            border: '1px solid var(--color-border)',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{metric.label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: metric.color }}>{metric.value}</span>
          </div>
          <div style={{ height: 60 }}>
            <ReactECharts option={getSparklineOption(metric.data, metric.color)} style={{ height: '100%' }} />
          </div>
        </div>
      ))}

      <div
        style={{
          gridColumn: '1 / -1',
          background: 'var(--color-bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          padding: 16,
          border: '1px solid var(--color-border)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 13
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          系统概览
        </div>
        <div>选择一个采集会话以查看详细性能数据</div>
      </div>
    </div>
  )
}

export default OverviewModule
