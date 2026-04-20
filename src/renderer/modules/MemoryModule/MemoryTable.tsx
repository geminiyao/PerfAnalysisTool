import React, { useMemo } from 'react'
import { Table } from 'antd'
import { getMockMemoryData } from '@/services/mockProvider'
import type { MemoryRegion } from '@/types/analysis'

const columns = [
  {
    title: 'Region Name',
    dataIndex: 'regionName',
    key: 'regionName',
    render: (text: string, record: MemoryRegion) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: record.color, flexShrink: 0 }} />
        <span style={{ color: '#e2e8f0', fontWeight: record.regionName === 'Total' ? 700 : 400 }}>{text}</span>
      </div>
    )
  },
  {
    title: 'Memory Size',
    dataIndex: 'memorySizeStr',
    key: 'memorySizeStr',
    sorter: (a: MemoryRegion, b: MemoryRegion) => a.memorySize - b.memorySize
  },
  {
    title: 'Memory %',
    dataIndex: 'memoryPercent',
    key: 'memoryPercent',
    render: (val: number) => `${val.toFixed(2)}%`,
    sorter: (a: MemoryRegion, b: MemoryRegion) => a.memoryPercent - b.memoryPercent
  },
  {
    title: 'Leaf Nodes',
    dataIndex: 'leafNodes',
    key: 'leafNodes',
    sorter: (a: MemoryRegion, b: MemoryRegion) => a.leafNodes - b.leafNodes
  },
  {
    title: 'Leaf Node %',
    dataIndex: 'leafNodePercent',
    key: 'leafNodePercent',
    render: (val: number) => `${val.toFixed(2)}%`
  },
  {
    title: 'Count',
    dataIndex: 'count',
    key: 'count',
    render: (val: number) => val.toLocaleString(),
    sorter: (a: MemoryRegion, b: MemoryRegion) => a.count - b.count
  },
  {
    title: 'Count %',
    dataIndex: 'countPercent',
    key: 'countPercent',
    render: (val: number) => `${val.toFixed(2)}%`
  }
]

const MemoryTable: React.FC = () => {
  const data = useMemo(() => getMockMemoryData(), [])

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="regionName"
      size="small"
      pagination={false}
      scroll={{ y: 260 }}
    />
  )
}

export default MemoryTable
