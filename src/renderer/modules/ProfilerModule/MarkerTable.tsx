import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Table, Switch, Select, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useProfilerStore } from '@/store/profilerStore'
import { MarkerDataView } from '@/types/profiler'

// Hierarchy row type (from call-tree.ts treeToFlatRows)
interface HierarchyRow {
  key: string
  name: string
  depth: number
  msTotal: number
  msSelf: number
  percentOfFrame: number
  children?: HierarchyRow[]
}

const MarkerTable: React.FC = () => {
  const { analysisData, selectedMarker, setSelectedMarker, filters, selectedFrameRange, fullFrameTimeline } = useProfilerStore()
  const [tableHeight, setTableHeight] = useState(300)
  const roRef = useRef<ResizeObserver | null>(null)
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    if (!node) return
    // Immediately read height on mount
    const h = Math.max(80, Math.floor(node.getBoundingClientRect().height) - 39)
    setTableHeight(h)
    // Observe future resizes
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newH = Math.max(80, Math.floor(entry.contentRect.height) - 39)
        setTableHeight(newH)
      }
    })
    ro.observe(node)
    roRef.current = ro
  }, [])

  // View mode: flat (aggregated stats) or hierarchy (single frame call tree)
  const [viewMode, setViewMode] = useState<'flat' | 'hierarchy'>('flat')
  const [hierarchyFrame, setHierarchyFrame] = useState<number | null>(null)
  const [hierarchyData, setHierarchyData] = useState<{ rows: HierarchyRow[]; msFrame: number; threadName: string } | null>(null)
  const [hierarchyLoading, setHierarchyLoading] = useState(false)

  // Determine the default frame for hierarchy view
  const defaultHierarchyFrame = useMemo(() => {
    if (!analysisData) return null
    // If user selected a single frame, use that
    if (selectedFrameRange && selectedFrameRange[0] === selectedFrameRange[1]) {
      return selectedFrameRange[0]
    }
    // Otherwise use median frame
    return analysisData.frameSummary.medianFrameIndex
  }, [analysisData, selectedFrameRange])

  // Load call tree for a frame
  const loadCallTree = useCallback(async (frameIndex: number) => {
    setHierarchyLoading(true)
    try {
      const threadFilter = filters.threadFilter.length > 0 ? filters.threadFilter[0] : undefined
      const result = await window.electronAPI.profiler.getCallTree(frameIndex, threadFilter)
      if (result.success && result.data) {
        setHierarchyData({
          rows: result.data.rows,
          msFrame: result.data.msFrame,
          threadName: result.data.threadName
        })
        setHierarchyFrame(frameIndex)
      }
    } finally {
      setHierarchyLoading(false)
    }
  }, [filters.threadFilter])

  // When switching to hierarchy mode, load the default frame
  useEffect(() => {
    if (viewMode === 'hierarchy' && defaultHierarchyFrame !== null && hierarchyFrame === null) {
      loadCallTree(defaultHierarchyFrame)
    }
  }, [viewMode, defaultHierarchyFrame, hierarchyFrame, loadCallTree])

  // When selected frame range changes and we're in hierarchy mode with a single frame, update
  useEffect(() => {
    if (viewMode === 'hierarchy' && selectedFrameRange && selectedFrameRange[0] === selectedFrameRange[1]) {
      loadCallTree(selectedFrameRange[0])
    }
  }, [selectedFrameRange, viewMode, loadCallTree])

  // Navigate frames in hierarchy mode
  const navigateFrame = useCallback((delta: number) => {
    if (!fullFrameTimeline || hierarchyFrame === null) return
    const currentIdx = fullFrameTimeline.findIndex((p) => p.frameIndex === hierarchyFrame)
    if (currentIdx < 0) return
    const newIdx = Math.max(0, Math.min(fullFrameTimeline.length - 1, currentIdx + delta))
    const newFrame = fullFrameTimeline[newIdx].frameIndex
    loadCallTree(newFrame)
  }, [fullFrameTimeline, hierarchyFrame, loadCallTree])

  // Available frame options for quick jump
  const frameJumpOptions = useMemo(() => {
    if (!analysisData) return []
    const fs = analysisData.frameSummary
    const opts: { value: number; label: string }[] = []
    if (fs.medianFrameIndex >= 0) opts.push({ value: fs.medianFrameIndex, label: `Median (#${fs.medianFrameIndex})` })
    if (fs.maxFrameIndex >= 0) opts.push({ value: fs.maxFrameIndex, label: `Worst (#${fs.maxFrameIndex})` })
    if (fs.minFrameIndex >= 0) opts.push({ value: fs.minFrameIndex, label: `Best (#${fs.minFrameIndex})` })
    return opts
  }, [analysisData])

  // ---- Flat mode columns ----
  const flatColumns: ColumnsType<MarkerDataView> = useMemo(() => [
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 220, fixed: 'left',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string) => <span style={{ fontSize: 11, color: '#e2e8f0' }}>{name}</span>
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

  // ---- Hierarchy mode columns ----
  const hierarchyColumns: ColumnsType<HierarchyRow> = useMemo(() => [
    {
      title: 'Name', dataIndex: 'name', key: 'name', width: 300,
      render: (name: string) => <span style={{ fontSize: 11, color: '#e2e8f0' }}>{name}</span>
    },
    {
      title: 'Total (ms)', dataIndex: 'msTotal', key: 'msTotal', width: 100, align: 'right',
      sorter: (a: HierarchyRow, b: HierarchyRow) => a.msTotal - b.msTotal,
      defaultSortOrder: 'descend',
      render: (v: number) => <span style={{ color: '#8b5cf6', fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: 'Self (ms)', dataIndex: 'msSelf', key: 'msSelf', width: 90, align: 'right',
      sorter: (a: HierarchyRow, b: HierarchyRow) => a.msSelf - b.msSelf,
      render: (v: number) => <span style={{ color: v > 0.5 ? '#f59e0b' : '#64748b', fontSize: 11 }}>{v.toFixed(3)}</span>
    },
    {
      title: '%', dataIndex: 'percentOfFrame', key: 'percent', width: 70, align: 'right',
      sorter: (a: HierarchyRow, b: HierarchyRow) => a.percentOfFrame - b.percentOfFrame,
      render: (v: number) => {
        const color = v > 50 ? '#ef4444' : v > 20 ? '#f59e0b' : v > 5 ? '#8b5cf6' : '#64748b'
        return <span style={{ color, fontSize: 11, fontWeight: v > 20 ? 600 : 400 }}>{v.toFixed(1)}%</span>
      }
    },
    {
      title: 'Depth', dataIndex: 'depth', key: 'depth', width: 60, align: 'center',
      render: (v: number) => <span style={{ fontSize: 11, color: '#64748b' }}>{v}</span>
    }
  ], [])

  // Filter flat markers
  const filteredMarkers = useMemo(() => {
    if (!analysisData) return []
    let markers = analysisData.markers
    if (filters.nameFilter) {
      const lower = filters.nameFilter.toLowerCase()
      markers = markers.filter((m) => m.name.toLowerCase().includes(lower))
    }
    return markers
  }, [analysisData, filters.nameFilter])


  if (!analysisData) return null

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar: view mode toggle + hierarchy frame controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
        borderBottom: '1px solid rgba(124,58,237,0.1)', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>View:</span>
          <Switch
            size="small"
            checked={viewMode === 'hierarchy'}
            onChange={(checked) => {
              setViewMode(checked ? 'hierarchy' : 'flat')
              if (!checked) {
                setHierarchyFrame(null)
                setHierarchyData(null)
              }
            }}
            checkedChildren="Tree"
            unCheckedChildren="Flat"
          />
        </div>

        {viewMode === 'hierarchy' && hierarchyFrame !== null && (
          <>
            <div style={{ width: 1, height: 16, background: 'rgba(124,58,237,0.2)' }} />
            <Tooltip title="Previous frame">
              <span style={{ cursor: 'pointer', color: '#94a3b8', display: 'flex' }} onClick={() => navigateFrame(-1)}>
                <ChevronLeft size={14} />
              </span>
            </Tooltip>
            <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 100, textAlign: 'center' }}>
              Frame #{hierarchyFrame}
              {hierarchyData && <span style={{ color: '#64748b' }}> ({hierarchyData.msFrame.toFixed(1)}ms)</span>}
            </span>
            <Tooltip title="Next frame">
              <span style={{ cursor: 'pointer', color: '#94a3b8', display: 'flex' }} onClick={() => navigateFrame(1)}>
                <ChevronRight size={14} />
              </span>
            </Tooltip>
            <Select
              size="small"
              style={{ width: 130 }}
              placeholder="Jump to..."
              options={frameJumpOptions}
              value={null as any}
              onChange={(v) => { if (v !== null) loadCallTree(v) }}
            />
            {hierarchyData && (
              <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>
                {hierarchyData.threadName.split(':')[1] || hierarchyData.threadName}
              </span>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'flat' ? (
          <Table<MarkerDataView>
            dataSource={filteredMarkers}
            columns={flatColumns}
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
        ) : (
          <Table<HierarchyRow>
            dataSource={hierarchyData?.rows || []}
            columns={hierarchyColumns}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ y: tableHeight, x: 600 }}
            expandable={{
              defaultExpandAllRows: false,
              defaultExpandedRowKeys: hierarchyData?.rows?.slice(0, 3).map((r) => r.key) || [],
              childrenColumnName: 'children'
            }}
            loading={hierarchyLoading}
            style={{ fontSize: 11 }}
          />
        )}
      </div>
    </div>
  )
}

export default MarkerTable
