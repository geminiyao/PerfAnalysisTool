import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { useProfilerStore } from '@/store/profilerStore'

const MarkerHistogram: React.FC = () => {
  const { selectedMarker } = useProfilerStore()

  const option = useMemo(() => {
    if (!selectedMarker || !selectedMarker.buckets) return null

    const m = selectedMarker
    const bucketCount = m.buckets.length
    const range = m.msMax - m.msMin
    const labels: string[] = []
    for (let i = 0; i < bucketCount; i++) {
      const lo = m.msMin + (range * i) / bucketCount
      const hi = m.msMin + (range * (i + 1)) / bucketCount
      labels.push(`${lo.toFixed(1)}-${hi.toFixed(1)}`)
    }

    return {
      backgroundColor: 'transparent',
      title: {
        text: m.name,
        subtext: `Median: ${m.msMedian.toFixed(3)}ms | Mean: ${m.msMean.toFixed(3)}ms`,
        left: 8, top: 4,
        textStyle: { color: '#e2e8f0', fontSize: 12, fontWeight: 600 },
        subtextStyle: { color: '#94a3b8', fontSize: 10 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(13,13,26,0.95)',
        borderColor: '#7c3aed',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.name} ms<br/>Frames: <b>${p.value}</b>`
        }
      },
      grid: { left: 40, right: 12, top: 52, bottom: 28 },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { color: '#64748b', fontSize: 8, rotate: 45 },
        axisLine: { lineStyle: { color: '#333' } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value', name: 'Frames',
        nameTextStyle: { color: '#64748b', fontSize: 9 },
        axisLabel: { color: '#64748b', fontSize: 9 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(124,58,237,0.1)' } }
      },
      series: [{
        type: 'bar', data: m.buckets,
        itemStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#7c3aed' }] },
          borderRadius: [2, 2, 0, 0]
        },
        barMaxWidth: 24
      }]
    }
  }, [selectedMarker])

  if (!selectedMarker) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11, padding: 16 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Marker Histogram</div>
        <div style={{ fontStyle: 'italic' }}>Select a marker from the table</div>
      </div>
    )
  }

  if (!option) return null

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 180 }}>
      <ReactEChartsCore option={option} style={{ width: '100%', height: '100%' }} notMerge lazyUpdate />
    </div>
  )
}

export default MarkerHistogram
