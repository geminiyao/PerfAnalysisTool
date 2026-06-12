import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, Row, Space, Spin, Statistic, Steps, Table, Tag, Timeline, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParams } from 'react-router-dom';
import type { SimpleperfProgressEvent, SimpleperfStage } from '../../shared/types';

const BASE_URL = '/cpu/api';
const { Text, Paragraph } = Typography;

const stageOrder: SimpleperfStage[] = [
  'upload_completed',
  'queued',
  'extracting_perf',
  'extract_completed',
  'generating_structured_report',
  'structured_report_ready',
  'ai_prompt_ready',
  'ai_thinking',
  'ai_streaming',
  'ai_completed',
  'writing_ai_report',
  'report_ready',
  'completed',
];

const stageLabels: Record<string, string> = {
  idle: '等待开始',
  uploading_perf_data: '正在上传 perf.data',
  uploading_symbols: '正在上传符号表',
  upload_completed: '上传完成',
  creating_session: '正在创建分析会话',
  queued: '已进入分析队列',
  extracting_perf: '正在提取 perf 信息',
  extract_completed: 'perf 信息提取完成',
  generating_structured_report: '正在生成结构化报告',
  structured_report_ready: '结构化报告已生成',
  ai_prompt_ready: 'AI 提示词已生成',
  ai_thinking: 'AI 正在思考',
  ai_streaming: 'AI 正在输出分析',
  ai_completed: 'AI 输出完成',
  writing_ai_report: '正在产出 ai-report.md',
  report_ready: '分析报告产出完成',
  completed: '分析完成',
  failed: '分析失败',
};

