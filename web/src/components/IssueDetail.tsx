import React, { useMemo, useContext, useEffect, useRef, useState } from 'react';
import { Card, Descriptions, Tag, Empty, Button, Tooltip, message } from 'antd';
import { ThunderboltOutlined, SettingOutlined, LoadingOutlined, LinkOutlined, CheckOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CallChainTree from './CallChainTree';
import SourcePathSetting from './SourcePathSetting';
import { applyPatch } from '../services/api';
import { OptimizeContext } from '../pages/ReportDetail';
import type { Issue } from './IssueList';
import type { OptimizeSuggestRequest } from '../../shared/types';

interface IssueDetailProps {
  issue: Issue | null;
  reportMarkdown: string;
  sessionId: string;
}

// ============================================================
// issueKey 生成
// ============================================================

function getIssueKey(issue: Issue): string {
  switch (issue.type) {
    case 'hotspot': return `hotspot:${issue.data.name}`;
    case 'jank': return `jank:${issue.data.frameIndex}`;
    case 'spike': return `spike:${issue.data.name}`;
  }
}

// ============================================================
// 从 markdown 报告中提取与指定 marker 或帧号相关的段落
// ============================================================

function extractReportSections(markdown: string, keywords: string[]): string {
  if (!markdown || keywords.length === 0) return '';

  const lines = markdown.split('\n');
  const sections: string[] = [];
  let capturing = false;
  let currentSection: string[] = [];

  for (const line of lines) {
    if (line.match(/^###\s/)) {
      if (capturing && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      const titleLower = line.toLowerCase();
      capturing = keywords.some(kw => titleLower.includes(kw.toLowerCase()));
      if (capturing) currentSection.push(line);
    } else if (line.match(/^##\s/)) {
      if (capturing && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      capturing = false;
    } else if (capturing) {
      currentSection.push(line);
    }
  }

  if (capturing && currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }

  return sections.join('\n\n---\n\n');
}

// ============================================================
// AI 输出结构化解析
// ============================================================

interface ParsedOptimizeResult {
  rootCause: string;
  suggestions: string;
  codeDiff: string;
  extra: string;
}

function parseOptimizeResult(markdown: string): ParsedOptimizeResult {
  const sections: ParsedOptimizeResult = { rootCause: '', suggestions: '', codeDiff: '', extra: '' };
  if (!markdown) return sections;

  const lines = markdown.split('\n');
  let currentKey: keyof ParsedOptimizeResult | null = null;
  const buf: Record<keyof ParsedOptimizeResult, string[]> = {
    rootCause: [], suggestions: [], codeDiff: [], extra: [],
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      const title = heading[1].trim();
      if (/根因分析/.test(title)) currentKey = 'rootCause';
      else if (/优化建议/.test(title)) currentKey = 'suggestions';
      else if (/代码对比/.test(title)) currentKey = 'codeDiff';
      else if (/补充/.test(title)) currentKey = 'extra';
      else if (currentKey) buf[currentKey].push(line);
      continue;
    }
    if (currentKey) buf[currentKey].push(line);
  }

  sections.rootCause = buf.rootCause.join('\n').trim();
  sections.suggestions = buf.suggestions.join('\n').trim();
  sections.codeDiff = buf.codeDiff.join('\n').trim();
  sections.extra = buf.extra.join('\n').trim();
  return sections;
}

// ============================================================
// 代码对比展示组件
// ============================================================

const DiffBlock: React.FC<{ block: { filePath: string; before: string; after: string } }> = ({ block }) => {
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!block.filePath || !block.before || !block.after) return;
    setApplying(true);
    try {
      await applyPatch(block.filePath, block.before, block.after);
      setApplied(true);
      message.success(`已应用修改: ${block.filePath}`);
    } catch (err: any) {
      message.error(err.message || '应用失败');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {block.filePath && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <LinkOutlined style={{ marginRight: 4 }} />{block.filePath}
          </div>
        )}
        {block.filePath && block.before && block.after && (
          <Button
            size="small"
            type={applied ? 'default' : 'primary'}
            icon={applied ? <CheckOutlined /> : undefined}
            loading={applying}
            disabled={applied}
            onClick={handleApply}
            style={{
              fontSize: 11,
              ...(applied ? { color: 'var(--color-success)', borderColor: 'var(--color-success)' } : {}),
            }}
          >
            {applied ? '已应用' : '应用修改'}
          </Button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--color-error)', fontWeight: 600,
            padding: '4px 10px', background: 'rgba(218,54,51,0.06)',
            borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: '1px solid rgba(218,54,51,0.15)',
          }}>
            修改前
          </div>
          <pre style={{
            margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
            background: 'var(--bg-root)', borderRadius: '0 0 var(--radius) var(--radius)',
            overflow: 'auto', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            border: '1px solid rgba(218,54,51,0.1)', borderTop: 'none',
          }}>
            {block.before || '(无)'}
          </pre>
        </div>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--color-success)', fontWeight: 600,
            padding: '4px 10px', background: 'rgba(46,160,67,0.06)',
            borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: '1px solid rgba(46,160,67,0.15)',
          }}>
            修改后
          </div>
          <pre style={{
            margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
            background: 'var(--bg-root)', borderRadius: '0 0 var(--radius) var(--radius)',
            overflow: 'auto', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            border: '1px solid rgba(46,160,67,0.1)', borderTop: 'none',
          }}>
            {block.after || '(无)'}
          </pre>
        </div>
      </div>
    </div>
  );
};

