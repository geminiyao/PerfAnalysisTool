import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Bookmark } from 'lucide-react'
import { getMockTimelineData } from '@/services/mockProvider'
import styles from './index.module.less'

const TimelineChart: React.FC = () => {
  const timelineData = useMemo(() => getMockTimelineData(), [])

  const option = useMemo(() => {
    const times = timelineData.map((d) => {
      const date = new Date(d.timestamp)
      const min = String(date.getMinutes()).padStart(2, '0')
      const sec = String(date.getSeconds()).padStart(2, '0')
      return `${String(date.getHours()).padStart(2, '0')}:${min}:${sec}`
    })
    const values = timelineData.map((d) => d.value)

    return {
      backgroundColor: 'transparent',
      grid: {
        left: 50,
        right: 20,
        top: 20,
        bottom: 50
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(13, 13, 26, 0.95)',
        borderColor: 'rgba(124, 58, 237, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0]
          return `<div style="font-size:11px;color:#94a3b8">${p.name}</div>
                  <div style="font-weight:600;color:#e2e8f0">${p.value.toFixed(2)} MB</div>`
        }
      },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          interval: Math.floor(times.length / 8)
        },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      dataZoom: [
        {
          type: 'slider',
          height: 18,
          bottom: 6,
          borderColor: 'rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(13, 13, 26, 0.8)',
          fillerColor: 'rgba(124, 58, 237, 0.15)',
          handleStyle: { color: '#7c3aed', borderColor: '#7c3aed' },
          textStyle: { color: '#64748b', fontSize: 10 },
          dataBackground: {
            lineStyle: { color: 'rgba(124, 58, 237, 0.3)' },
            areaStyle: { color: 'rgba(124, 58, 237, 0.08)' }
          }
        }
      ],
      series: [
        {
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          lineStyle: {
            color: '#7c3aed',
            width: 2
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(124, 58, 237, 0.3)' },
                { offset: 1, color: 'rgba(124, 58, 237, 0.02)' }
              ]
            }
          },
          emphasis: {
            itemStyle: {
              color: '#7c3aed',
              borderColor: '#fff',
              borderWidth: 2,
              shadowColor: 'rgba(124, 58, 237, 0.5)',
              shadowBlur: 8
            }
          },
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' }
            ],
            symbol: 'circle',
            symbolSize: 8,
            label: {
              fontSize: 10,
              color: '#e2e8f0'
            },
            itemStyle: {
              color: '#06b6d4',
              borderColor: '#fff',
              borderWidth: 1
            }
          }
        }
      ]
    }
  }, [timelineData])

  const snapshots = ['00:19', '00:37', '00:58', '01:26']

  return (
    <div className={styles.timelineContainer}>
      <div className={styles.header}>
        <div className={styles.title}>内存使用 (MB)</div>
        <div className={styles.controls}>
          <button className={styles.controlBtn}>显示名称</button>
          <button className={styles.controlBtn}>
            <Bookmark size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
            采样管理
          </button>
          <button className={styles.controlBtn}>重 置</button>
        </div>
      </div>
      <div className={styles.chartWrapper}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
      <div className={styles.snapshotRow}>
        {snapshots.map((time, idx) => (
          <div key={idx} className={`${styles.snapshot} ${idx === 0 ? styles.snapshotActive : ''}`}>
            <span className={styles.snapshotTime}>{time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TimelineChart
