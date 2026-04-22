import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { useProfilerStore } from '@/store/profilerStore'

function computeTimelineStats(timeline: { frameIndex: number; ms: number }[]) {
  if (!timeline || timeline.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, q1: 0, q3: 0, count: 0 }
  }
  const sorted = timeline.map((p) => p.ms).sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    min: sorted[0], max: sorted[n - 1], mean: sum / n,
    median: sorted[Math.floor(n * 0.5)],
    q1: sorted[Math.floor(n * 0.25)],
    q3: sorted[Math.floor(n * 0.75)],
    count: n
  }
}

const FrameTimeGraph: React.FC = () => {
  const { analysisData, filters, selectedFrameRange, setSelectedFrameRange,
    fullFrameTimeline, selectedMarker, fullMarkers } = useProfilerStore()
  const showRefLines = filters.showRefLines

  const fixedStats = useMemo(() => {
    if (!fullFrameTimeline) return null
    return computeTimelineStats(fullFrameTimeline)
  }, [fullFrameTimeline])

  // Live drag range (during drag, before mouseup)
  const [dragRange, setDragRange] = useState<[number, number] | null>(null)

  // The active visual range: dragRange takes priority, then selectedFrameRange
  const activeRange = dragRange || selectedFrameRange

  // Build marker overlay data from FULL markers (not the reanalyzed subset)
  const markerOverlayData = useMemo(() => {
    if (!selectedMarker || !fullFrameTimeline || !fullMarkers) return null
    // Find the same marker by name in fullMarkers
    const fullMarker = fullMarkers.find((m) => m.name === selectedMarker.name)
    if (!fullMarker) return null
    const frameMap = new Map<number, number>()
    for (const f of fullMarker.frames) {
      frameMap.set(f.frameIndex, f.ms)
    }
    return fullFrameTimeline.map((p) => frameMap.get(p.frameIndex) ?? null)
  }, [selectedMarker, fullFrameTimeline, fullMarkers])

  const option = useMemo(() => {
    if (!fullFrameTimeline || !fixedStats) return {}

    const timeline = fullFrameTimeline
    const xData = timeline.map((p) => p.frameIndex)
    const yData = timeline.map((p) => p.ms)

    const iqr = fixedStats.q3 - fixedStats.q1
    const yMaxVisible = Math.ceil(fixedStats.q3 + 3 * iqr)
    const yMax = Math.max(yMaxVisible, Math.ceil(fixedStats.mean * 3), 50)

    // --- Ref lines (Median / Mean) ---
    const refLineData: any[] = []
    if (showRefLines) {
      refLineData.push({
        yAxis: fixedStats.median,
        lineStyle: { color: 'rgba(59,130,246,0.5)', type: 'dashed', width: 1 },
        label: { formatter: `Median ${fixedStats.median.toFixed(1)}ms`, color: '#3b82f6', fontSize: 9, position: 'insideStartTop', rotate: 0 },
        symbol: ['none', 'none']
      })
      refLineData.push({
        yAxis: fixedStats.mean,
        lineStyle: { color: 'rgba(245,158,11,0.5)', type: 'dashed', width: 1 },
        label: { formatter: `Mean ${fixedStats.mean.toFixed(1)}ms`, color: '#f59e0b', fontSize: 9, position: 'insideStartTop', rotate: 0 },
        symbol: ['none', 'none']
      })
    }

    // --- Selection markLine + markArea ---
    const selMarkLines: any[] = []
    const selMarkAreas: any[] = []

    if (activeRange) {
      const [sf, ef] = activeRange
      if (sf === ef) {
        // Single frame vertical line
        const frameMs = timeline.find((p) => p.frameIndex === sf)?.ms
        const fps = frameMs && frameMs > 0 ? (1000 / frameMs).toFixed(0) : '-'
        const labelText = frameMs !== undefined ? `Frame ${sf}  ${frameMs.toFixed(1)}ms  ${fps}FPS` : `Frame ${sf}`
        const idx = xData.indexOf(sf)
        const nearRight = idx >= 0 && idx > timeline.length * 0.75
        selMarkLines.push({
          xAxis: sf,
          lineStyle: { color: '#22d3ee', width: 1.5, type: 'solid' },
          label: {
            show: true, formatter: labelText, color: '#22d3ee', fontSize: 10, rotate: 0,
            position: 'insideEndTop',
            align: nearRight ? 'right' : 'left',
            distance: nearRight ? -8 : 8,
            backgroundColor: 'rgba(13,13,26,0.92)', padding: [3, 8], borderRadius: 3,
            borderColor: 'rgba(34,211,238,0.3)', borderWidth: 1
          },
          symbol: ['none', 'none']
        })
      } else {
        // Range: two lines + area
        const lo = Math.min(sf, ef)
        const hi = Math.max(sf, ef)
        const nearRightHi = xData.indexOf(hi) > timeline.length * 0.75
        selMarkLines.push({
          xAxis: lo,
          lineStyle: { color: '#22d3ee', width: 1, type: 'solid' },
          label: { show: false },
          symbol: ['none', 'none']
        })
        selMarkLines.push({
          xAxis: hi,
          lineStyle: { color: '#22d3ee', width: 1, type: 'solid' },
          label: {
            show: true, formatter: `Frame ${lo} ~ ${hi}`, color: '#22d3ee', fontSize: 10, rotate: 0,
            position: 'insideEndTop',
            align: nearRightHi ? 'right' : 'left',
            distance: nearRightHi ? -8 : 8,
            backgroundColor: 'rgba(13,13,26,0.92)', padding: [3, 8], borderRadius: 3,
            borderColor: 'rgba(34,211,238,0.3)', borderWidth: 1
          },
          symbol: ['none', 'none']
        })
        selMarkAreas.push([
          { xAxis: lo, itemStyle: { color: 'rgba(34,211,238,0.08)' } },
          { xAxis: hi }
        ])
      }
    }

    const allMarkLines = [...refLineData, ...selMarkLines]

    // --- Series ---
    const seriesList: any[] = [
      {
        name: 'Frame Time',
        type: 'line', data: yData,
        smooth: true, symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { color: '#7c3aed', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(124, 58, 237, 0.3)' },
              { offset: 1, color: 'rgba(124, 58, 237, 0.02)' }
            ]
          }
        },
        markLine: allMarkLines.length > 0 ? { silent: true, animation: false, data: allMarkLines } : undefined,
        markArea: selMarkAreas.length > 0 ? { silent: true, animation: false, data: selMarkAreas } : undefined,
        large: true, largeThreshold: 500,
        z: 1
      }
    ]

    // Marker overlay series (when a marker is selected in table)
    if (markerOverlayData) {
      seriesList.push({
        name: selectedMarker?.name || 'Selected Marker',
        type: 'line', data: markerOverlayData,
        smooth: true, symbol: 'none', showSymbol: false,
        lineStyle: { color: '#f59e0b', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.01)' }
            ]
          }
        },
        connectNulls: false,
        z: 2
      })
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 50, right: 20, top: 20, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(13, 13, 26, 0.95)',
        borderColor: 'rgba(124, 58, 237, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: any) => {
          let html = ''
          for (const p of params) {
            if (p.value == null) continue
            if (p.seriesIndex === 0) {
              const fps = p.value > 0 ? (1000 / p.value).toFixed(1) : '-'
              html += `<div style="font-size:11px;color:#94a3b8">Frame ${p.axisValue}</div>
                       <div style="font-weight:600;color:#e2e8f0">${p.value.toFixed(2)} ms  (${fps} FPS)</div>`
            } else {
              html += `<div style="font-size:10px;color:#f59e0b;margin-top:4px">${p.seriesName}: ${p.value.toFixed(2)} ms</div>`
            }
          }
          return html
        }
      },
      legend: markerOverlayData ? {
        show: true, top: 0, right: 0,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        itemWidth: 16, itemHeight: 2
      } : { show: false },
      xAxis: {
        type: 'category', data: xData,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: {
          color: '#64748b', fontSize: 10,
          interval: (index: number) => {
            return xData[index] % 50 === 0
          }
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value', name: 'ms', min: 0, max: yMax,
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      dataZoom: [{
        type: 'slider', height: 18, bottom: 6,
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(13, 13, 26, 0.8)',
        fillerColor: 'rgba(124, 58, 237, 0.15)',
        handleStyle: { color: '#7c3aed', borderColor: '#7c3aed' },
        textStyle: { color: '#64748b', fontSize: 10 },
        dataBackground: {
          lineStyle: { color: 'rgba(124, 58, 237, 0.3)' },
          areaStyle: { color: 'rgba(124, 58, 237, 0.08)' }
        }
      }],
      series: seriesList
    }
  }, [fullFrameTimeline, fixedStats, showRefLines, activeRange, markerOverlayData, selectedMarker])

  // --- Mouse interaction for click/drag selection ---
  const chartInstance = useRef<any>(null)
  const mouseState = useRef<{ downX: number; downY: number; downTime: number; downDataIdx: number } | null>(null)

  const pixelToDataIndex = useCallback((offsetX: number, offsetY: number): number | null => {
    const chart = chartInstance.current
    if (!chart) return null
    const tl = useProfilerStore.getState().fullFrameTimeline
    if (!tl) return null
    let pt: number[] | null = null
    try { pt = chart.convertFromPixel({ seriesIndex: 0 }, [offsetX, offsetY]) } catch { return null }
    if (!pt) return null
    const idx = Math.round(pt[0])
    if (idx < 0 || idx >= tl.length) return null
    try {
      const grid = chart.getModel().getComponent('grid', 0)
      if (grid) {
        const r = grid.coordinateSystem?.getRect()
        if (r && (offsetX < r.x || offsetX > r.x + r.width || offsetY < r.y || offsetY > r.y + r.height)) return null
      }
    } catch {}
    return idx
  }, [])

  const bindInteraction = useCallback(() => {
    const chart = chartInstance.current
    if (!chart) return
    const zr = chart.getZr()
    zr.off('mousedown')
    zr.off('mousemove')
    zr.off('mouseup')

    zr.on('mousedown', (e: any) => {
      const idx = pixelToDataIndex(e.offsetX, e.offsetY)
      if (idx === null) return
      mouseState.current = { downX: e.offsetX, downY: e.offsetY, downTime: Date.now(), downDataIdx: idx }
    })

    zr.on('mousemove', (e: any) => {
      if (!mouseState.current) return
      const dx = Math.abs(e.offsetX - mouseState.current.downX)
      if (dx <= 8) return
      const tl = useProfilerStore.getState().fullFrameTimeline
      if (!tl) return
      const curIdx = pixelToDataIndex(e.offsetX, e.offsetY)
      if (curIdx === null) return
      const sf = tl[mouseState.current.downDataIdx]?.frameIndex
      const ef = tl[curIdx]?.frameIndex
      if (sf !== undefined && ef !== undefined) {
        setDragRange([Math.min(sf, ef), Math.max(sf, ef)])
      }
    })

    zr.on('mouseup', (e: any) => {
      if (!mouseState.current) return
      const dx = Math.abs(e.offsetX - mouseState.current.downX)
      const dt = Date.now() - mouseState.current.downTime
      const downDataIdx = mouseState.current.downDataIdx
      mouseState.current = null
      setDragRange(null)

      const tl = useProfilerStore.getState().fullFrameTimeline
      if (!tl) return

      if (dx > 8) {
        const curIdx = pixelToDataIndex(e.offsetX, e.offsetY)
        if (curIdx !== null) {
          const lo = Math.min(downDataIdx, curIdx)
          const hi = Math.max(downDataIdx, curIdx)
          const sf = tl[lo]?.frameIndex
          const ef = tl[hi]?.frameIndex
          if (sf !== undefined && ef !== undefined) {
            useProfilerStore.getState().setSelectedFrameRange([sf, ef])
          }
        }
      } else if (dt < 500) {
        const fi = tl[downDataIdx]?.frameIndex
        if (fi !== undefined) {
          useProfilerStore.getState().setSelectedFrameRange([fi, fi])
        }
      }
    })
  }, [pixelToDataIndex])

  const onChartReady = useCallback((instance: any) => {
    chartInstance.current = instance
    bindInteraction()
  }, [bindInteraction])

  useEffect(() => {
    bindInteraction()
    return () => {
      if (chartInstance.current) {
        const zr = chartInstance.current.getZr()
        zr.off('mousedown')
        zr.off('mousemove')
        zr.off('mouseup')
      }
    }
  }, [bindInteraction])

  if (!analysisData) return null

  const avgFps = fixedStats && fixedStats.mean > 0 ? (1000 / fixedStats.mean).toFixed(1) : '0'
  const rangeText = selectedFrameRange
    ? (selectedFrameRange[0] === selectedFrameRange[1]
      ? `Frame ${selectedFrameRange[0]}`
      : `Frame ${selectedFrameRange[0]} - ${selectedFrameRange[1]}`)
    : 'All frames'

  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(13, 13, 26, 0.4)',
      borderBottom: '1px solid rgba(124, 58, 237, 0.15)',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          CPU Frame Time (ms) - {fixedStats?.count ?? 0} frames, avg {avgFps} FPS
          {selectedFrameRange && (
            <span style={{
              fontSize: 10, color: '#7c3aed', background: 'rgba(124,58,237,0.15)',
              padding: '1px 6px', borderRadius: 3, cursor: 'pointer'
            }}
            onClick={() => setSelectedFrameRange(null)}
            title="Click to clear selection"
            >
              {rangeText} x
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
          <span>Min: <span style={{ color: '#22c55e' }}>{fixedStats?.min.toFixed(1) ?? 0}ms</span></span>
          <span>Median: <span style={{ color: '#3b82f6' }}>{fixedStats?.median.toFixed(1) ?? 0}ms</span></span>
          <span>Mean: <span style={{ color: '#f59e0b' }}>{fixedStats?.mean.toFixed(1) ?? 0}ms</span></span>
          <span>Max: <span style={{ color: '#ef4444' }}>{fixedStats?.max.toFixed(1) ?? 0}ms</span></span>
        </div>
      </div>
      <div style={{ height: 180, width: '100%' }}>
        <ReactEChartsCore
          option={option}
          style={{ height: '100%', width: '100%' }}
          notMerge lazyUpdate
          opts={{ renderer: 'canvas' }}
          onChartReady={onChartReady}
        />
      </div>
    </div>
  )
}

export default FrameTimeGraph
