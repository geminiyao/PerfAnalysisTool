import React, { useMemo } from 'react';
import { Card, Descriptions, Tag, Empty } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CallChainTree from './CallChainTree';
import type { Issue } from './IssueList';

interface IssueDetailProps {
  issue: Issue | null;
  /** 完整的 AI 报告 markdown */
  reportMarkdown: string;
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

/** 热点 Marker 详情 */
const HotspotDetail: React.FC<{ data: any; reportMarkdown: string }> = ({ data, reportMarkdown }) => {
  const aiSection = useMemo(
    () => extractReportSections(reportMarkdown, [data.name]),
    [reportMarkdown, data.name],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 指标卡片 */}
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

      {/* 调用链 */}
      {data.callChain && !data.callChain.startsWith('(depth=') && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>调用链</span>}>
          <CallChainTree callChain={data.callChain} />
        </Card>
      )}

      {/* AI 分析 */}
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

/** Jank 帧详情 */
const JankDetail: React.FC<{ data: any; reportMarkdown: string }> = ({ data, reportMarkdown }) => {
  const aiSection = useMemo(() => {
    const keywords = [
      `帧 #${data.frameIndex}`,
      `#${data.frameIndex}`,
      data.dominantMarker || '',
    ].filter(Boolean);
    return extractReportSections(reportMarkdown, keywords);
  }, [reportMarkdown, data.frameIndex, data.dominantMarker]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 指标卡片 */}
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

      {/* 热路径 */}
      {data.hotPath && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>热路径 (Hot Path)</span>}>
          <CallChainTree callChain={data.hotPath} />
        </Card>
      )}

      {/* 调用树摘要 */}
      {data.callTreeSummary && (
        <Card size="small" title={<span style={{ color: '#888', fontSize: 13 }}>调用树</span>}>
          <CallChainTree treeSummary={data.callTreeSummary} maxDepth={8} />
        </Card>
      )}

      {/* AI 分析 */}
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
const IssueDetail: React.FC<IssueDetailProps> = ({ issue, reportMarkdown }) => {
  if (!issue) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description={<span style={{ color: '#888' }}>选择左侧问题查看详情</span>} />
      </div>
    );
  }

  switch (issue.type) {
    case 'hotspot':
      return <HotspotDetail data={issue.data} reportMarkdown={reportMarkdown} />;
    case 'jank':
      return <JankDetail data={issue.data} reportMarkdown={reportMarkdown} />;
    case 'spike':
      return <SpikeDetail data={issue.data} reportMarkdown={reportMarkdown} />;
    default:
      return null;
  }
};

export default IssueDetail;
