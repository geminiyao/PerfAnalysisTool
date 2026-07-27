import React, { useState } from 'react';
import { Tag } from 'antd';
import type { ReportFinding } from '@shared/report-bundle';
import FlameTree from './FlameTree';

const SEVERITY_META: Record<ReportFinding['severity'], { label: string; color: string }> = {
  critical: { label: 'P0', color: '#da3633' },
  high: { label: '高', color: '#f85149' },
  medium: { label: '中', color: '#d29922' },
  low: { label: '低', color: '#8b949e' },
  info: { label: '信息', color: '#58a6ff' },
};

interface FindingCardProps {
  finding: ReportFinding;
  tree?: React.ComponentProps<typeof FlameTree>['root'];
  treeLabel?: string;
  defaultExpanded?: boolean;
}

const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  tree,
  treeLabel,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const severity = SEVERITY_META[finding.severity];

  return (
    <article
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '14px 16px',
          cursor: 'pointer',
          borderLeft: `3px solid ${severity.color}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Tag color={severity.color} style={{ margin: 0 }}>{severity.label}</Tag>
          {finding.mustReport && <Tag color="red" style={{ margin: 0 }}>mustReport</Tag>}
          {finding.thread && <Tag style={{ margin: 0 }}>{finding.thread}</Tag>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {finding.title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
          {finding.selfMsMean !== undefined && <span>self mean {finding.selfMsMean.toFixed(2)}ms</span>}
          {finding.selfMsMax !== undefined && <span>max {finding.selfMsMax.toFixed(2)}ms</span>}
          {finding.pctOfFrame !== undefined && <span>占帧 {finding.pctOfFrame.toFixed(1)}%</span>}
          {finding.presentFrames && <span>出现 {finding.presentFrames}</span>}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-primary)' }}>
          {finding.sourceLocation && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#58a6ff', fontFamily: 'var(--font-mono)' }}>
              {finding.sourceLocation}
            </div>
          )}
          {finding.bottleneckType && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              瓶颈类型：{finding.bottleneckType}
            </div>
          )}
          {finding.narrative && (
            <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)' }}>
              {finding.narrative}
            </p>
          )}
          {tree && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                调用树 · {treeLabel ?? '关联帧'}
              </div>
              <FlameTree root={tree} defaultExpandDepth={4} highlightName={finding.markerName} compact />
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
            证据：{finding.evidenceKeys.join(', ')}
          </div>
        </div>
      )}
    </article>
  );
};

export default FindingCard;
