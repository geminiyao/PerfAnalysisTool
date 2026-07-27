import React from 'react';
import { Tooltip } from 'antd';
import type { MetricCard } from '@shared/report-bundle';

const STATUS_COLOR: Record<NonNullable<MetricCard['status']>, string> = {
  ok: '#2ea043',
  warn: '#d29922',
  bad: '#da3633',
};

interface KpiGridProps {
  kpis: MetricCard[];
  onSelect?: (kpi: MetricCard) => void;
  selectedKey?: string;
}

const KpiGrid: React.FC<KpiGridProps> = ({ kpis, onSelect, selectedKey }) => {
  return (
    <div
      id="overview"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 12,
      }}
    >
      {kpis.map(kpi => {
        const statusColor = kpi.status ? STATUS_COLOR[kpi.status] : 'var(--text-secondary)';
        const selected = selectedKey === kpi.key;
        return (
          <Tooltip key={kpi.key} title={`证据 key: ${kpi.key}`}>
            <button
              type="button"
              onClick={() => onSelect?.(kpi)}
              style={{
                textAlign: 'left',
                background: selected ? 'rgba(22,119,255,0.12)' : 'var(--bg-elevated)',
                border: `1px solid ${selected ? '#1677ff' : 'var(--border-primary)'}`,
                borderRadius: 8,
                padding: '12px 14px',
                cursor: onSelect ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: statusColor, fontFamily: 'var(--font-mono)' }}>
                  {formatValue(kpi.value)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{kpi.unit}</span>
              </div>
              {kpi.budget !== undefined && kpi.unit === 'ms' && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  预算 {kpi.budget.toFixed(1)}ms
                </div>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

export default KpiGrid;
