import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Card, Descriptions, Tag, Empty, Button, Tooltip, message } from 'antd';
import { ThunderboltOutlined, SettingOutlined, LoadingOutlined, LinkOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CallChainTree from './CallChainTree';
import SourcePathSetting from './SourcePathSetting';
import { getSourcePathConfig, triggerMapSource, requestOptimizeSuggest } from '../services/api';
import type { Issue } from './IssueList';
import type { OptimizeSuggestRequest, OptimizeSuggestEvent } from '../../shared/types';

interface IssueDetailProps {
  issue: Issue | null;
  /** 完整的 AI 报告 markdown */
  reportMarkdown: string;
  sessionId: string;
}

/**
 * 从 markdown 报告中提取与指定 marker 或帧号相关的段落
 * 匹配 "### 热点 #N：MarkerName" 或 "### BigJank #N：帧 #frameIndex" 等
 */
function extractReportSections(markdown: string, keywords: string[]): string {
  if (!markdown || keywords.length === 0) return '';

  const lines = markdown.split('\n');
  const sections: string[] = [];
  let capturing = false;
  let currentSection: string[] = [];

  for (const line of lines) {
    // 匹配 ### 标题行
    if (line.match(/^###\s/)) {
      // 结束上一个捕获
      if (capturing && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }

      // 检查这个标题是否包含关键词
      const titleLower = line.toLowerCase();
      capturing = keywords.some(kw => titleLower.includes(kw.toLowerCase()));

      if (capturing) {
        currentSection.push(line);
      }
    } else if (line.match(/^##\s/)) {
      // 遇到 ## 级标题，结束捕获
      if (capturing && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      capturing = false;
    } else if (capturing) {
      currentSection.push(line);
    }
  }

  // 最后一段
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
    // 如果无法解析出结构化的 diff，回退到原始 markdown
    return result;
  }, [markdown]);

  if (blocks.length === 0) {
    return (
      <div className="markdown-body" style={{ color: '#d4d4d4', fontSize: 13 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {blocks.map((block, idx) => (
        <div key={idx}>
          {block.filePath && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontFamily: 'monospace' }}>
              <LinkOutlined style={{ marginRight: 4 }} />{block.filePath}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{
                fontSize: 11, color: '#ff7875', fontWeight: 600,
                padding: '4px 10px', background: 'rgba(255,77,79,0.08)',
                borderRadius: '6px 6px 0 0', borderBottom: '1px solid rgba(255,77,79,0.15)',
              }}>
                修改前
              </div>
              <pre style={{
                margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
                background: '#1a1020', borderRadius: '0 0 6px 6px',
                overflow: 'auto', color: '#d4d4d4', fontFamily: 'Consolas, Monaco, monospace',
                border: '1px solid rgba(255,77,79,0.1)', borderTop: 'none',
              }}>
                {block.before || '(无)'}
              </pre>
            </div>
            <div>
              <div style={{
                fontSize: 11, color: '#52c41a', fontWeight: 600,
                padding: '4px 10px', background: 'rgba(82,196,26,0.08)',
                borderRadius: '6px 6px 0 0', borderBottom: '1px solid rgba(82,196,26,0.15)',
              }}>
                修改后
              </div>
              <pre style={{
                margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
                background: '#101a20', borderRadius: '0 0 6px 6px',
                overflow: 'auto', color: '#d4d4d4', fontFamily: 'Consolas, Monaco, monospace',
                border: '1px solid rgba(82,196,26,0.1)', borderTop: 'none',
              }}>
                {block.after || '(无)'}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// 结构化结果展示
// ============================================================

const sectionCardStyle: React.CSSProperties = {
  background: '#0d1117', borderRadius: 6,
  border: '1px solid #1a1a2e', padding: '10px 14px', marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#d4d4d4', marginBottom: 8,
  display: 'flex', alignItems: 'center', gap: 6,
};

const StructuredResult: React.FC<{ result: string; loading: boolean }> = ({ result, loading }) => {
  const parsed = useMemo(() => parseOptimizeResult(result), [result]);
  const hasStructure = parsed.rootCause || parsed.suggestions || parsed.codeDiff;

  if (!hasStructure) {
    return (
      <div className="markdown-body" style={{ color: '#d4d4d4', fontSize: 13 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        {loading && <span style={{ color: '#faad14' }}>▊</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {parsed.rootCause && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: '#ff4d4f' }}>●</span> 根因分析
          </div>
          <div className="markdown-body" style={{ color: '#b5b5b5', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.rootCause}</ReactMarkdown>
          </div>
        </div>
      )}

      {parsed.suggestions && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: '#faad14' }}>●</span> 优化建议
          </div>
          <div className="markdown-body" style={{ color: '#b5b5b5', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.suggestions}</ReactMarkdown>
          </div>
        </div>
      )}

      {parsed.codeDiff && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: '#52c41a' }}>●</span> 代码对比
          </div>
          <CodeDiffView markdown={parsed.codeDiff} />
        </div>
      )}

      {parsed.extra && (
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>
            <span style={{ color: '#1890ff' }}>●</span> 补充说明
          </div>
          <div className="markdown-body" style={{ color: '#888', fontSize: 12 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.extra}</ReactMarkdown>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 4 }}>
          <span style={{ color: '#faad14' }}>▊ 生成中...</span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// AI 优化建议面板
// ============================================================

function useOptimize(props: {
  sessionId: string;
  issueType: 'hotspot' | 'jank' | 'spike';
  markerName: string;
  callChain?: string;
  hotPath?: string;
  perfContext: OptimizeSuggestRequest['perfContext'];
}) {
  const { sessionId, issueType, markerName, callChain, hotPath, perfContext } = props;
  const [showSetting, setShowSetting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [result, setResult] = useState('');
  const [sourceFiles, setSourceFiles] = useState<{ path: string; line: number }[]>([]);
  const [error, setError] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);

  const handleOptimize = useCallback(async () => {
    setError('');
    setResult('');
    setSourceFiles([]);

    let config;
    try {
      config = await getSourcePathConfig();
    } catch (e: any) {
      setError(e.message);
      return;
    }

    if (!config.configured) {
      setShowSetting(true);
      return;
    }

    setMapping(true);
    try {
      await triggerMapSource(sessionId);
    } catch { /* proceed without map */ }
    setMapping(false);

    setLoading(true);
    const body: OptimizeSuggestRequest = {
      sessionId, issueType, markerName, callChain, hotPath, perfContext,
    };

    cancelRef.current = requestOptimizeSuggest(
      body,
      (event: OptimizeSuggestEvent) => {
        if (event.type === 'source_found' && event.sourceFiles) {
          setSourceFiles(event.sourceFiles);
        } else if (event.type === 'chunk' && event.text) {
          setResult(prev => prev + event.text);
        } else if (event.type === 'error') {
          setError(event.error || '未知错误');
        }
      },
      () => setLoading(false),
      (err) => { setError(err); setLoading(false); },
    );
  }, [sessionId, issueType, markerName, callChain, hotPath, perfContext]);

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    setLoading(false);
  }, []);

  /** 标题栏按钮（放在 Card extra） */
  const triggerButton = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {error && (
        <Tooltip title={error}>
          <span style={{ color: '#ff4d4f', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {error.length > 30 ? error.slice(0, 30) + '...' : error}
          </span>
        </Tooltip>
      )}
      <Tooltip title="设置源码路径">
        <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => setShowSetting(true)} style={{ color: '#555' }} />
      </Tooltip>
      {loading ? (
        <Button size="small" type="text" onClick={handleCancel} style={{ color: '#888', fontSize: 12 }}>
          <LoadingOutlined style={{ marginRight: 4 }} />取消
        </Button>
      ) : (
        <Button
          size="small"
          icon={mapping ? <LoadingOutlined /> : <ThunderboltOutlined />}
          loading={mapping}
          onClick={handleOptimize}
          style={{
            borderColor: error ? '#ff4d4f' : '#faad14',
            color: error ? '#ff4d4f' : '#faad14',
            background: 'transparent',
            fontSize: 12,
          }}
        >
          {mapping ? '映射源码...' : error ? '重试' : result ? '重新生成' : '生成优化方案'}
        </Button>
      )}
    </div>
  );

  /** 结果内容区（放在 Card 内容底部） */
  const resultContent = (
    <>
      {error && (
        <div style={{ borderTop: '1px solid #1a1a2e', margin: '12px 0 0', padding: '8px 0 0' }}>
          <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 6 }}>{error}</div>
          <Button size="small" onClick={handleOptimize}>重试</Button>
        </div>
      )}

      {loading && !result && (
        <div style={{ borderTop: '1px solid #1a1a2e', margin: '12px 0 0', padding: '10px 0 0', textAlign: 'center', color: '#888' }}>
          <LoadingOutlined style={{ fontSize: 16, marginBottom: 6 }} />
          <div style={{ fontSize: 12 }}>AI 正在分析源码并生成优化方案...</div>
        </div>
      )}

      {sourceFiles.length > 0 && (
        <div style={{ borderTop: '1px solid #1a1a2e', margin: '12px 0 0', padding: '8px 0 0' }}>
          <div style={{ padding: '5px 8px', background: 'rgba(82,196,26,0.06)', borderRadius: 4, border: '1px solid rgba(82,196,26,0.1)' }}>
            <div style={{ fontSize: 11, color: '#52c41a', marginBottom: 2 }}>
              <LinkOutlined /> 已定位 {sourceFiles.length} 个源码文件
            </div>
            {sourceFiles.slice(0, 5).map((f, i) => (
              <div key={i} style={{ fontSize: 11, color: '#888', fontFamily: 'Consolas, monospace' }}>
                {f.path}:{f.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div style={{ borderTop: '1px solid #1a1a2e', margin: '12px 0 0', padding: '8px 0 0' }}>
          <StructuredResult result={result} loading={loading} />
        </div>
      )}

      <SourcePathSetting
        open={showSetting}
        onClose={(configured) => {
          setShowSetting(false);
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

/** 热点 Marker 详情 */
const HotspotDetail: React.FC<{ data: any; reportMarkdown: string; sessionId: string }> = ({ data, reportMarkdown, sessionId }) => {
  const aiSection = useMemo(
    () => extractReportSections(reportMarkdown, [data.name]),
    [reportMarkdown, data.name],
  );

  const { triggerButton, resultContent } = useOptimize({
    sessionId,
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
      <Card size="small" title={<span style={{ color: '#d4d4d4' }}>{data.name}</span>} extra={<Tag color="red">热点</Tag>}>
        <Descriptions size="small" column={3} labelStyle={{ color: '#888' }} contentStyle={{ color: '#d4d4d4' }}>
          <Descriptions.Item label="self 均值">{data.msSelfMean.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="self 最大">{data.msSelfMax.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="占帧比例">{data.percentOfFrame.toFixed(1)}%</Descriptions.Item>
          <Descriptions.Item label="每帧调用">{data.callsPerFrame.toFixed(1)} 次</Descriptions.Item>
          <Descriptions.Item label="出现帧数">{data.presentOnFrameCount}</Descriptions.Item>
          <Descriptions.Item label="线程">{data.thread}</Descriptions.Item>
        </Descriptions>
        {data.mustReportReason && (
          <div style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(255,77,79,0.06)', borderRadius: 4, fontSize: 11, color: '#ff7875' }}>
            判定依据: {data.mustReportReason}
          </div>
        )}
      </Card>

      {data.callChain && !data.callChain.startsWith('(depth=') && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>调用链</span>}>
          <CallChainTree callChain={data.callChain} />
        </Card>
      )}

      <Card
        size="small"
        title={<span style={{ color: '#888', fontSize: 13 }}>AI 分析</span>}
        extra={triggerButton}
      >
        {aiSection ? (
          <div className="markdown-body" style={{ color: '#d4d4d4', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: '#666', fontSize: 13, padding: '4px 0' }}>暂无 AI 分析内容</div>
        )}
        {resultContent}
      </Card>
    </div>
  );
};

/** Jank 帧详情 */
const JankDetail: React.FC<{ data: any; reportMarkdown: string; sessionId: string }> = ({ data, reportMarkdown, sessionId }) => {
  const aiSection = useMemo(() => {
    const keywords = [
      `帧 #${data.frameIndex}`,
      `#${data.frameIndex}`,
      data.dominantMarker || '',
    ].filter(Boolean);
    return extractReportSections(reportMarkdown, keywords);
  }, [reportMarkdown, data.frameIndex, data.dominantMarker]);

  const { triggerButton, resultContent } = useOptimize({
    sessionId,
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
        title={<span style={{ color: '#d4d4d4' }}>帧 #{data.frameIndex}</span>}
        extra={<Tag color={data.jankLevel === 'BigJank' ? 'red' : 'orange'}>{data.jankLevel}</Tag>}
      >
        <Descriptions size="small" column={3} labelStyle={{ color: '#888' }} contentStyle={{ color: '#d4d4d4' }}>
          <Descriptions.Item label="帧耗时">{data.msFrame.toFixed(1)}ms</Descriptions.Item>
          <Descriptions.Item label="倍数">{data.ratio.toFixed(2)}x median</Descriptions.Item>
          <Descriptions.Item label="前三帧均值">{data.prevThreeAvg?.toFixed(1) || '-'}ms</Descriptions.Item>
          <Descriptions.Item label="分类">{data.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="主导 Marker" span={2}>
            <span style={{ color: '#ff7875' }}>{data.dominantMarker || '-'}</span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {data.hotPath && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>热路径 (Hot Path)</span>}>
          <CallChainTree callChain={data.hotPath} />
        </Card>
      )}

      {data.callTreeSummary && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>调用树</span>}>
          <CallChainTree treeSummary={data.callTreeSummary} maxDepth={8} />
        </Card>
      )}

      <Card
        size="small"
        title={<span style={{ color: '#888', fontSize: 13 }}>AI 分析</span>}
        extra={triggerButton}
      >
        {aiSection ? (
          <div className="markdown-body" style={{ color: '#d4d4d4', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: '#666', fontSize: 13, padding: '4px 0' }}>暂无 AI 分析内容</div>
        )}
        {resultContent}
      </Card>
    </div>
  );
};

/** 波动 Marker 详情 */
const SpikeDetail: React.FC<{ data: any; reportMarkdown: string }> = ({ data, reportMarkdown }) => {
  const aiSection = useMemo(
    () => extractReportSections(reportMarkdown, [data.name]),
    [reportMarkdown, data.name],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small" title={<span style={{ color: '#d4d4d4' }}>{data.name}</span>} extra={<Tag color="volcano">波动 {data.spikeRatio.toFixed(0)}x</Tag>}>
        <Descriptions size="small" column={3} labelStyle={{ color: '#888' }} contentStyle={{ color: '#d4d4d4' }}>
          <Descriptions.Item label="self 均值">{data.msSelfMean.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="self 中位">{data.msSelfMedian.toFixed(3)}ms</Descriptions.Item>
          <Descriptions.Item label="self 最大">{data.msSelfMax.toFixed(2)}ms</Descriptions.Item>
          <Descriptions.Item label="Spike 倍数">{data.spikeRatio.toFixed(1)}x</Descriptions.Item>
          <Descriptions.Item label="触发帧数">{data.spikeFrameCount}</Descriptions.Item>
          <Descriptions.Item label="总帧数">{data.totalFrameCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      {aiSection && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>AI 分析</span>}>
          <div className="markdown-body" style={{ color: '#d4d4d4', fontSize: 13 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSection}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
};

/** 问题详情面板 */
const IssueDetail: React.FC<IssueDetailProps> = ({ issue, reportMarkdown, sessionId }) => {
  if (!issue) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description={<span style={{ color: '#888' }}>选择左侧问题查看详情</span>} />
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
