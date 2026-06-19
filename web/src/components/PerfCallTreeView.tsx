import React, { useState } from 'react';
import { Tag, Tooltip } from 'antd';
import type { CallTreeNode, CallTreeLayer } from '@shared/perf-model';

const LAYER_COLORS: Record<string, string> = {
  business: '#2ea043',
  engine: '#388bfd',
  runtime: '#d29922',
  noise: '#5a6068',
};

interface PerfCallTreeViewProps {
  root: CallTreeNode;
  /** 展示用最大深度 (0=无限) */
  maxDepth?: number;
  /** 默认展开层数 */
  defaultExpandDepth?: number;
}

function pctOf(node: CallTreeNode): number {
  return node.selfPct ?? node.totalPct ?? 0;
}

function msOf(node: CallTreeNode): number | undefined {
  return node.selfMs ?? node.totalMs;
}

const TreeNodeRow: React.FC<{
  node: CallTreeNode;
  depth: number;
  maxPct: number;
  maxDepth: number;
  defaultExpandDepth: number;
}> = ({ node, depth, maxPct, maxDepth, defaultExpandDepth }) => {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);
  const hasChildren = node.children.length > 0;
  const canExpand = hasChildren && (maxDepth === 0 || depth < maxDepth);
  const pct = pctOf(node);
  const barWidth = maxPct > 0 ? Math.max(2, (pct / maxPct) * 100) : 0;
  const layer = node.layer as CallTreeLayer | undefined;

  return (
    <div>
      <div
        onClick={() => canExpand && setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 0 2px ' + depth * 16 + 'px',
          cursor: canExpand ? 'pointer' : 'default',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
      >
        <span style={{ color: '#5a6068', width: 12, flexShrink: 0 }}>
          {canExpand ? (expanded ? '▼' : '▶') : '·'}
        </span>
        <Tooltip
          title={
            <div style={{ fontSize: 11 }}>
              <div><b>{node.name}</b></div>
              {msOf(node) !== undefined && <div>{msOf(node)!.toFixed(2)}ms</div>}
              {pct > 0 && <div>{pct.toFixed(2)}%</div>}
              {layer && <div>layer: {layer}</div>}
            </div>
          }
        >
          <span
            style={{
              color: '#e6eaf0',
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {node.name}
          </span>
        </Tooltip>
        {layer && (
          <Tag
            style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
            color={LAYER_COLORS[layer] ?? 'default'}
          >
            {layer}
          </Tag>
        )}
        <div
          style={{
            flex: 1,
            height: 6,
            background: '#1a1d21',
            borderRadius: 3,
            minWidth: 40,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${barWidth}%`,
              height: '100%',
              background: pct > 30 ? '#d29922' : '#2ea043',
              borderRadius: 3,
            }}
          />
        </div>
        <span style={{ color: '#8b949e', fontSize: 11, flexShrink: 0, minWidth: 72, textAlign: 'right' }}>
          {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
          {msOf(node) !== undefined ? ` / ${msOf(node)!.toFixed(1)}ms` : ''}
        </span>
      </div>
      {expanded && canExpand && node.children.map((child, i) => (
        <TreeNodeRow
          key={`${child.name}-${i}`}
          node={child}
          depth={depth + 1}
          maxPct={maxPct}
          maxDepth={maxDepth}
          defaultExpandDepth={defaultExpandDepth}
        />
      ))}
    </div>
  );
};

/** 渲染 perf-model CallTreeNode 统一调用树 */
const PerfCallTreeView: React.FC<PerfCallTreeViewProps> = ({
  root,
  maxDepth = 0,
  defaultExpandDepth = 2,
}) => {
  const collectPct = (n: CallTreeNode): number[] => [
    pctOf(n),
    ...n.children.flatMap(collectPct),
  ];
  const maxPct = Math.max(...collectPct(root), 1);

  return (
    <div
      style={{
        background: 'var(--bg-root, #0b0e11)',
        border: '1px solid var(--border-primary, #1f2328)',
        borderRadius: 6,
        padding: '8px 12px',
        overflowX: 'auto',
      }}
    >
      <TreeNodeRow
        node={root}
        depth={0}
        maxPct={maxPct}
        maxDepth={maxDepth}
        defaultExpandDepth={defaultExpandDepth}
      />
    </div>
  );
};

export default PerfCallTreeView;
