import React, { useState } from 'react';
import { Tooltip } from 'antd';

interface CallChainNode {
  name: string;
  timeMs: number;
  percent: number;
  selfMs?: number;
  isBottleneck: boolean;
  depth: number;
  children?: CallChainNode[];
}

interface CallChainTreeProps {
  /** callChain (A -> B -> C) 或 hotPath 字符串 */
  callChain?: string;
  /** callTreeSummary 缩进树形文本 */
  treeSummary?: string;
  /** 最大展示深度 (0=无限) */
  maxDepth?: number;
}

/** 解析 "NodeName (12.3ms, 45.6%)" 或 "NodeName (12.3ms, 45.6%) **BOTTLENECK**" */
function parseChainNode(raw: string, depth: number): CallChainNode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isBottleneck = trimmed.includes('**BOTTLENECK**');
  const cleaned = trimmed.replace(/\*\*BOTTLENECK\*\*/g, '').trim();

  // 匹配: "Name (12.3ms, 45.6%)" 或 "Name (12.3ms, 45.6%) [self=1.2ms]"
  const match = cleaned.match(/^(.+?)\s*\(([0-9.]+)ms,\s*([0-9.]+)%\)(?:\s*\[self=([0-9.]+)ms\])?/);
  if (match) {
    return {
      name: match[1].trim(),
      timeMs: parseFloat(match[2]),
      percent: parseFloat(match[3]),
      selfMs: match[4] ? parseFloat(match[4]) : undefined,
      isBottleneck,
      depth,
    };
  }

  // 无法解析时的 fallback
  if (cleaned.length > 0) {
    return { name: cleaned, timeMs: 0, percent: 0, isBottleneck, depth };
  }
  return null;
}

/** 解析 "A -> B -> C" 格式的调用链为节点数组 */
function parseCallChain(chainStr: string): CallChainNode[] {
  if (!chainStr || chainStr.startsWith('(depth=')) return [];
  return chainStr
    .split('->')
    .map((part, i) => parseChainNode(part, i))
    .filter((n): n is CallChainNode => n !== null);
}

/** 解析缩进树形文本为嵌套节点树 */
function parseTreeSummary(text: string): CallChainNode[] {
  if (!text) return [];

  const lines = text.split('\n').filter(l => l.trim());
  const roots: CallChainNode[] = [];
  const stack: { node: CallChainNode; indent: number }[] = [];

  for (const line of lines) {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // 格式: "  Name: 12.3ms (45.6%) [self=1.2ms]"
    const lineContent = line.trim();
    const match = lineContent.match(/^(.+?):\s*([0-9.]+)ms\s*\(([0-9.]+)%\)(?:\s*\[self=([0-9.]+)ms\])?/);
    if (!match) continue;

    const isBottleneck = lineContent.includes('**BOTTLENECK**');
    const node: CallChainNode = {
      name: match[1].trim(),
      timeMs: parseFloat(match[2]),
      percent: parseFloat(match[3]),
      selfMs: match[4] ? parseFloat(match[4]) : undefined,
      isBottleneck,
      depth: indent / 2,
      children: [],
    };

    // 找父节点
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].node.children!.push(node);
    } else {
      roots.push(node);
    }

    stack.push({ node, indent });
  }

  return roots;
}

