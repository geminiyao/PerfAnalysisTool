import React, { useMemo } from 'react'
import { Tabs } from 'antd'
import { LayoutDashboard, Cpu, Zap, MemoryStick, Gauge, Activity } from 'lucide-react'
import { useAnalysisStore } from '@/store/analysisStore'
import OverviewModule from './Overview'
import CpuModule from './CpuModule'
import PowerModule from './PowerModule'
import MemoryModule from './MemoryModule'
import FpsModule from './FpsModule'
import ProfilerModule from './ProfilerModule'

const AnalysisTabs: React.FC = () => {
  const { activeTab, setActiveTab } = useAnalysisStore()

  const tabItems = useMemo(() => [
    {
      key: 'profiler',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={14} /> Profiler Analyzer
        </span>
      ),
      children: <ProfilerModule />
    },
    {
      key: 'overview',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LayoutDashboard size={14} /> 概览
        </span>
      ),
      children: <OverviewModule />
    },
    {
      key: 'cpu',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={14} /> CPU 使用率
        </span>
      ),
      children: <CpuModule />
    },
    {
      key: 'power',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={14} /> 功耗/电量
        </span>
      ),
      children: <PowerModule />
    },
    {
      key: 'memory',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MemoryStick size={14} /> 内存分析
        </span>
      ),
      children: <MemoryModule />
    },
    {
      key: 'fps',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Gauge size={14} /> 帧率/FPS
        </span>
      ),
      children: <FpsModule />
    }
  ], [])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        tabBarStyle={{
          margin: 0,
          padding: '0 16px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)'
        }}
      />
    </div>
  )
}

export default AnalysisTabs
