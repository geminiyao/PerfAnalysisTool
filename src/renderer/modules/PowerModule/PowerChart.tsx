import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { getMockPowerData } from '@/services/mockProvider'

const PowerChart: React.FC = () => {
  const data = useMemo(() => getMockPowerData(), [])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13, 13, 26, 0.95)',
      borderColor: 'rgba(124, 58, 237, 0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 12 }
    },
    legend: {
      data: ['CPU', 'GPU', '网络', '屏幕', '其他'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 0,
      right: 0
    },
    grid: { left: 50, right: 16, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: data.map((d) => {
        const date = new Date(d.timestamp)
        return `${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
      }),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: '#64748b', fontSize: 10, interval: 19 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: 'Watts',
      nameTextStyle: { color: '#64748b', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLabel: { color: '#64748b', fontSize: 10 }
    },
    series: [
      { name: 'CPU', type: 'line', stack: 'power', data: data.map((d) => d.cpu), smooth: true, showSymbol: false, areaStyle: { opacity: 0.6 }, lineStyle: { width: 1 }, itemStyle: { color: '#7c3aed' } },
      { name: 'GPU', type: 'line', stack: 'power', data: data.map((d) => d.gpu), smooth: true, showSymbol: false, areaStyle: { opacity: 0.6 }, lineStyle: { width: 1 }, itemStyle: { color: '#3b82f6' } },
      { name: '网络', type: 'line', stack: 'power', data: data.map((d) => d.network), smooth: true, showSymbol: false, areaStyle: { opacity: 0.6 }, lineStyle: { width: 1 }, itemStyle: { color: '#22c55e' } },
      { name: '屏幕', type: 'line', stack: 'power', data: data.map((d) => d.display), smooth: true, showSymbol: false, areaStyle: { opacity: 0.6 }, lineStyle: { width: 1 }, itemStyle: { color: '#f59e0b' } },
      { name: '其他', type: 'line', stack: 'power', data: data.map((d) => d.other), smooth: true, showSymbol: false, areaStyle: { opacity: 0.6 }, lineStyle: { width: 1 }, itemStyle: { color: '#64748b' } }
    ]
  }), [data])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
}

export default PowerChart
