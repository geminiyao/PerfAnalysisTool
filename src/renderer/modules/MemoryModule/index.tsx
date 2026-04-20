import React from 'react'
import { Input, Select, Button } from 'antd'
import { Search, Maximize2, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import MemoryTable from './MemoryTable'
import MemoryTreeMap from './MemoryTreeMap'

const MemoryModule: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)'
      }}>
        <Select defaultValue="rule" size="small" style={{ width: 100 }}
          options={[{ value: 'rule', label: '规则 ✓' }]} />
        <Select defaultValue="depth" size="small" style={{ width: 140 }}
          options={[{ value: 'depth', label: '堆栈深度优先' }]} />
        <Button size="small" type="primary" icon={<BarChart3 size={12} />}>分析</Button>
        <Button size="small" icon={<Maximize2 size={12} />}>全屏查看</Button>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 11, cursor: 'pointer' }}>缺少规则文件？</span>
        <div style={{ flex: 1 }} />
        <button style={{
          padding: '2px 8px', border: '1px solid var(--color-border)', borderRadius: 4,
          background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11
        }}>
          <ChevronDown size={11} style={{ marginRight: 2 }} /> Collapse
        </button>
        <Input prefix={<Search size={12} />} placeholder="Search regions..." size="small"
          style={{ width: 180 }} />
        <ChevronUp size={14} style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }} />
        <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', cursor: 'pointer' }} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', borderRight: '1px solid var(--color-border)' }}>
          <MemoryTable />
        </div>
        <div style={{ width: '35%', minWidth: 280, padding: 8 }}>
          <MemoryTreeMap />
        </div>
      </div>

      <div style={{
        display: 'flex', borderTop: '1px solid var(--color-border)', height: 120
      }}>
        <div style={{
          flex: 1, padding: '8px 16px', borderRight: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Call Trees
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', fontSize: 12, fontStyle: 'italic'
          }}>
            Please select a memory region first
          </div>
        </div>
        <div style={{
          flex: 1, padding: '8px 16px', borderRight: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Stack Trace
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', fontSize: 12, fontStyle: 'italic'
          }}>
            Please select a memory region first
          </div>
        </div>
        <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Leaf Nodes List
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', fontSize: 12, fontStyle: 'italic'
          }}>
            Please select a memory region first
          </div>
        </div>
      </div>
    </div>
  )
}

export default MemoryModule
