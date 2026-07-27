import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, Input, List, Progress, Row, Segmented, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BookOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  FileMarkdownOutlined,
  LinkOutlined,
  SearchOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getReportPreviewSample, listReportPreviewSamples, type ReportPreviewDetail, type ReportPreviewSample } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Text, Title, Paragraph } = Typography;

type Tone = 'red' | 'gold' | 'blue' | 'green' | 'purple' | 'default';
type ReportBlockType = 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote' | 'hr';

type ReportBlock = {
  id: string;
  type: ReportBlockType;
  level?: number;
  title?: string;
  content: string;
  lang?: string;
  rows?: string[][];
};

type ReportSection = {
  id: string;
  title: string;
  level: number;
  blocks: ReportBlock[];
  summary: string;
  tags: string[];
};

type ParsedReport = {
  title: string;
  shortHeadline: string;
  conclusion: string;
  blocks: ReportBlock[];
  sections: ReportSection[];
  outline: { id: string; title: string; level: number }[];
  metrics: MetricCard[];
  actions: string[];
  risks: string[];
  fidelity: { blockCount: number; charCount: number; renderedCount: number };
};

type MetricCard = { label: string; value: string; suffix?: string; tone: Tone; source?: string };

const toneColor: Record<Tone, string> = {
  red: '#ff4d4f',
  gold: '#faad14',
  blue: '#1677ff',
  green: '#52c41a',
  purple: '#9254de',
  default: '#8b949e',
};

const sourceLabel: Record<ReportPreviewSample['kind'], string> = {
  unity: 'Unity Profiler',
  simpleperf: 'simpleperf',
  perfetto: 'Perfetto',
  cross: 'Cross Source',
};

const kindColor: Record<ReportPreviewSample['kind'], string> = {
  unity: 'green',
  simpleperf: 'blue',
  perfetto: 'purple',
  cross: 'gold',
};

