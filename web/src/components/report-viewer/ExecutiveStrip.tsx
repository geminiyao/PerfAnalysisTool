import React from 'react';
import { Tag } from 'antd';
import type { ReportBundle, VerdictGrade } from '@shared/report-bundle';

const GRADE_META: Record<VerdictGrade, { label: string; color: string }> = {
  excellent: { label: '优秀', color: '#2ea043' },
  pass: { label: '达标', color: '#3fb950' },
  weak: { label: '偏弱', color: '#d29922' },
  fail: { label: '不合格', color: '#da3633' },
};

interface ExecutiveStripProps {
  bundle: ReportBundle;
}

const ExecutiveStrip: React.FC<ExecutiveStripProps> = ({ bundle }) => {
  const grade = GRADE_META[bundle.verdict.grade];
  const headline = bundle.verdict.headline.replace(/\*\*/g, '').slice(0, 160);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <Tag
        style={{
          margin: 0,
          padding: '2px 10px',
          fontWeight: 700,
          fontSize: 13,
          color: grade.color,
          background: `${grade.color}18`,
          border: `1px solid ${grade.color}44`,
        }}
      >
        {grade.label}
      </Tag>
      {bundle.kpis.slice(0, 6).map(kpi => (
        <span key={kpi.key} style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>{kpi.label}</span>{' '}
          <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {formatValue(kpi.value)}{kpi.unit}
          </strong>
        </span>
      ))}
      <span style={{ color: 'var(--text-tertiary)', flex: '1 1 200px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {headline}{bundle.verdict.headline.length > 160 ? '…' : ''}
      </span>
    </div>
  );
};

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

export default ExecutiveStrip;
