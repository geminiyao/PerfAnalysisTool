import React from 'react';
import { Drawer } from 'antd';
import type { MetricCard } from '@shared/report-bundle';

interface EvidenceDrawerProps {
  open: boolean;
  kpi?: MetricCard;
  provenance?: Record<string, { label: string; value: string | number }>;
  onClose: () => void;
}

const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({ open, kpi, provenance, onClose }) => {
  const entry = kpi ? provenance?.[kpi.key] : undefined;

  return (
    <Drawer
      title="证据溯源"
      placement="right"
      width={360}
      open={open}
      onClose={onClose}
    >
      {kpi ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>指标</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{kpi.label}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>当前值</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>{kpi.value}{kpi.unit}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>证据 key</div>
            <code style={{ background: '#1f2328', padding: '4px 8px', borderRadius: 4 }}>{kpi.key}</code>
          </div>
          {entry && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>归一化值</div>
              <div>{entry.value}</div>
            </div>
          )}
          {kpi.budget !== undefined && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>帧预算</div>
              <div>{kpi.budget}{kpi.unit}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)' }}>点击 KPI 卡片查看对应证据 key 与归一化值。</div>
      )}
    </Drawer>
  );
};

export default EvidenceDrawer;