const CodeDiffView: React.FC<{ markdown: string }> = ({ markdown }) => {
  const blocks = useMemo(() => {
    const result: { filePath: string; before: string; after: string }[] = [];
    const parts = markdown.split(/\*\*文件\*\*\s*[:：]\s*/);
    for (let i = 1; i < parts.length; i++) {
      const fileMatch = parts[i].match(/^`([^`]+)`/);
      const filePath = fileMatch?.[1] || '';
      const beforeMatch = parts[i].match(/\*\*修改前\*\*\s*[:：]?\s*```[\w]*\n([\s\S]*?)```/);
      const afterMatch = parts[i].match(/\*\*修改后\*\*\s*[:：]?\s*```[\w]*\n([\s\S]*?)```/);
      if (beforeMatch || afterMatch) {
        result.push({
          filePath,
          before: beforeMatch?.[1]?.trim() || '',
          after: afterMatch?.[1]?.trim() || '',
        });
      }
    }
    return result;
  }, [markdown]);

  if (blocks.length === 0) {
    return (
      <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {blocks.map((block, idx) => (
        <DiffBlock key={idx} block={block} />
      ))}
    </div>
  );
};

// ============================================================
// 结构化结果展示
// ============================================================

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--bg-root)', borderRadius: 'var(--radius)',
  border: '1px solid var(--border-primary)', padding: '10px 14px', marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8,
  display: 'flex', alignItems: 'center', gap: 6,
};

const StructuredResult: React.FC<{ result: string; loading: boolean }> = ({ result, loading }) => {
  const parsed = useMemo(() => parseOptimizeResult(result), [result]);
  const hasStructure = parsed.rootCause || parsed.suggestions || parsed.codeDiff;

  if (!hasStructure) {
    return (
      <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        {loading && <span style={{ color: 'var(--color-warning)' }}>▊</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {parsed.rootCause && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: 'var(--color-error)' }}>●</span> 根因分析
          </div>
          <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.rootCause}</ReactMarkdown>
          </div>
        </div>
      )}
      {parsed.suggestions && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: 'var(--color-warning)' }}>●</span> 优化建议
          </div>
          <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.suggestions}</ReactMarkdown>
          </div>
        </div>
      )}
      {parsed.codeDiff && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: 'var(--color-success)' }}>●</span> 代码对比
          </div>
          <CodeDiffView markdown={parsed.codeDiff} />
        </div>
      )}
      {parsed.extra && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: 'var(--color-primary)' }}>●</span> 补充说明
          </div>
          <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.extra}</ReactMarkdown>
          </div>
        </div>
      )}
      {loading && (
        <div style={{ textAlign: 'center', padding: 4 }}>
          <span style={{ color: 'var(--color-warning)' }}>▊ 生成中...</span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 实时日志面板
// ============================================================

const LogPanel: React.FC<{ logs: string[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--bg-root)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-primary)',
        padding: '8px 12px',
        maxHeight: 200,
        overflowY: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        marginTop: 8,
      }}
    >
      {logs.map((line, i) => (
        <div
          key={i}
          style={{
            color: line.startsWith('[stderr]') || line.startsWith('[工具错误]')
              ? 'var(--color-error)'
              : line.startsWith('[完成]')
                ? 'var(--color-success)'
                : line.startsWith('[思考]')
                  ? 'var(--text-secondary)'
                  : line.startsWith('[工具]')
                    ? 'var(--color-primary)'
                    : 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border-primary)',
            paddingBottom: 1,
            marginBottom: 1,
          }}
        >
          {line}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

// ============================================================
// AI 优化面板 — 接入 OptimizeContext
// ============================================================

function useOptimize(props: {
  sessionId: string;
  issueKey: string;
  issueType: 'hotspot' | 'jank' | 'spike';
  markerName: string;
  callChain?: string;
  hotPath?: string;
  perfContext: OptimizeSuggestRequest['perfContext'];
}) {
  const { sessionId, issueKey, issueType, markerName, callChain, hotPath, perfContext } = props;
  const ctx = useContext(OptimizeContext);
  const state = ctx.getState(issueKey);

  const handleOptimize = () => {
    ctx.startOptimize(issueKey, {
      sessionId, issueType, markerName, callChain, hotPath, perfContext,
    });
  };

  const handleCancel = () => {
    ctx.cancelOptimize(issueKey);
  };

  const { loading, mapping, result, error, sourceFiles, logs } = state;

  const triggerButton = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {error && (
        <Tooltip title={error}>
          <span style={{ color: 'var(--color-error)', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {error.length > 30 ? error.slice(0, 30) + '...' : error}
          </span>
        </Tooltip>
      )}
      <Tooltip title="设置源码路径">
        <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => ctx.setShowSetting(true)} style={{ color: 'var(--text-tertiary)' }} />
      </Tooltip>
      {loading ? (
        <Button size="small" type="text" onClick={handleCancel} style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          <LoadingOutlined style={{ marginRight: 4 }} />取消
        </Button>
      ) : (
        <Button
          size="small"
          icon={mapping ? <LoadingOutlined /> : <ThunderboltOutlined />}
          loading={mapping}
          onClick={handleOptimize}
          style={{
            borderColor: error ? 'var(--color-error)' : 'var(--color-warning)',
            color: error ? 'var(--color-error)' : 'var(--color-warning)',
            background: 'transparent',
            fontSize: 12,
          }}
        >
          {mapping ? '映射源码...' : error ? '重试' : result ? '重新生成' : '生成优化方案'}
        </Button>
      )}
    </div>
  );

  const resultContent = (
    <>
      {error && !loading && (
        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0 0', padding: '8px 0 0' }}>
          <div style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 6 }}>{error}</div>
          <Button size="small" onClick={handleOptimize}>重试</Button>
        </div>
      )}

      {loading && !result && logs.length === 0 && (
        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0 0', padding: '10px 0 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <LoadingOutlined style={{ fontSize: 16, marginBottom: 6 }} />
          <div style={{ fontSize: 12 }}>AI 正在分析源码并生成优化方案...</div>
        </div>
      )}

      {loading && logs.length > 0 && !result && (
        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0 0', padding: '4px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <LoadingOutlined style={{ fontSize: 12, color: 'var(--color-warning)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>CLI 实时输出 ({logs.length} 行)</span>
          </div>
          <LogPanel logs={logs} />
        </div>
      )}

      {sourceFiles.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0 0', padding: '8px 0 0' }}>
          <div style={{ padding: '5px 8px', background: 'var(--color-success-bg)', borderRadius: 4, border: '1px solid rgba(46,160,67,0.1)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-success)', marginBottom: 2 }}>
              <LinkOutlined /> 已定位 {sourceFiles.length} 个源码文件
            </div>
            {sourceFiles.slice(0, 5).map((f, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {f.path}:{f.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div style={{ borderTop: '1px solid var(--border-primary)', margin: '12px 0 0', padding: '8px 0 0' }}>
          <StructuredResult result={result} loading={loading} />
          {loading && logs.length > 0 && <LogPanel logs={logs} />}
        </div>
      )}

      <SourcePathSetting
        open={ctx.showSetting}
        onClose={(configured) => {
          ctx.setShowSetting(false);
          if (configured && !result && !loading) {
            handleOptimize();
          }
        }}
      />
    </>
  );

  return { triggerButton, resultContent };
}

// ============================================================
// 问题详情子组件
// ============================================================

const HotspotDetail: React.FC<{ data: any; reportMarkdown: string; sessionId: string }> = ({ data, reportMarkdown, sessionId }) => {
  const aiSection = useMemo(
    () => extractReportSections(reportMarkdown, [data.name]),
    [reportMarkdown, data.name],
  );

  const issueKey = `hotspot:${data.name}`;
  const { triggerButton, resultContent } = useOptimize({
    sessionId,
    issueKey,
    issueType: 'hotspot',
    markerName: data.name,
    callChain: data.callChain,
    perfContext: {
      msSelfMean: data.msSelfMean,
      msSelfMax: data.msSelfMax,
      percentOfFrame: data.percentOfFrame,
      thread: data.thread,
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small" title={<span style={{ color: 'var(--text-primary)' }}>{data.name}</span>} extra={<Tag color="red">热点</Tag>}>
        <Descriptions size="small" column={3} labelStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ color: 'var(--text-primary)' }}>
          <Descriptions.Item label="self 均值">{data.msSelfMean.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="self 最大">{data.msSelfMax.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="占帧比例">{data.percentOfFrame.toFixed(1)}%</Descriptions.Item>
          <Descriptions.Item label="每帧调用">{data.callsPerFrame.toFixed(1)} 次</Descriptions.Item>
          <Descriptions.Item label="出现帧数">{data.presentOnFrameCount}</Descriptions.Item>
          <Descriptions.Item label="线程">{data.thread}</Descriptions.Item>
        </Descriptions>
        {data.mustReportReason && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: 'var(--color-error-bg)', borderRadius: 4, fontSize: 11, color: 'var(--color-error)' }}>
            判定依据: {data.mustReportReason}
          </div>
        )}
      </Card>

      {data.callChain && !data.callChain.startsWith('(depth=') && (
        <Card size="small" title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>调用链</span>}>
          <CallChainTree callChain={data.callChain} />
        </Card>
      )}

      <Card
        size="small"
        title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>AI 分析</span>}
        extra={triggerButton}
      >
        {aiSection ? (
          <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '4px 0' }}>暂无 AI 分析内容</div>
        )}
        {resultContent}
      </Card>
    </div>
  );
};

const JankDetail: React.FC<{ data: any; reportMarkdown: string; sessionId: string }> = ({ data, reportMarkdown, sessionId }) => {
  const aiSection = useMemo(() => {
    const keywords = [
      `帧 #${data.frameIndex}`,
      `#${data.frameIndex}`,
      data.dominantMarker || '',
    ].filter(Boolean);
    return extractReportSections(reportMarkdown, keywords);
  }, [reportMarkdown, data.frameIndex, data.dominantMarker]);

  const issueKey = `jank:${data.frameIndex}`;
  const { triggerButton, resultContent } = useOptimize({
    sessionId,
    issueKey,
    issueType: 'jank',
    markerName: data.dominantMarker || `帧#${data.frameIndex}`,
    hotPath: data.hotPath,
    perfContext: {
      msFrame: data.msFrame,
      ratio: data.ratio,
      dominantMarker: data.dominantMarker,
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card
        size="small"
        title={<span style={{ color: 'var(--text-primary)' }}>帧 #{data.frameIndex}</span>}
        extra={<Tag color={data.jankLevel === 'BigJank' ? 'red' : 'orange'}>{data.jankLevel}</Tag>}
      >
        <Descriptions size="small" column={3} labelStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ color: 'var(--text-primary)' }}>
          <Descriptions.Item label="帧耗时">{data.msFrame.toFixed(1)}ms</Descriptions.Item>
          <Descriptions.Item label="倍数">{data.ratio.toFixed(2)}x median</Descriptions.Item>
          <Descriptions.Item label="前三帧均值">{data.prevThreeAvg?.toFixed(1) || '-'}ms</Descriptions.Item>
          <Descriptions.Item label="分类">{data.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="主导 Marker" span={2}>
            <span style={{ color: 'var(--color-error)' }}>{data.dominantMarker || '-'}</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {data.hotPath && (
        <Card size="small" title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>热路径 (Hot Path)</span>}>
          <CallChainTree callChain={data.hotPath} />
        </Card>
      )}

      {data.callTreeSummary && (
        <Card size="small" title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>调用树</span>}>
          <CallChainTree treeSummary={data.callTreeSummary} maxDepth={8} />
        </Card>
      )}

      <Card
        size="small"
        title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>AI 分析</span>}
        extra={triggerButton}
      >
        {aiSection ? (
          <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '4px 0' }}>暂无 AI 分析内容</div>
        )}
        {resultContent}
      </Card>
    </div>
  );
};