const ReportPreview: React.FC = () => {
  const [samples, setSamples] = useState<ReportPreviewSample[]>([]);
  const [activeKey, setActiveKey] = useState('unity-single');
  const [detail, setDetail] = useState<ReportPreviewDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    listReportPreviewSamples()
      .then(res => {
        setSamples(res.items);
        if (!res.items.some(item => item.key === activeKey) && res.items[0]) setActiveKey(res.items[0].key);
      })
      .finally(() => setLoadingList(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoadingDetail(true);
    getReportPreviewSample(activeKey)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [activeKey]);

  const filteredSamples = samples.filter(item => modeFilter === 'all' || item.mode === modeFilter);
  const parsed = useMemo(() => parseReport(detail?.markdown ?? '', detail), [detail]);

  return (
    <div style={{ maxWidth: 1720, margin: '0 auto' }}>
      <Row gutter={[14, 14]} align="top">
        <Col xs={24} xl={5}>
          <ReportSelector
            samples={filteredSamples}
            activeKey={activeKey}
            modeFilter={modeFilter}
            loading={loadingList}
            onModeFilter={setModeFilter}
            onSelect={setActiveKey}
          />
        </Col>
        <Col xs={24} xl={19}>
          {loadingDetail ? (
            <Card><div style={{ padding: 80, textAlign: 'center' }}><Spin size="large" /></div></Card>
          ) : detail ? (
            <ReportDocument detail={detail} parsed={parsed} query={query} onQuery={setQuery} />
          ) : (
            <Card><Empty description="报告加载失败" /></Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

function ReportSelector({ samples, activeKey, modeFilter, loading, onModeFilter, onSelect }: {
  samples: ReportPreviewSample[];
  activeKey: string;
  modeFilter: string;
  loading: boolean;
  onModeFilter: (value: string) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <Card title="报告类型" size="small" style={{ position: 'sticky', top: 12 }}>
      <Segmented
        block
        size="small"
        value={modeFilter}
        onChange={v => onModeFilter(String(v))}
        options={[{ label: '全部', value: 'all' }, { label: '单次', value: 'single' }, { label: '对比', value: 'diff' }]}
        style={{ marginBottom: 12 }}
      />
      {loading ? <Spin /> : (
        <List
          dataSource={samples}
          renderItem={item => (
            <List.Item
              onClick={() => onSelect(item.key)}
              style={{
                cursor: 'pointer',
                border: activeKey === item.key ? '1px solid var(--color-primary)' : '1px solid var(--border-primary)',
                background: activeKey === item.key ? 'var(--color-primary-bg)' : 'var(--bg-card-inner)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 9,
              }}
            >
              <Space direction="vertical" size={5} style={{ width: '100%' }}>
                <Space wrap size={4}>
                  <Tag color={kindColor[item.kind]}>{sourceLabel[item.kind]}</Tag>
                  <Tag color={item.mode === 'diff' ? 'red' : 'blue'}>{item.mode === 'diff' ? '对比' : '单次'}</Tag>
                </Space>
                <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
                <Text style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.45 }}>{item.description}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function ReportDocument({ detail, parsed, query, onQuery }: { detail: ReportPreviewDetail; parsed: ParsedReport; query: string; onQuery: (value: string) => void }) {
  const theme = reportTheme(detail.kind, detail.mode);
  const sections = useMemo(() => filterSections(parsed.sections, query), [parsed.sections, query]);

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card bodyStyle={{ padding: 0 }} style={{ overflow: 'hidden' }}>
        <div style={{ padding: 18, background: theme.gradient }}>
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} lg={17}>
              <Space direction="vertical" size={8}>
                <Space wrap>
                  <Tag color={theme.tagColor}>{sourceLabel[detail.kind]}</Tag>
                  <Tag color={detail.mode === 'diff' ? 'red' : 'blue'}>{detail.mode === 'diff' ? '对比分析' : '单次分析'}</Tag>
                  <Tag color="default">{detail.relativePath}</Tag>
                </Space>
                <Title level={3} style={{ margin: 0, lineHeight: 1.25 }}>{parsed.title}</Title>
                <Text style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65 }}>
                  {parsed.shortHeadline || detail.description}
                </Text>
              </Space>
            </Col>
            <Col xs={24} lg={7}>
              <CompactMetrics metrics={parsed.metrics.slice(0, 4)} />
            </Col>
          </Row>
        </div>
      </Card>

      <Toolbar detail={detail} parsed={parsed} query={query} onQuery={onQuery} />

      <Row gutter={[14, 14]} align="top">
        <Col xs={24} xxl={18}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <ExecutiveSummary parsed={parsed} detail={detail} />
            <SectionOverview sections={sections} />
            <SectionReadingFlow sections={sections} detail={detail} />
          </Space>
        </Col>
        <Col xs={24} xxl={6}>
          <Space direction="vertical" size={14} style={{ width: '100%', position: 'sticky', top: 12 }}>
            <OutlinePanel outline={parsed.outline} />
            <FidelityPanel parsed={parsed} markdown={detail.markdown} />
            <RawMarkdownPanel detail={detail} />
          </Space>
        </Col>
      </Row>
    </Space>
  );
}

function Toolbar({ detail, parsed, query, onQuery }: { detail: ReportPreviewDetail; parsed: ParsedReport; query: string; onQuery: (value: string) => void }) {
  return (
    <Card size="small">
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索报告章节" value={query} onChange={e => onQuery(e.target.value)} style={{ width: 260 }} />
          <Tag color="green">主信息 / 一级结构 / 详细信息</Tag>
          <Tag color="blue">一级章节 {parsed.sections.length}</Tag>
          <Tag color="gold">全文 {parsed.fidelity.charCount.toLocaleString()} 字符</Tag>
        </Space>
        <Button icon={<DownloadOutlined />} onClick={() => downloadTextFile(`${detail.key}.md`, detail.markdown)}>下载 Markdown</Button>
      </Space>
    </Card>
  );
}

function ExecutiveSummary({ parsed, detail }: { parsed: ParsedReport; detail: ReportPreviewDetail }) {
  const tone = inferTone(parsed.conclusion || parsed.shortHeadline);
  return (
    <Row gutter={[14, 14]}>
      <Col xs={24} lg={14}>
        <Card title={<SectionTitle icon={<ThunderboltOutlined />} text="主要信息" />} style={{ height: '100%' }}>
          <Alert
            type={tone === 'green' ? 'success' : tone === 'gold' ? 'warning' : 'error'}
            showIcon
            message={<Text strong style={{ fontSize: 15 }}>{parsed.shortHeadline || detail.label}</Text>}
            description={<Paragraph style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.72 }} ellipsis={{ rows: 4, expandable: true, symbol: '展开完整结论' }}><InlineInsight text={parsed.conclusion || detail.description} /></Paragraph>}
          />
        </Card>
      </Col>
      <Col xs={24} lg={5}>
        <Card title={<SectionTitle icon={<ExclamationCircleOutlined />} text="风险/瓶颈" />} style={{ height: '100%' }}>
          <CompactSignalList items={parsed.risks} tone="red" empty="未识别明显风险" />
        </Card>
      </Col>
      <Col xs={24} lg={5}>
        <Card title={<SectionTitle icon={<CheckCircleOutlined />} text="建议/行动" />} style={{ height: '100%' }}>
          <CompactSignalList items={parsed.actions} tone="green" empty="未识别建议" />
        </Card>
      </Col>
    </Row>
  );
}

function CompactMetrics({ metrics }: { metrics: MetricCard[] }) {
  return (
    <Row gutter={[8, 8]}>
      {metrics.map(metric => (
        <Col span={12} key={`${metric.label}-${metric.value}`}>
          <div style={{ background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.10)', borderRadius: 8, padding: '8px 10px' }}>
            <Text style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{metric.label}</Text>
            <div className="mono" style={{ color: toneColor[metric.tone], fontSize: 18, fontWeight: 750, lineHeight: 1.2 }}>
              {metric.value}<span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 3 }}>{metric.suffix}</span>
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

function CompactSignalList({ items, tone, empty }: { items: string[]; tone: Tone; empty: string }) {
  return items.length ? (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {items.slice(0, 3).map((item, index) => (
        <div key={`${item}-${index}`} style={{ borderBottom: index === Math.min(items.length, 3) - 1 ? 0 : '1px solid var(--border-primary)', paddingBottom: 8 }}>
          <Space align="start" size={6}>
            <Tag color={tone === 'green' ? (index === 0 ? 'red' : 'green') : 'red'}>{tone === 'green' ? (index === 0 ? 'P0' : 'P1') : 'Risk'}</Tag>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }} ellipsis={{ tooltip: item }}><InlineInsight text={shortenText(item, 88)} /></Text>
          </Space>
        </div>
      ))}
    </Space>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
}

function SectionOverview({ sections }: { sections: ReportSection[] }) {
  return (
    <Card title={<SectionTitle icon={<BookOutlined />} text="一级结构" />} extra={<Tag color="blue">默认摘要，细节在下方折叠</Tag>}>
      <Row gutter={[10, 10]}>
        {sections.slice(0, 12).map((section, index) => (
          <Col xs={24} md={12} xl={8} key={section.id}>
            <a href={`#${section.id}`} style={{ color: 'inherit' }}>
              <div style={{ height: '100%', border: '1px solid var(--border-primary)', background: 'var(--bg-card-inner)', borderRadius: 10, padding: 12 }}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space>
                    <Text className="mono" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text strong ellipsis style={{ maxWidth: 210 }}>{section.title}</Text>
                  </Space>
                  <Paragraph style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.55 }} ellipsis={{ rows: 2 }}>
                    {section.summary || '该章节以详细块完整保留。'}
                  </Paragraph>
                  <Space wrap size={4}>{section.tags.slice(0, 3).map(tag => <Tag key={tag}>{tag}</Tag>)}</Space>
                </Space>
              </div>
            </a>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

function SectionReadingFlow({ sections, detail }: { sections: ReportSection[]; detail: ReportPreviewDetail }) {
  return (
    <Card title={<SectionTitle icon={<FileMarkdownOutlined />} text="详细信息" />} extra={<Tag color="green">完整内容折叠保留</Tag>}>
      {sections.length ? (
        <Collapse
          bordered={false}
          defaultActiveKey={sections.slice(0, 2).map(section => section.id)}
          items={sections.map((section, index) => ({
            key: section.id,
            label: <SectionCollapseLabel section={section} index={index} detail={detail} />,
            children: <SectionDetail section={section} />,
          }))}
        />
      ) : <Empty description="没有匹配的章节" />}
    </Card>
  );
}

function SectionCollapseLabel({ section, index, detail }: { section: ReportSection; index: number; detail: ReportPreviewDetail }) {
  const accent = detail.kind === 'unity' ? 'green' : detail.kind === 'simpleperf' ? 'blue' : detail.kind === 'perfetto' ? 'purple' : 'gold';
  return (
    <Row gutter={[10, 6]} align="middle">
      <Col flex="36px"><Text className="mono" style={{ color: toneColor[accent as Tone], fontWeight: 800 }}>{String(index + 1).padStart(2, '0')}</Text></Col>
      <Col flex="auto">
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Text strong>{section.title}</Text>
          <Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }} ellipsis>{section.summary || '展开查看完整 Markdown 转译内容'}</Text>
        </Space>
      </Col>
      <Col><Space wrap size={4}>{section.tags.slice(0, 3).map(tag => <Tag color={accent} key={tag}>{tag}</Tag>)}</Space></Col>
    </Row>
  );
}

function SectionDetail({ section }: { section: ReportSection }) {
  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {section.blocks.map(block => <DetailBlock key={block.id} block={block} />)}
    </Space>
  );
}

function DetailBlock({ block }: { block: ReportBlock }) {
  if (block.type === 'table') return <TableBlock block={block} />;
  if (block.type === 'code') return <CodeBlock block={block} />;
  if (block.type === 'quote') return <QuoteBlock block={block} />;
  if (block.type === 'list') return looksLikeTree(block.content) ? <RawStructureBlock content={block.content} /> : <ListBlock block={block} />;
  if (block.type === 'paragraph') return looksLikeTree(block.content) ? <RawStructureBlock content={block.content} /> : <ParagraphBlock block={block} />;
  if (block.type === 'hr') return <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />;
  return null;
}

function ParagraphBlock({ block }: { block: ReportBlock }) {
  const isInsight = /结论|摘要|瓶颈|风险|回归|建议|优化|证据|GC|P95|FPS|Running|Wait|CPU-bound/i.test(block.content);
  return (
    <div style={{ borderLeft: isInsight ? `3px solid ${toneColor[inferTone(block.content)]}` : '3px solid transparent', padding: '2px 0 2px 10px' }}>
      <Paragraph style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.72 }}>
        <InlineInsight text={cleanInlineMarkdown(block.content)} />
      </Paragraph>
    </div>
  );
}

function ListBlock({ block }: { block: ReportBlock }) {
  const items = block.content.split('\n').map(line => cleanInlineMarkdown(line.replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+[.)]\s+/, ''))).filter(Boolean);
  const actionLike = /建议|优化|修复|行动|P0|P1|优先|should|recommend/i.test(block.content);
  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(item, index) => (
        <List.Item style={{ borderBottom: '1px solid var(--border-primary)', padding: '7px 0' }}>
          <Space align="start">
            <Tag color={actionLike ? (index < 2 ? 'red' : 'green') : 'blue'}>{actionLike ? (index < 2 ? 'P0' : 'P1') : index + 1}</Tag>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65 }}><InlineInsight text={item} /></Text>
          </Space>
        </List.Item>
      )}
    />
  );
}