/** 单个节点渲染 */
const ChainNode: React.FC<{
  node: CallChainNode;
  depth: number;
  maxPercent: number;
}> = ({ node, depth, maxPercent }) => {
  const barWidth = maxPercent > 0 ? Math.max(2, (node.percent / maxPercent) * 100) : 0;
  const barColor = node.isBottleneck
    ? '#ff4d4f'
    : node.percent > 50
      ? '#fa8c16'
      : node.percent > 20
        ? '#fadb14'
        : '#52c41a';

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12 }}>
          <div><b>{node.name}</b></div>
          <div>耗时: {node.timeMs.toFixed(1)}ms ({node.percent.toFixed(1)}%)</div>
          {node.selfMs !== undefined && <div>self: {node.selfMs.toFixed(1)}ms</div>}
          {node.isBottleneck && <div style={{ color: '#ff7875' }}>⚠ BOTTLENECK</div>}
        </div>
      }
      placement="right"
    >
      <div
        style={{
          paddingLeft: depth * 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '3px 0 3px ' + (depth * 20) + 'px',
          borderRadius: 4,
          cursor: 'default',
          background: node.isBottleneck ? 'rgba(255, 77, 79, 0.08)' : 'transparent',
        }}
      >
        {depth > 0 && (
          <span style={{ color: '#555', fontSize: 10, flexShrink: 0 }}>→</span>
        )}
        <span
          style={{
            color: node.isBottleneck ? '#ff7875' : '#d4d4d4',
            fontWeight: node.isBottleneck ? 600 : 400,
            fontSize: 12,
            flexShrink: 0,
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
        {/* 耗时占比 mini bar */}
        <div
          style={{
            flex: 1,
            height: 6,
            background: '#1a1a2e',
            borderRadius: 3,
            minWidth: 40,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${barWidth}%`,
              height: '100%',
              background: barColor,
              borderRadius: 3,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <span style={{ color: '#888', fontSize: 11, flexShrink: 0, minWidth: 80, textAlign: 'right' }}>
          {node.timeMs.toFixed(1)}ms ({node.percent.toFixed(1)}%)
        </span>
      </div>
    </Tooltip>
  );
};

/** 递归渲染树形节点 */
const TreeNode: React.FC<{
  node: CallChainNode;
  depth: number;
  maxPercent: number;
  maxDepth: number;
}> = ({ node, depth, maxPercent, maxDepth }) => {
  const [expanded, setExpanded] = useState(depth < 3); // 默认展开前 3 层

  const hasChildren = node.children && node.children.length > 0;
  const canExpand = hasChildren && (maxDepth === 0 || depth < maxDepth);

  return (
    <div>
      <div
        onClick={() => canExpand && setExpanded(!expanded)}
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
      >
        <ChainNode node={node} depth={depth} maxPercent={maxPercent} />
      </div>
      {expanded && canExpand && node.children!.map((child, i) => (
        <TreeNode
          key={`${child.name}-${i}`}
          node={child}
          depth={depth + 1}
          maxPercent={maxPercent}
          maxDepth={maxDepth}
        />
      ))}
    </div>
  );
};

/** 调用链可视化组件 */
const CallChainTree: React.FC<CallChainTreeProps> = ({ callChain, treeSummary, maxDepth = 0 }) => {
  // 优先使用 treeSummary（更丰富的树形数据），否则用 callChain（线性链）
  const treeNodes = treeSummary ? parseTreeSummary(treeSummary) : null;
  const chainNodes = callChain ? parseCallChain(callChain) : null;

  if (treeNodes && treeNodes.length > 0) {
    const maxPercent = Math.max(...treeNodes.map(n => n.percent), 100);
    return (
      <div
        style={{
          background: '#0d1117',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 12,
          overflowX: 'auto',
        }}
      >
        {treeNodes.map((node, i) => (
          <TreeNode key={i} node={node} depth={0} maxPercent={maxPercent} maxDepth={maxDepth} />
        ))}
      </div>
    );
  }

  if (chainNodes && chainNodes.length > 0) {
    const maxPercent = Math.max(...chainNodes.map(n => n.percent), 100);
    return (
      <div
        style={{
          background: '#0d1117',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 12,
          overflowX: 'auto',
        }}
      >
        {chainNodes.map((node, i) => (
          <ChainNode key={i} node={node} depth={i} maxPercent={maxPercent} />
        ))}
      </div>
    );
  }

  // Fallback: 显示原始文本
  const fallbackText = callChain || treeSummary || '';
  if (fallbackText) {
    return (
      <div
        style={{
          background: '#0d1117',
          borderRadius: 6,
          padding: '8px 12px',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: 12,
          color: '#888',
          whiteSpace: 'pre-wrap',
        }}
      >
        {fallbackText}
      </div>
    );
  }

  return null;
};

export default CallChainTree;
