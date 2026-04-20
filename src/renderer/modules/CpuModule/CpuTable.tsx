import React, { useMemo } from 'react'
import { Table } from 'antd'
import { getMockCpuData } from '@/services/mockProvider'
import type { CpuData } from '@/types/analysis'

const columns = [
  {
    title: 'Process Name',
    dataIndex: 'processName',
    key: 'processName',
    render: (text: string) => <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{text}</span>
  },
  {
    title: 'CPU %',
    dataIndex: 'cpuPercent',
    key: 'cpuPercent',
    sorter: (a: CpuData, b: CpuData) => a.cpuPercent - b.cpuPercent,
    defaultSortOrder: 'descend' as const,
    render: (val: number) => {
      const color = val > 30 ? '#ef4444' : val > 15 ? '#f59e0b' : '#22c55e'
      return <span style={{ color, fontWeight: 600 }}>{val.toFixed(1)}%</span>
    }
  },
  {
    title: 'Threads',
    dataIndex: 'threads',
    key: 'threads',
    sorter: (a: CpuData, b: CpuData) => a.threads - b.threads
  },
  {
    title: 'Memory',
    dataIndex: 'memory',
    key: 'memory'
  },
  {
    title: 'PID',
    dataIndex: 'pid',
    key: 'pid'
  }
]

const CpuTable: React.FC = () => {
  const data = useMemo(() => getMockCpuData(), [])

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="pid"
      size="small"
      pagination={false}
      scroll={{ y: 300 }}
      style={{ background: 'transparent' }}
    />
  )
}

export default CpuTable
