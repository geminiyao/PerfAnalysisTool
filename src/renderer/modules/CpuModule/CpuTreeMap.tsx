import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { getMockCpuData } from '@/services/mockProvider'

const CpuTreeMap: React.FC = () => {
  const cpuData = useMemo(() => getMockCpuData(), [])
  const colors = ['#7c3aed', '#06b6d4', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#64748b']

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(13, 13, 26, 0.95)',
      borderColor: 'rgba(124, 58, 237, 0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) =>
        `<b>${params.name}</b><br/>CPU: ${params.value.toFixed(1)}%`
    },
    series: [{
      type: 'treemap',
      width: '100%',
      height: '100%',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      label: {
        show: true,
        color: '#e2e8f0',
        fontSize: 11,
        fontWeight: 500,
        formatter: '{b}\n{c}%'
      },
      itemStyle: {
        borderColor: '#0d0d1a',
        borderWidth: 2,
        gapWidth: 2
      },
      levels: [{
        itemStyle: { borderColor: '#0d0d1a', borderWidth: 3, gapWidth: 3 },
        upperLabel: { show: false }
      }],
      data: cpuData.map((d, i) => ({
        name: d.processName,
        value: d.cpuPercent,
        itemStyle: { color: colors[i % colors.length] }
      }))
    }]
  }), [cpuData])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
}

export default CpuTreeMap