const SpikeDetail: React.FC<{ data: any; reportMarkdown: string }> = ({ data, reportMarkdown }) => {
  const aiSection = useMemo(
    () => extractReportSections(reportMarkdown, [data.name]),
    [reportMarkdown, data.name],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small" title={<span style={{ color: 'var(--text-primary)' }}>{data.name}</span>} extra={<Tag color="volcano">波动 {data.spikeRatio.toFixed(0)}x</Tag>}>
        <Descriptions size="small" column={3} labelStyle={{ color: 'var(--text-secondary)' }} contentStyle={{ color: 'var(--text-primary)' }}>
          <Descriptions.Item label="self 均值">{data.msSelfMean.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="self 中位">{data.msSelfMedian.toFixed(3)}ms</Descriptions.Item>
          <Descriptions.Item label="self 最大">{data.msSelfMax.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="Spike 倍数">{data.spikeRatio.toFixed(1)}x</Descriptions.Item>
          <Descriptions.Item label="触发帧数">{data.spikeFrameCount}</Descriptions.Item>
          <Descriptions.Item label="总帧数">{data.totalFrameCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      {aiSection && (
        <Card size="small" title={<span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>AI 分析</span>}>
          <div className="markdown-body" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
};

const IssueDetail: React.FC<IssueDetailProps> = ({ issue, reportMarkdown, sessionId }) => {
  if (!issue) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description={<span style={{ color: 'var(--text-secondary)' }}>选择左侧问题查看详情</span>} />
      </div>
    );
  }

  switch (issue.type) {
    case 'hotspot':
      return <HotspotDetail data={issue.data} reportMarkdown={reportMarkdown} sessionId={sessionId} />;
    case 'jank':
      return <JankDetail data={issue.data} reportMarkdown={reportMarkdown} sessionId={sessionId} />;
    case 'spike':
      return <SpikeDetail data={issue.data} reportMarkdown={reportMarkdown} />;
    default:
      return null;
  }
};

export default IssueDetail;