function TableBlock({ block }: { block: ReportBlock }) {
  const rows = block.rows ?? parseMarkdownTable(block.content);
  const headers = rows[0] ?? [];
  const body = rows.slice(1).filter(row => !row.every(cell => /^:?-{3,}:?$/.test(cell.trim())));
  const columns: ColumnsType<Record<string, string>> = headers.map((header, index) => ({
    title: cleanInlineMarkdown(header) || `列 ${index + 1}`,
    dataIndex: String(index),
    key: String(index),
    render: value => <Text style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' }}><InlineInsight text={String(value ?? '')} /></Text>,
  }));
  const data = body.map((row, rowIndex) => ({ key: String(rowIndex), ...Object.fromEntries(headers.map((_, index) => [String(index), cleanInlineMarkdown(row[index] ?? '')])) }));
  return (
    <div style={{ border: '1px solid var(--border-primary)', background: 'var(--bg-card-inner)', borderRadius: 8, padding: 10 }}>
      <Space style={{ marginBottom: 8 }}><TableOutlined style={{ color: '#1677ff' }} /><Text strong>表格</Text><Tag color="blue">{data.length} rows</Tag></Space>
      <Table size="small" pagination={data.length > 10 ? { pageSize: 10, size: 'small' } : false} columns={columns} dataSource={data} scroll={{ x: true }} />
    </div>
  );
}