const SimpleperfReport: React.FC = () => {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [events, setEvents] = useState<SimpleperfProgressEvent[]>([]);
  const [aiDraft, setAiDraft] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());

  const ingestEvent = useCallback((event: SimpleperfProgressEvent) => {
    if (!event || event.type === 'connected') return;
    const key = `${event.createdAt}:${event.type}:${event.stage || ''}:${event.text || event.message || ''}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    setEvents(prev => [...prev, event].slice(-300));
    if (event.type === 'structured_report' && event.report) {
      setData((prev: any) => ({ ...(prev || {}), report: event.report }));
    }
    if (event.type === 'ai_prompt' && event.prompt) setAiPrompt(event.prompt);
    if (event.type === 'ai_delta' && event.text) setAiDraft(prev => `${prev}${event.text}`);
  }, []);

  const loadReport = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/simpleperf/sessions/${id}/report`);
    const next = await res.json();
    setData(next);
    const nextEvents = next?.events || [];
    nextEvents.forEach(ingestEvent);
    const promptEvent = [...nextEvents].reverse().find((e: SimpleperfProgressEvent) => e.type === 'ai_prompt' && e.prompt);
    if (promptEvent?.prompt) setAiPrompt(promptEvent.prompt);
    if (next?.aiReport) setAiDraft(next.aiReport);
    return next;
  }, [id, ingestEvent]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let eventSource: EventSource | null = null;

    const start = async () => {
      try {
        const next = await loadReport();
        if (cancelled) return;
        setLoading(false);

        eventSource = new EventSource(`${BASE_URL}/simpleperf/sessions/${id}/events`);
        eventSource.onmessage = (msg) => {
          try {
            const event = JSON.parse(msg.data);
            ingestEvent(event);
            if (event.type === 'done' || event.type === 'error') loadReport().catch(() => {});
          } catch { /* ignore */ }
        };
        eventSource.onerror = () => {
          eventSource?.close();
          const poll = async () => {
            if (cancelled) return;
            const latest = await loadReport().catch(() => null);
            const status = latest?.session?.status;
            if (['pending', 'queued', 'running', 'ai_analyzing'].includes(status)) {
              timer = setTimeout(poll, 1500);
            }
          };
          timer = setTimeout(poll, 1500);
        };
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      eventSource?.close();
      if (timer) clearTimeout(timer);
    };
  }, [id, ingestEvent, loadReport]);

  const session = data?.session;
  const report = data?.report;
  const aiReport = aiDraft || data?.aiReport || '';
  const currentStage = getCurrentStage(events, session?.status);
  const isProcessing = ['pending', 'queued', 'running', 'ai_analyzing'].includes(session?.status);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!session) return <Alert type="error" showIcon message="报告不存在" />;

  return (
    <div>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>simpleperf 单次报告</h1>
      {session?.status === 'failed' && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="分析失败" description={session.error} />}
      {isProcessing && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={stageLabels[currentStage] || 'simpleperf 正在分析'} description="结构化报告生成后会先展示，AI 分析会继续在右侧流式输出。" />}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Tag color={statusColor(session.status)}>{session.status}</Tag>
          <Tag color="blue">{stageLabels[currentStage] || currentStage}</Tag>
          <Text>{session.fileName}</Text>
          {session.projectName && <Tag>{session.projectName}</Tag>}
          {session.version && <Tag>{session.version}</Tag>}
          {session.device && <Tag>{session.device}</Tag>}
          {session.scene && <Tag>{session.scene}</Tag>}
        </Space>
      </Card>

      <Card size="small" title="分析阶段" style={{ marginBottom: 12 }}>
        <Steps size="small" current={stageIndex(currentStage)} status={session.status === 'failed' ? 'error' : isProcessing ? 'process' : 'finish'} items={[
          { title: '上传完成' },
          { title: '提取 perf' },
          { title: '结构化报告' },
          { title: 'AI 分析' },
          { title: '报告产出' },
          { title: '完成' },
        ]} />
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card><Statistic title="Event" value={report?.meta?.event || '-'} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="采样数" value={report?.meta?.total_samples || 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="线程数" value={report?.threads?.length || 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="SO 数" value={report?.libs?.length || 0} /></Card></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={15}>
          {report ? <StructuredReport report={report} session={session} id={id!} aiReport={aiReport} /> : (
            <Card size="small"><Spin /> <Text type="secondary" style={{ marginLeft: 8 }}>等待 simpleperf 生成结构化报告...</Text></Card>
          )}
        </Col>
        <Col xs={24} xl={9}>
          <AIPanel prompt={aiPrompt} content={aiReport} status={stageLabels[currentStage] || currentStage} sessionId={id!} hasAiReport={!!aiReport} />
          <ProgressTimeline events={events} />
        </Col>
      </Row>
    </div>
  );
};

const StructuredReport: React.FC<{ report: any; session: any; id: string; aiReport: string }> = ({ report, session, id, aiReport }) => (
  <>
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col xs={24} lg={12}>
        <Card size="small" title="线程 CPU 分布">
          <ReactECharts style={{ height: 280 }} option={barOption(report.threads || [], 'name', 'pct', '线程占比 %')} />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title=".so CPU 占比">
          <ReactECharts style={{ height: 280 }} option={pieOption((report.libs || []).slice(0, 12))} />
        </Card>
      </Col>
    </Row>

    <Card size="small" title="业务候选热点（已过滤通用底层/未符号化）" style={{ marginBottom: 12 }}>
      <Table size="small" rowKey={(_, idx) => String(idx)} dataSource={report.businessHotspots || []} pagination={{ pageSize: 12 }} columns={hotspotColumns(false)} />
    </Card>

    <Card size="small" title="低诊断价值热点（需要看上游调用链）" style={{ marginBottom: 12 }}>
      <Table size="small" rowKey={(_, idx) => String(idx)} dataSource={report.lowValueHotspots || []} pagination={{ pageSize: 12 }} columns={hotspotColumns(true)} />
    </Card>

    <Card size="small" title="原始 Top Hotspots" style={{ marginBottom: 12 }}>
      <Table size="small" rowKey={(_, idx) => String(idx)} dataSource={report.hotspots || []} pagination={{ pageSize: 20 }} columns={hotspotColumns(true)} />
    </Card>

    <Card size="small" title="分析产物" style={{ marginBottom: 12 }}>
      <Space wrap>
        <Button href={`${BASE_URL}/simpleperf/sessions/${id}/artifact/json`} target="_blank">JSON</Button>
        <Button href={`${BASE_URL}/simpleperf/sessions/${id}/artifact/txt`} target="_blank">TXT</Button>
        <Button href={`${BASE_URL}/simpleperf/sessions/${id}/artifact/ai`} target="_blank" disabled={!aiReport}>AI Markdown</Button>
        <Button href={`${BASE_URL}/simpleperf/sessions/${id}/artifact/folded`} target="_blank" disabled={!session?.foldedPath}>Folded Stack</Button>
      </Space>
    </Card>
  </>
);

const AIPanel: React.FC<{ prompt: string; content: string; status: string; sessionId: string; hasAiReport: boolean }> = ({ prompt, content, status, sessionId, hasAiReport }) => (
  <Card size="small" title="AI 分析面板" extra={<Button href={`${BASE_URL}/simpleperf/sessions/${sessionId}/artifact/ai`} target="_blank" disabled={!hasAiReport}>Markdown</Button>} style={{ marginBottom: 12 }}>
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert type="info" showIcon message={status} />
      <Collapse size="small" items={[{
        key: 'prompt',
        label: '第一轮提示词',
        children: prompt ? <Paragraph style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{prompt}</Paragraph> : <Empty description="等待 AI prompt 生成" />,
      }]} />
      <Card size="small" title="AI 输出" bodyStyle={{ maxHeight: 520, overflow: 'auto' }}>
        {content ? (
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <Empty description="等待 AI 输出" />
        )}
      </Card>
    </Space>
  </Card>
);

const ProgressTimeline: React.FC<{ events: SimpleperfProgressEvent[] }> = ({ events }) => {
  const visible = events.filter(e => e.type !== 'ai_delta').slice(-60).reverse();
  return (
    <Card size="small" title="阶段日志">
      {visible.length === 0 ? <Empty description="暂无阶段事件" /> : (
        <Timeline items={visible.map(e => ({
          color: e.type === 'error' ? 'red' : e.stage === 'completed' ? 'green' : 'blue',
          children: <div>
            <Text strong>{stageLabels[e.stage || ''] || e.type}</Text>
            <div><Text type="secondary">{e.message || e.error || e.type}</Text></div>
            <div><Text type="secondary" style={{ fontSize: 11 }}>{new Date(e.createdAt).toLocaleTimeString()}</Text></div>
          </div>,
        }))} />
      )}
    </Card>
  );
};

function getCurrentStage(events: SimpleperfProgressEvent[], status?: string): SimpleperfStage {
  const lastStage = [...events].reverse().find(e => e.stage)?.stage;
  if (lastStage) return lastStage;
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'ai_analyzing') return 'ai_thinking';
  if (status === 'running') return 'extracting_perf';
  if (status === 'queued') return 'queued';
  return 'idle';
}

