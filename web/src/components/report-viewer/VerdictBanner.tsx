import React from 'react';
import { Tag } from 'antd';
import type { ReportBundle, VerdictGrade } from '@shared/report-bundle';

const GRADE_META: Record<VerdictGrade, { label: string; color: string; bg: string }> = {
  excellent: { label: '优秀', color: '#2ea043', bg: 'rgba(46,160,67,0.12)' },
  pass: { label: '达标', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  weak: { label: '偏弱', color: '#d29922', bg: 'rgba(210,153,34,0.12)' },
  fail: { label: '不合格', color: '#da3633', bg: 'rgba(218,54,51,0.12)' },
};

interface VerdictBannerProps {
  bundle: ReportBundle;
}

const VerdictBanner: React.FC<VerdictBannerProps> = ({ bundle }) => {
  const grade = GRADE_META[bundle.verdict.grade];

  return (
    <section
      id="verdict"
      style={{
        background: 'linear-gradient(135deg, rgba(22,119,255,0.08) 0%, rgba(46,160,67,0.04) 100%)',
        border: '1px solid var(--border-primary)',
        borderRadius: 10,
        padding: '20px 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
        <div
          style={{
            minWidth: 72,
            textAlign: 'center',
            padding: '10px 12px',
            borderRadius: 8,
            background: grade.bg,
            border: `1px solid ${grade.color}55`,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>综合评级</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: grade.color }}>{grade.label}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Tag color="blue">{bundle.meta.reportType}</Tag>
            <Tag>{bundle.meta.frameCount} 帧</Tag>
            <Tag>目标 {bundle.meta.targetFps} fps / {bundle.meta.frameBudgetMs.toFixed(1)}ms</Tag>
            <Tag color="default">口径 {bundle.meta.frameDefinition ?? 'playerloop'}</Tag>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)' }}>
            {bundle.verdict.headline}
          </div>
        </div>
      </div>

      {bundle.verdict.summaryBullets.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          {bundle.verdict.summaryBullets.map((item, index) => (
            <li key={index} dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
          ))}
        </ul>
      )}

      {bundle.verdict.caveats && bundle.verdict.caveats.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(210,153,34,0.08)',
            border: '1px solid rgba(210,153,34,0.25)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          {bundle.verdict.caveats.map((item, index) => (
            <div key={index}>{item}</div>
          ))}
        </div>
      )}
    </section>
  );
};

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#1f2328;padding:1px 4px;border-radius:3px">$1</code>');
}

export default VerdictBanner;
