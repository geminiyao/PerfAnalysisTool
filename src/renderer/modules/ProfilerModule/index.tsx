import React, { useCallback, useEffect, useRef } from 'react'
import { Button, Select, Input, Switch, Spin, message } from 'antd'
import { FolderOpen, Brain, Download, Search } from 'lucide-react'
import { useProfilerStore } from '@/store/profilerStore'
import FrameTimeGraph from './FrameTimeGraph'
import FrameSummary from './FrameSummary'
import TopMarkers from './TopMarkers'
import MarkerTable from './MarkerTable'
import MarkerHistogram from './MarkerHistogram'
import ThreadSummary from './ThreadSummary'
import AiAnalysisPanel from './AiAnalysisPanel'

const ProfilerModule: React.FC = () => {
  const {
    analysisData, fileName, isLoading, error, selectedFrameRange,
    filters, setNameFilter, setSelfTimes, setDepthFilter, setThreadFilter, setShowRefLines,
    setAnalysisData, setLoading, setError, setAiDrawerOpen
  } = useProfilerStore()

  // Track if this is the first mount to avoid re-analyze on initial load
  const isFirstMount = useRef(true)

  // Unified reanalyze: always include both frame range and filter params
  const doReanalyze = useCallback(async (overrideFrameRange?: [number, number] | null) => {
    if (!analysisData && !useProfilerStore.getState().analysisData) return
    setLoading(true)
    const state = useProfilerStore.getState()
    const range = overrideFrameRange !== undefined ? overrideFrameRange : state.selectedFrameRange
    const f = state.filters
    const result = await window.electronAPI.profiler.reanalyze({
      frameRange: range || undefined,
      threadFilters: f.threadFilter.length > 0 ? f.threadFilter : undefined,
      depthFilter: f.depthFilter,
      selfTimes: f.selfTimes
    })
    if (result.success && result.data) {
      setAnalysisData(result.data, fileName || 'unknown')
    } else {
      setError(result.error || 'Reanalysis failed')
    }
  }, [analysisData, fileName, setAnalysisData, setLoading, setError])

  // Auto reanalyze when frame range changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (!analysisData) return
    doReanalyze(selectedFrameRange)
  }, [selectedFrameRange])

  const handleOpenFile = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.profiler.openFile()
    if (result.success && result.data) {
      setAnalysisData(result.data, result.fileName || 'unknown')
      message.success(`Loaded: ${result.fileName}`)
    } else if (result.error !== 'canceled') {
      setError(result.error || 'Unknown error')
      message.error(result.error || 'Failed to load file')
    } else {
      setLoading(false)
    }
  }, [setAnalysisData, setLoading, setError])

  const handleExportCsv = useCallback(async () => {
    const result = await window.electronAPI.profiler.exportCsv()
    if (result.success) {
      message.success(`Exported to: ${result.filePath}`)
    } else if (result.error !== 'canceled') {
      message.error(result.error || 'Export failed')
    }
  }, [])

  const handleReanalyze = useCallback(async () => {
    doReanalyze()
  }, [doReanalyze])

  const depthOptions = React.useMemo(() => {
    const opts = [{ value: -1, label: 'All Depths' }]
    if (analysisData) {
      for (let d = 1; d <= analysisData.frameSummary.maxMarkerDepth; d++) {
        opts.push({ value: d, label: `Depth ${d}` })
      }
    }
    return opts
  }, [analysisData])

  const threadOptions = React.useMemo(() => {
    if (!analysisData) return []
    return analysisData.threadNames.map((t) => ({ value: t, label: t.split(':')[1] || t }))
  }, [analysisData])

  if (!analysisData && !isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        <div style={{ fontSize: 48, opacity: 0.15, color: '#7c3aed' }}>
          <FolderOpen size={64} />
        </div>
        <div style={{ color: '#94a3b8', fontSize: 14 }}>No Profiler data loaded</div>
        <Button type="primary" icon={<FolderOpen size={14} />} onClick={handleOpenFile}
          style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', border: 'none' }}>
          Open .pdata File
        </Button>
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top Toolbar: Open + AI + CSV */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid rgba(124,58,237,0.2)', background: 'rgba(13,13,26,0.6)',
        flexShrink: 0
      }}>
        <Button size="small" icon={<FolderOpen size={12} />} onClick={handleOpenFile} loading={isLoading}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12 }}>
          Open
        </Button>
        {fileName && <span style={{ color: '#8b5cf6', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>}

        <div style={{ flex: 1 }} />

        <Button size="small" icon={<Brain size={12} />} onClick={() => setAiDrawerOpen(true)}
          style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', color: '#fff', border: 'none', fontSize: 12 }}>
          AI Analyze
        </Button>
        <Button size="small" icon={<Download size={12} />} onClick={handleExportCsv}
          style={{ fontSize: 12 }}>
          CSV
        </Button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Frame Time Graph */}
        <FrameTimeGraph />

        {/* Filter bar: below chart, above data panels */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
          borderBottom: '1px solid rgba(124,58,237,0.15)', background: 'rgba(13,13,26,0.3)',
          flexShrink: 0
        }}>
          <Select size="small" mode="multiple" placeholder="Threads" maxTagCount={1} allowClear
            style={{ minWidth: 140, maxWidth: 200 }} options={threadOptions}
            value={filters.threadFilter}
            onChange={(v) => setThreadFilter(v)}
            onDropdownVisibleChange={(open) => { if (!open) handleReanalyze() }} />

          <Select size="small" style={{ width: 110 }} options={depthOptions}
            value={filters.depthFilter} onChange={(v) => { setDepthFilter(v); setTimeout(handleReanalyze, 0) }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>Self:</span>
            <Switch size="small" checked={filters.selfTimes}
              onChange={(v) => { setSelfTimes(v); setTimeout(handleReanalyze, 0) }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>Ref Lines:</span>
            <Switch size="small" checked={filters.showRefLines}
              onChange={(v) => setShowRefLines(v)} />
          </div>

          <div style={{ flex: 1 }} />

          <Input prefix={<Search size={11} />} placeholder="Filter markers..." size="small"
            style={{ width: 180 }} value={filters.nameFilter}
            onChange={(e) => setNameFilter(e.target.value)} />
        </div>

        {/* Data panels */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

          {/* Loading overlay */}
          {isLoading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(13,13,26,0.6)', backdropFilter: 'blur(2px)'
            }}>
              <Spin size="large" tip="Analyzing..." />
            </div>
          )}

          {/* Top Markers bar */}
          <div style={{ height: 36, flexShrink: 0, borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
            <TopMarkers />
          </div>

          {/* Bottom section: Marker Table + right panel */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 65, overflow: 'hidden', borderRight: '1px solid rgba(124,58,237,0.15)' }}>
              <MarkerTable />
            </div>
            <div style={{ flex: 35, minWidth: 260, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ overflow: 'auto', borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
                <FrameSummary />
              </div>
              <div style={{ flex: 1, overflow: 'auto', borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
                <MarkerHistogram />
              </div>
              <div style={{ maxHeight: 160, overflow: 'auto' }}>
                <ThreadSummary />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* AI Analysis Drawer */}
      <AiAnalysisPanel />
    </div>
  )
}

export default ProfilerModule