function stageIndex(stage: SimpleperfStage) {
  if (['upload_completed', 'creating_session', 'queued'].includes(stage)) return 0;
  if (['extracting_perf', 'extract_completed'].includes(stage)) return 1;
  if (['generating_structured_report', 'structured_report_ready'].includes(stage)) return 2;
  if (['ai_prompt_ready', 'ai_thinking', 'ai_streaming', 'ai_completed'].includes(stage)) return 3;
  if (['writing_ai_report', 'report_ready'].includes(stage)) return 4;
  if (stage === 'completed') return 5;
  return Math.max(0, stageOrder.indexOf(stage));
}

function hotspotColumns(showReason: boolean) {
  const columns: any[] = [
    { title: '函数', dataIndex: 'func', ellipsis: true },
    { title: '库', dataIndex: 'lib', width: 180, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Self ms', dataIndex: 'self_ms', width: 110, sorter: (a: any, b: any) => a.self_ms - b.self_ms },
    { title: '占比', dataIndex: 'pct', width: 100, render: (v: number) => `${v}%`, sorter: (a: any, b: any) => a.pct - b.pct },
  ];
  if (showReason) columns.push({ title: '说明', dataIndex: 'reason', ellipsis: true, render: (v: string) => v || <Text type="secondary">业务候选</Text> });
  return columns;
}

function barOption(items: any[], nameKey: string, valueKey: string, title: string) {
  const top = items.slice(0, 12).reverse();
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 90, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '%' },
    yAxis: { type: 'category', data: top.map(i => i[nameKey]) },
    series: [{ name: title, type: 'bar', data: top.map(i => i[valueKey]), itemStyle: { color: '#60a5fa' } }],
  };
}

function pieOption(items: any[]) {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    series: [{ type: 'pie', radius: ['42%', '70%'], data: items.map(i => ({ name: i.name, value: i.pct })) }],
  };
}

function statusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'running' || status === 'ai_analyzing') return 'processing';
  if (status === 'failed') return 'error';
  return 'default';
}

export default SimpleperfReport;