function CodeBlock({ block }: { block: ReportBlock }) {
  return <RawStructureBlock content={block.content} title={block.lang ? `代码 / ${block.lang}` : '代码 / 原始片段'} />;
}

function QuoteBlock({ block }: { block: ReportBlock }) {
  return <Alert type="info" showIcon message="引用/说明" description={<Text style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}><InlineInsight text={cleanInlineMarkdown(block.content.replace(/^>\s?/gm, ''))} /></Text>} />;
}

function RawStructureBlock({ content, title = '原始结构' }: { content: string; title?: string }) {
  return (
    <div style={{ border: '1px solid var(--border-primary)', background: '#0b0e11', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-primary)', background: 'rgba(255,255,255,.04)' }}>
        <Text strong style={{ fontSize: 12 }}>{title}</Text>
      </div>
      <pre style={{ margin: 0, padding: 12, overflow: 'auto', color: '#c9d1d9', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre' }}><code>{content}</code></pre>
    </div>
  );
}

function OutlinePanel({ outline }: { outline: ParsedReport['outline'] }) {
  return (
    <Card size="small" title={<SectionTitle icon={<LinkOutlined />} text="目录" />}>
      {outline.length ? (
        <div style={{ maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {outline.slice(0, 36).map(item => (
              <a key={item.id} href={`#${item.id}`} style={{ display: 'block', paddingLeft: Math.max(0, item.level - 1) * 10, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45 }}>
                {item.title}
              </a>
            ))}
          </Space>
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无标题目录" />}
    </Card>
  );
}

function FidelityPanel({ parsed, markdown }: { parsed: ParsedReport; markdown: string }) {
  return (
    <Card size="small" title={<SectionTitle icon={<CheckCircleOutlined />} text="完整性" />}>
      <Progress percent={100} strokeColor="#52c41a" />
      <Space direction="vertical" size={5} style={{ width: '100%' }}>
        <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>原文字符：{markdown.length.toLocaleString()}</Text>
        <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>渲染块：{parsed.fidelity.renderedCount}/{parsed.fidelity.blockCount}</Text>
        <Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>默认折叠详细信息，避免滚动长度超过原文。</Text>
      </Space>
    </Card>
  );
}

function RawMarkdownPanel({ detail }: { detail: ReportPreviewDetail }) {
  return (
    <Card size="small" title={<SectionTitle icon={<FileMarkdownOutlined />} text="原文" />}>
      <Button block icon={<DownloadOutlined />} onClick={() => downloadTextFile(`${detail.key}.md`, detail.markdown)}>下载 Markdown</Button>
    </Card>
  );
}

function InlineInsight({ text }: { text: string }) {
  const parts = text.split(/(CPU-bound|GPU-bound|Wait-bound|GC\.Alloc|GC\.Collect|GC|P95|P99|FPS|Jank|Running|Sleeping|Runnable|Wait|Thermal|回归|瓶颈|风险|建议|优化|达标|异常|\+?-?\d+(?:\.\d+)?\s*(?:ms|fps|%|次\/帧|samples)?|Assets\/[\w./-]+:\d+)/gi);
  return <>{parts.map((part, index) => renderInlinePart(part, index))}</>;
}

function renderInlinePart(part: string, index: number) {
  if (!part) return null;
  if (/^Assets\//.test(part)) return <Text key={index} code style={{ fontSize: 12 }}>{part}</Text>;
  if (/^\+?-?\d/.test(part.trim())) return <Text key={index} className="mono" style={{ color: '#69c0ff', fontWeight: 700 }}>{part}</Text>;
  if (/GC|Jank|回归|瓶颈|风险|异常/i.test(part)) return <Text key={index} strong style={{ color: '#ff7875' }}>{part}</Text>;
  if (/建议|优化|达标/i.test(part)) return <Text key={index} strong style={{ color: '#73d13d' }}>{part}</Text>;
  if (/CPU-bound|GPU-bound|Wait-bound|Running|Sleeping|Runnable|Wait|Thermal|P95|P99|FPS/i.test(part)) return <Text key={index} strong style={{ color: '#faad14' }}>{part}</Text>;
  return <React.Fragment key={index}>{part}</React.Fragment>;
}

function parseReport(markdown: string, detail: ReportPreviewDetail | null): ParsedReport {
  const blocks = parseBlocks(markdown);
  const outline = blocks.filter(block => block.type === 'heading').map(block => ({ id: block.id, title: block.title || '', level: block.level || 1 }));
  const title = cleanInlineMarkdown(blocks.find(block => block.type === 'heading')?.title || detail?.label || '报告预览');
  const conclusion = findConclusion(blocks) || cleanInlineMarkdown(blocks.find(block => block.type === 'paragraph')?.content || detail?.description || '');
  const plainBlocks = blocks.map(block => cleanInlineMarkdown(block.content)).filter(Boolean);
  const sections = buildSections(blocks);

  return {
    title,
    shortHeadline: shortenConclusion(conclusion || title, 96),
    conclusion,
    blocks,
    sections,
    outline,
    metrics: extractMetrics(markdown, detail),
    actions: plainBlocks.filter(line => /建议|优化|行动|修复|治理|优先|P0|P1/i.test(line)).slice(0, 8),
    risks: plainBlocks.filter(line => /风险|瓶颈|回归|异常|GC|Jank|CPU-bound|Wait|Thermal|P95|P99/i.test(line)).slice(0, 8),
    fidelity: { blockCount: blocks.length, renderedCount: blocks.length, charCount: markdown.length },
  };
}

function buildSections(blocks: ReportBlock[]) {
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;
  const firstHeadingLevel = blocks.find(block => block.type === 'heading')?.level ?? 1;
  const sectionLevel = firstHeadingLevel <= 1 ? 2 : firstHeadingLevel;

  for (const block of blocks) {
    if (block.type === 'heading' && (block.level ?? 9) <= sectionLevel) {
      if (current) sections.push(finalizeSection(current));
      current = { id: block.id, title: block.title || '未命名章节', level: block.level || 1, blocks: [], summary: '', tags: [] };
    } else {
      if (!current) current = { id: 'summary', title: '报告开头', level: 1, blocks: [], summary: '', tags: [] };
      current.blocks.push(block);
    }
  }
  if (current) sections.push(finalizeSection(current));
  return sections.length ? sections : [finalizeSection({ id: 'report', title: '完整报告', level: 1, blocks, summary: '', tags: [] })];
}

function finalizeSection(section: ReportSection): ReportSection {
  const textBlocks = section.blocks.map(block => cleanInlineMarkdown(block.content)).filter(Boolean);
  const summary = textBlocks.find(text => /结论|摘要|瓶颈|回归|建议|风险|P95|FPS|GC/i.test(text)) || textBlocks[0] || '';
  return { ...section, summary: shortenText(summary, 150), tags: inferSectionTags(section) };
}

function inferSectionTags(section: ReportSection) {
  const text = `${section.title}\n${section.blocks.map(block => block.content).join('\n')}`;
  const tags = [
    [/结论|摘要|Summary/i, '结论'],
    [/建议|优化|行动|P0|P1/i, '建议'],
    [/风险|瓶颈|异常|回归/i, '风险'],
    [/GC|Jank|P95|P99|FPS/i, '指标'],
    [/Unity|Marker|PlayerLoop/i, 'Unity'],
    [/simpleperf|samples|SO|symbol/i, 'CPU'],
    [/Perfetto|Running|Wait|Thread/i, 'Perfetto'],
    [/\|.+\|/, '表格'],
  ].flatMap(([regex, tag]) => (regex as RegExp).test(text) ? [tag as string] : []);
  return Array.from(new Set(tags)).slice(0, 5);
}

function parseBlocks(markdown: string): ReportBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReportBlock[] = [];
  let i = 0;
  let seq = 0;
  const usedIds = new Map<string, number>();
  const push = (block: Omit<ReportBlock, 'id'>) => {
    const baseId = block.type === 'heading' ? slugify(block.title || `section-${seq}`) : `block-${seq}`;
    const count = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, count + 1);
    blocks.push({ ...block, id: count ? `${baseId}-${count}` : baseId });
    seq += 1;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { push({ type: 'heading', level: heading[1].length, title: cleanInlineMarkdown(heading[2]), content: heading[2] }); i += 1; continue; }
    const fence = line.match(/^```\s*(\w+)?/);
    if (fence) {
      const lang = fence[1];
      const content: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { content.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      push({ type: 'code', lang, content: content.join('\n') });
      continue;
    }
    if (/^\s*[-*_]{3,}\s*$/.test(line)) { push({ type: 'hr', content: line }); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const content: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { content.push(lines[i]); i += 1; }
      push({ type: 'table', content: content.join('\n'), rows: parseMarkdownTable(content.join('\n')) });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const content: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { content.push(lines[i]); i += 1; }
      push({ type: 'quote', content: content.join('\n') });
      continue;
    }
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) {
      const content: string[] = [];
      while (i < lines.length && (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[i]) || (lines[i].trim() && /^\s{2,}/.test(lines[i])))) { content.push(lines[i]); i += 1; }
      push({ type: 'list', content: content.join('\n') });
      continue;
    }
    const content: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[i]) && !/^\s*[-*_]{3,}\s*$/.test(lines[i])) {
      content.push(lines[i]);
      i += 1;
    }
    push({ type: 'paragraph', content: content.join('\n') });
  }
  return blocks;
}

function parseMarkdownTable(markdown: string) {
  return markdown.split('\n').map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));
}

function findConclusion(blocks: ReportBlock[]) {
  const candidates = blocks.filter(block => block.type === 'paragraph' || block.type === 'list').map(block => cleanInlineMarkdown(block.content));
  return candidates.find(text => /结论|摘要|本次|整体|瓶颈|回归|达标/i.test(text)) || candidates.find(text => text.length > 20) || '';
}

function extractMetrics(markdown: string, detail: ReportPreviewDetail | null): MetricCard[] {
  const patterns: Array<{ label: string; regex: RegExp; suffix?: string; tone: Tone }> = [
    { label: 'FPS', regex: /(?:FPS|fps|实测)\D{0,18}(\d+(?:\.\d+)?)/i, suffix: 'fps', tone: 'green' },
    { label: 'P95', regex: /P95\D{0,18}(\d+(?:\.\d+)?)/i, suffix: 'ms', tone: 'gold' },
    { label: 'P99', regex: /P99\D{0,18}(\d+(?:\.\d+)?)/i, suffix: 'ms', tone: 'gold' },
    { label: '中位帧', regex: /中位帧\D{0,18}(\d+(?:\.\d+)?)/i, suffix: 'ms', tone: 'blue' },
    { label: 'GC.Alloc', regex: /GC\.Alloc\D{0,18}(\d+(?:\.\d+)?)/i, suffix: '次/帧', tone: 'red' },
    { label: 'Running', regex: /Running\D{0,18}(\d+(?:\.\d+)?)/i, suffix: '%', tone: 'purple' },
  ];
  const extracted = patterns.flatMap(pattern => {
    const match = markdown.match(pattern.regex);
    return match ? [{ label: pattern.label, value: match[1], suffix: pattern.suffix, tone: pattern.tone, source: 'md' }] : [];
  });
  return dedupeMetrics([...extracted, ...fallbackMetrics(detail)]).slice(0, 6);
}

function fallbackMetrics(detail: ReportPreviewDetail | null): MetricCard[] {
  if (!detail) return [];
  if (detail.kind === 'unity') return [
    { label: detail.mode === 'diff' ? 'Frame Δ' : 'P95', value: detail.mode === 'diff' ? '+27.9' : '57.1', suffix: 'ms', tone: 'red' },
    { label: 'FPS', value: detail.mode === 'diff' ? '-37.6' : '22.5', suffix: 'fps', tone: 'gold' },
    { label: 'GC', value: '159.9', suffix: '/frame', tone: 'red' },
    { label: 'Marker', value: 'Lua', suffix: 'Tick', tone: 'purple' },
  ];
  if (detail.kind === 'simpleperf') return [
    { label: 'UnityMain', value: '39.3', suffix: '%', tone: 'red' },
    { label: 'libil2cpp', value: '18.4', suffix: '%', tone: 'blue' },
    { label: 'Wwise', value: detail.mode === 'diff' ? '+1277' : '10.1', suffix: '%', tone: 'gold' },
    { label: 'Symbol', value: '71.6', suffix: '%', tone: 'purple' },
  ];
  if (detail.kind === 'perfetto') return [
    { label: 'Running', value: '92.5', suffix: '%', tone: 'red' },
    { label: 'Sleeping', value: '6.2', suffix: '%', tone: 'blue' },
    { label: 'Wait', value: '5.83', suffix: 'ms', tone: 'gold' },
    { label: 'bigCore', value: '82.5', suffix: '%', tone: 'purple' },
  ];
  return [
    { label: '置信度', value: 'High', suffix: '', tone: 'green' },
    { label: 'Unity', value: 'P95', suffix: 'bad', tone: 'red' },
    { label: 'CPU', value: '39.3', suffix: '%', tone: 'blue' },
    { label: 'Running', value: '92.5', suffix: '%', tone: 'purple' },
  ];
}

function filterSections(sections: ReportSection[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter(section => `${section.title}\n${section.summary}\n${section.blocks.map(block => block.content).join('\n')}`.toLowerCase().includes(q));
}

function looksLikeTree(text: string) {
  return /[├└│─]|PlayerLoop|->|=>|\bUpdate\b.*\n\s+|\n\s{2,}\S/.test(text) && text.length > 80;
}

function inferTone(text: string): Tone {
  if (/达标|通过|改善|下降|稳定|success/i.test(text)) return 'green';
  if (/建议|优化|注意|P1|warning/i.test(text)) return 'gold';
  if (/Perfetto|Running|Thread|调度/i.test(text)) return 'purple';
  if (/风险|异常|回归|瓶颈|GC|Jank|P0|error|critical/i.test(text)) return 'red';
  return 'blue';
}

function reportTheme(kind: ReportPreviewDetail['kind'], mode: ReportPreviewDetail['mode']) {
  const accent = kind === 'unity' ? '46,160,67' : kind === 'simpleperf' ? '22,119,255' : kind === 'perfetto' ? '114,46,209' : '250,173,20';
  return {
    tagColor: kindColor[kind],
    gradient: `radial-gradient(circle at 15% 20%, rgba(${accent},.22), transparent 28%), radial-gradient(circle at 88% 0%, rgba(${mode === 'diff' ? '255,77,79' : accent},.18), transparent 28%), linear-gradient(135deg, #121823, #0b0e11 72%)`,
  };
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <Space><span style={{ color: 'var(--color-primary)' }}>{icon}</span><span style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{text}</span></Space>;
}

function cleanInlineMarkdown(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
}

function slugify(text: string) {
  const cleaned = cleanInlineMarkdown(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
  return cleaned || `section-${Math.random().toString(36).slice(2, 8)}`;
}

function shortenText(text: string, max = 120) {
  const cleaned = cleanInlineMarkdown(text);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function shortenConclusion(text: string, max = 90) {
  const cleaned = cleanInlineMarkdown(text);
  if (cleaned.length <= max) return cleaned;
  const firstSentence = cleaned.split(/[。.!！?？]/).find(part => part.trim().length > 12);
  if (firstSentence && firstSentence.length <= max) return `${firstSentence.trim()}。`;
  return `${cleaned.slice(0, max - 1)}…`;
}

function dedupeMetrics(metrics: MetricCard[]) {
  const seen = new Set<string>();
  return metrics.filter(metric => {
    if (seen.has(metric.label)) return false;
    seen.add(metric.label);
    return true;
  });
}

export default ReportPreview;
