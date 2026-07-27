import React, { useMemo, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import type { CallTreeNode } from '@shared/perf-model';

interface FlameTreeProps {
  root: CallTreeNode;
  maxDepth?: number;
  defaultExpandDepth?: number;
  highlightName?: string;
  compact?: boolean;
}

function isBottleneck(node: CallTreeNode): boolean {
  const self = node.selfMs ?? 0;
  const total = node.totalMs ?? self;
  if (total <= 0) return false;
  return self / total >= 0.7 && self >= 0.8;
}

function matchesHighlight(name: string, highlightName?: string): boolean {
  if (!highlightName) return false;
  return name === highlightName || name.includes(highlightName) || highlightName.includes(name);
}

const TreeRow: React.FC<{
  node: CallTreeNode;
  depth: number;
  maxSelfPct: number;
  maxDepth: number;
  defaultExpandDepth: number;
  highlightName?: string;
  compact?: boolean;
}> = ({ node, depth, maxSelfPct, maxDepth, defaultExpandDepth, highlightName, compact }) => {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);
  const hasChildren = node.children.length > 0;
  const canExpand = hasChildren && (maxDepth === 0 || depth < maxDepth);
  const selfPct = node.selfPct ?? 0;
  const totalPct = node.totalPct ?? selfPct;
  const selfMs = node.selfMs ?? 0;
  const totalMs = node.totalMs ?? selfMs;
  const bottleneck = isBottleneck(node);
  const highlighted = matchesHighlight(node.name, highlightName);
  const selfBar = maxSelfPct > 0 ? Math.max(2, (selfPct / maxSelfPct) * 100) : 0;
  const totalBar = maxSelfPct > 0 ? Math.max(2, (totalPct / maxSelfPct) * 100) : 0;

  return (
    <div>
      <div
        onClick={() => canExpand && setExpanded(!expanded)}
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '16px 1fr 120px 88px' : '16px 1fr 160px 110px',
          gap: 8,
          alignItems: 'center',
          padding: `${compact ? 1 : 2}px 0 ${compact ? 1 : 2}px ${depth * 14}px`,
          cursor: canExpand ? 'pointer' : 'default',
          background: highlighted ? 'rgba(22,119,255,0.08)' : 'transparent',
          borderRadius: 4,
        }}
      >
        <span style={{ color: '#5a6068', fontSize: 10 }}>
          {canExpand ? (expanded ? '▼' : '▶') : '·'}
        </span>

        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip title={node.name}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: compact ? 11 : 12,
                color: highlighted ? '#58a6ff' : bottleneck ? '#f85149' : '#e6eaf0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.name}
            </span>
          </Tooltip>
          {bottleneck && <Tag color="red" style={{ margin: 0, fontSize: 10, lineHeight: '14px' }}>瓶颈</Tag>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ height: 4, background: '#1a1d21', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${selfBar}%`, height: '100%', background: '#f85149', borderRadius: 2 }} />
          </div>
          <div style={{ height: 4, background: '#1a1d21', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${totalBar}%`, height: '100%', background: '#388bfd', borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 11, color: '#8b949e', fontFamily: 'var(--font-mono)' }}>
          <div>{selfMs.toFixed(2)} / {totalMs.toFixed(2)}ms</div>
          <div>{selfPct.toFixed(1)}% / {totalPct.toFixed(1)}%</div>
        </div>
      </div>

      {expanded && canExpand && node.children.map((child, index) => (
        <TreeRow
          key={`${child.name}-${index}`}
          node={child}
          depth={depth + 1}
          maxSelfPct={maxSelfPct}
          maxDepth={maxDepth}
          defaultExpandDepth={defaultExpandDepth}
          highlightName={highlightName}
          compact={compact}
        />
      ))}
    </div>
  );
};

const FlameTree: React.FC<FlameTreeProps> = ({
  root,
  maxDepth = 0,
  defaultExpandDepth = 3,
  highlightName,
  compact = false,
}) => {
  const maxSelfPct = useMemo(() => {
    let max = 0;
    const walk = (node: CallTreeNode) => {
      max = Math.max(max, node.selfPct ?? 0, node.totalPct ?? 0);
      node.children.forEach(walk);
    };
    walk(root);
    return max || 100;
  }, [root]);

  return (
    <div
      style={{
        background: '#0f1214',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        padding: compact ? '8px 10px' : '10px 12px',
        maxHeight: compact ? 320 : 520,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '16px 1fr 120px 88px' : '16px 1fr 160px 110px',
          gap: 8,
          padding: '0 0 6px 0',
          fontSize: 10,
          color: '#5a6068',
          borderBottom: '1px solid var(--border-primary)',
          marginBottom: 6,
        }}
      >
        <span />
        <span>节点</span>
        <span>self / total 条</span>
        <span style={{ textAlign: 'right' }}>耗时</span>
      </div>
      <TreeRow
        node={root}
        depth={0}
        maxSelfPct={maxSelfPct}
        maxDepth={maxDepth}
        defaultExpandDepth={defaultExpandDepth}
        highlightName={highlightName}
        compact={compact}
      />
    </div>
  );
};

export default FlameTree;
