import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { getMockFpsData } from '@/services/mockProvider'

const FpsChart: React.FC = () => {
  const data = useMemo(() => getMockFpsData(), [])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13, 13, 26, 0.95)',
      borderColor: 'rgba(124, 58, 237, 0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 12 }
    },
    legend: {
      data: ['FPS', '帧时间'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0, right: 0
    },
    grid: { left: 50, right: 50, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map((_, i) => i),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { show: false },
      axisTick: { show: false }
    },
    yAxis: [
      {
        type: 'value', name: 'FPS', min: 0, max: 65,
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      {
        type: 'value', name: 'ms', min: 0,
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 }
      }
    ],
    visualMap: {
      show: false,
      pieces: [
        { gt: 50, color: '#22c55e' },
        { gt: 30, lte: 50, color: '#f59e0b' },
        { lte: 30, color: '#ef4444' }
      ],
      seriesIndex: 0
    },
    series: [
      {
        name: 'FPS', type: 'line', data: data.map((d) => d.fps),
        smooth: true, showSymbol: false, lineStyle: { width: 2 },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: 'rgba(34, 197, 94, 0.2)' },
            { offset: 1, color: 'rgba(34, 197, 94, 0.02)' }
          ]}
        },
        markLine: {
          silent: true,
          data: [{ yAxis: 30, lineStyle: { color: '#ef4444', type: 'dashed' } }],
          label: { show: true, formatter: '卡顿线 30FPS', color: '#ef4444', fontSize: 10 }
        }
      },
      {
        name: '帧时间', type: 'bar', yAxisIndex: 1,
        data: data.map((d) => d.frameTime),
        barWidth: 1,
        itemStyle: {
          color: (params: any) => data[params.dataIndex]?.isJank ? '#ef4444' : 'rgba(124, 58, 237, 0.3)'
        }
      }
    ]
  }), [data])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
}

export default FpsChart
