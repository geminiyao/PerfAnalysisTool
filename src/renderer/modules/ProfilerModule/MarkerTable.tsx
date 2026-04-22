import React, { useMemo, useRef, useState, useEffect } from 'react'
import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useProfilerStore } from '@/store/profilerStore'
import { MarkerDataView } from '@/types/profiler'

const MarkerTable: React.FC = () => {
  const { analysisData, selectedMarker, setSelectedMarker, filters } = useProfilerStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tableHeight, setTableHeight] = useState(300)

  const filteredMarkers = useMemo(() => {
    if (!analysisData) return []
    let markers = analysisData.markers
    if (filters.nameFilter) {
      const lower = filters.nameFilter.toLowerCase()
      markers = markers.filter((m) => m.name.toLowerCase().includes(lower))
    }
    return markers
  }, [analysisData, filters.nameFilter])

  const columns: ColumnsType<MarkerDataView> = useMemo(() => [
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 220, fixed: 'left',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => (
        <span style={{ fontSize: 11, color: '#e2e8f0' }}>{name}</span>
      )
    },
    {
      title: 'Median (ms)', dataIndex: 'msMedian', key: 'msMedian', width: 100, align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.msMedian - b.msMedian,
      render: (v: number) => <span style={{ color: '#8b5cf6', fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: 'Mean (ms)', dataIndex: 'msMean', key: 'msMean', width: 100, align: 'right',
      sorter: (a, b) => a.msMean - b.msMean,
      render: (v: number) => <span style={{ fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: 'Min (ms)', dataIndex: 'msMin', key: 'msMin', width: 90, align: 'right',
      sorter: (a, b) => a.msMin - b.msMin,
      render: (v: number) => <span style={{ color: '#22c55e', fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: 'Max (ms)', dataIndex: 'msMax', key: 'msMax', width: 90, align: 'right',
      sorter: (a, b) => a.msMax - b.msMax,
      render: (v: number) => <span style={{ color: '#ef4444', fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: 'Count', dataIndex: 'count', key: 'count', width: 80, align: 'right',
      sorter: (a, b) => a.count - b.count,
      render: (v: number) => <span style={{ fontSize: 11 }}>{v}</span>
    },
    {
      title: 'Total (ms)', dataIndex: 'msTotal', key: 'msTotal', width: 100, align: 'right',
      sorter: (a, b) => a.msTotal - b.msTotal,
      render: (v: number) => <span style={{ fontSize: 11 }}>{v.toFixed(2)}</span>
    },
    {
      title: 'Depth', key: 'depth', width: 60, align: 'center',
      sorter: (a, b) => a.minDepth - b.minDepth,
      render: (_: any, r: MarkerDataView) => (
        <span style={{ fontSize: 11 }}>{r.minDepth === r.maxDepth ? r.minDepth : `${r.minDepth}-${r.maxDepth}`}</span>
      )
    },
    {
      title: 'Frames', dataIndex: 'presentOnFrameCount', key: 'frames', width: 70, align: 'right',
      sorter: (a, b) => a.presentOnFrameCount - b.presentOnFrameCount,
      render: (v: number) => <span style={{ fontSize: 11 }}>{v}</span>
    },
    {
      title: 'Thread', key: 'thread', width: 120,
      render: (_: any, r: MarkerDataView) => (
        <span style={{ fontSize: 10, color: '#64748b' }}>{r.threads[0]?.split(':')[1] || '-'}</span>
      )
    }
  ], [])

  // Dynamically measure container height for table scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Subtract ~40px for table header
        const h = Math.max(100, Math.floor(entry.contentRect.height) - 40)
        setTableHeight(h)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!analysisData) return null

  return (
    <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }}>
      <Table<MarkerDataView>
        dataSource={filteredMarkers}
        columns={columns}
        rowKey="name"
        size="small"
        pagination={false}
        scroll={{ y: tableHeight, x: 1000 }}
        sticky
        virtual
        onRow={(record) => ({
          onClick: () => setSelectedMarker(selectedMarker?.name === record.name ? null : record),
          style: {
            cursor: 'pointer',
            background: selectedMarker?.name === record.name ? 'rgba(6,182,212,0.12)' : undefined,
            borderLeft: selectedMarker?.name === record.name ? '2px solid #06b6d4' : '2px solid transparent'
          }
        })}
        style={{ fontSize: 11 }}
      />
    </div>
  )
}

export default MarkerTable
