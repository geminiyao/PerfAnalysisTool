import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { getMockTreeMapData } from '@/services/mockProvider'

const MemoryTreeMap: React.FC = () => {
  const treeData = useMemo(() => getMockTreeMapData(), [])

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(13, 13, 26, 0.95)',
      borderColor: 'rgba(124, 58, 237, 0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) =>
        `<b>${params.name}</b><br/>Size: ${params.value.toFixed(2)} MB`
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
        fontSize: 10,
        fontWeight: 500,
        formatter: (params: any) => {
          if (params.value > 20) return `${params.name}\n${params.value.toFixed(1)} MB`
          return params.name
        }
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
      data: treeData
    }]
  }), [treeData])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
}

export default MemoryTreeMap
