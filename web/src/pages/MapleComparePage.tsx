import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, Row, Space, Spin, Statistic, Steps, Table, Tabs, Tag, Timeline, Typography, message } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams } from 'react-router-dom';
import type { SimpleperfProgressEvent, SimpleperfStage } from '../../shared/types';

const BASE_URL = '/cpu/api';
const { Text, Paragraph } = Typography;

const stageLabels: Record<string, string> = {
  idle: '等待开始',
  upload_completed: '上传完成',
  queued: '已进入分析队列',
  extracting_perf: '分析中',
  extract_completed: '脚本分析完成',
  structured_report_ready: '结构化报告已生成',
  ai_prompt_ready: 'AI 提示词已生成',
  ai_thinking: 'AI 正在思考',
  ai_streaming: 'AI 正在输出分析',
  ai_completed: 'AI 输出完成',
  writing_ai_report: '正在写入报告',
  report_ready: '报告产出完成',
  completed: '完成',
  failed: '失败',
};

interface UploadMeta {
  label: string;
  device: string;
  scene: string;
}

interface LocalDirectorySelection {
  path: string;
  name: string;
  rawPath?: string;
  resolvedPath?: string;
  resolveError?: string;
}





const MapleComparePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<UploadMeta>();
  const [baseDir, setBaseDir] = useState<LocalDirectorySelection | null>(null);
  const [optDir, setOptDir] = useState<LocalDirectorySelection | null>(null);
  const [uploading, setUploading] = useState(false);


  const [data, setData] = useState<any>(null);
  const [events, setEvents] = useState<SimpleperfProgressEvent[]>([]);
  const [aiDraft, setAiDraft] = useState('');
  const [loading, setLoading] = useState(!!id);
  const seenRef = useRef<Set<string>>(new Set());

  const ingestEvent = useCallback((event: SimpleperfProgressEvent) => {
    if (!event || event.type === 'connected') return;
    const key = `${event.createdAt}:${event.type}:${event.stage || ''}:${event.text || event.message || ''}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    setEvents(prev => [...prev, event].slice(-300));
    if (event.type === 'structured_report' && event.report) setData((prev: any) => ({ ...(prev || {}), reportJson: event.report }));
    if (event.type === 'ai_delta' && event.text) setAiDraft(prev => `${prev}${event.text}`);
  }, []);

  const loadReport = useCallback(async () => {
    if (!id) return null;
    const res = await fetch(`${BASE_URL}/maple-compare/sessions/${id}/report`);
    if (!res.ok) throw new Error('加载 Maple 三源对比报告失败');
    const next = await res.json();
    setData(next);
    (next.events || []).forEach(ingestEvent);
    if (next.reportMd) setAiDraft(next.reportMd);
    return next;
  }, [id, ingestEvent]);

  useEffect(() => {
    if (!id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let eventSource: EventSource | null = null;

    const start = async () => {
      try {
        const next = await loadReport();
        if (cancelled) return;
        setLoading(false);
        const status = next?.session?.status;
        if (status === 'pending') {
          await fetch(`${BASE_URL}/maple-compare/sessions/${id}/analyze`, { method: 'POST' });
        }
        eventSource = new EventSource(`${BASE_URL}/maple-compare/sessions/${id}/events`);
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
            if (['pending', 'queued', 'running', 'ai_analyzing'].includes(latest?.session?.status)) timer = setTimeout(poll, 1500);
          };
          timer = setTimeout(poll, 1500);
        };
      } catch (e: any) {
        if (!cancelled) {
          setLoading(false);
          message.error(e.message || '加载失败');
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      eventSource?.close();
      if (timer) clearTimeout(timer);
    };
  }, [id, ingestEvent, loadReport]);

  const onStart = async () => {
    if (!baseDir || !optDir) {
      message.warning('请拖拽选择 base 和 opt 两个本地采样目录');
      return;
    }
    setUploading(true);
    try {
      const values = await form.validateFields();
      const res = await fetch(`${BASE_URL}/maple-compare/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: values.label || 'Maple 三源对比',
          device: values.device || '',
          scene: values.scene || '',
          baseDir: baseDir.path,
          optDir: optDir.path,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '创建本地分析失败');
      const body = await res.json();
      navigate(`/maple-compare/${body.id}`);
    } catch (e: any) {
      message.error(e.message || '创建本地分析失败');
    } finally {
      setUploading(false);
    }
  };



  const session = data?.session;
  const report = data?.reportJson;
  const reportMd = aiDraft || data?.reportMd || '';
  const currentStage = getCurrentStage(events, session?.status);
  const isProcessing = ['pending', 'queued', 'running', 'ai_analyzing'].includes(session?.status);

  return (
    <div>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Maple 三源对比分析</h1>
      {!id && (
        <Card size="small" title="拖拽 base / opt 本地采样目录" style={{ marginBottom: 12 }}>
          <Form form={form} layout="vertical" initialValues={{ label: 'Maple 三源对比', device: '', scene: '' }}>
            <Row gutter={12}>
              <Col xs={24} md={8}><Form.Item label="Label" name="label"><Input placeholder="如 ILOpt AB Test" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Device" name="device"><Input placeholder="如 PAL-AL00" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Scene" name="scene"><Input placeholder="如 battle/loading" /></Form.Item></Col>
            </Row>
          </Form>
          <Row gutter={12}>
            <Col xs={24} lg={12}><LocalDirectoryDrop title="Base 采样目录" value={baseDir} onChange={setBaseDir} /></Col>
            <Col xs={24} lg={12}><LocalDirectoryDrop title="Opt 采样目录" value={optDir} onChange={setOptDir} /></Col>
          </Row>
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message="拖拽目录后只读取目录路径，不上传 perf.data、*.pdata、*.pftrace、binary_cache/；服务端会直接分析该本地目录。若浏览器安全策略无法提供目录路径，请用 Electron/本地 Chromium 运行。" />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button type="primary" size="large" loading={uploading} disabled={!baseDir || !optDir} onClick={onStart}>开始分析</Button>
          </div>
        </Card>
      )}



      {id && loading && <Card><Spin /> <Text style={{ marginLeft: 8 }}>加载中...</Text></Card>}
      {id && !loading && !session && <Alert type="error" showIcon message="报告不存在" />}
      {id && session && (
        <>
          {session.status === 'failed' && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="分析失败" description={session.error} />}
          {isProcessing && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={stageLabels[currentStage] || 'Maple 三源对比正在分析'} description="结构化 JSON 生成后会先展示，AI Markdown 报告会继续流式输出。" />}
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Tag color={statusColor(session.status)}>{session.status}</Tag>
              <Tag color="blue">{stageLabels[currentStage] || currentStage}</Tag>
              {session.label && <Tag>{session.label}</Tag>}
              {session.device && <Tag>{session.device}</Tag>}
              {session.scene && <Tag>{session.scene}</Tag>}
            </Space>
          </Card>
          <Card size="small" title="分析进度" style={{ marginBottom: 12 }}>
            <Steps size="small" current={stageIndex(currentStage)} status={session.status === 'failed' ? 'error' : isProcessing ? 'process' : 'finish'} items={[{ title: '上传完成' }, { title: '分析中' }, { title: 'AI 生成报告' }, { title: '完成' }]} />
          </Card>
          {report ? <ResultTabs report={report} reportMd={reportMd} sessionId={id} events={events} /> : <Card><Spin /> <Text style={{ marginLeft: 8 }}>等待结构化报告...</Text></Card>}
        </>
      )}
    </div>
  );
};

const LocalDirectoryDrop: React.FC<{ title: string; value: LocalDirectorySelection | null; onChange: (dir: LocalDirectorySelection | null) => void }> = ({ title, value, onChange }) => (
  <Card size="small" title={title}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const dir = getDroppedDirectoryPath(e.dataTransfer);
          if (!dir) {
            message.error('无法从拖拽项识别本地目录路径。请确认拖拽的是目录，并在本地/Electron 环境运行。');
            return;
          }
          onChange(dir);
          resolveLocalDirectory(dir).then(onChange).catch(() => {
            onChange({ ...dir, resolveError: '服务端解析请求失败' });
          });
        }}
        style={{ border: '1px dashed var(--border-primary)', borderRadius: 8, padding: 28, textAlign: 'center' }}
      >
        <InboxOutlined style={{ fontSize: 28, color: 'var(--color-primary)' }} />
        <div style={{ marginTop: 8 }}>将本地采样目录拖到这里</div>
        <Text type="secondary">只读取目录地址，不上传目录内容</Text>
      </div>
      {value ? <Alert type={value.resolveError ? 'error' : value.resolvedPath ? 'success' : 'info'} showIcon message={value.name} description={<Space direction="vertical" size={2}><Text>原始路径：{value.rawPath || value.path}</Text><Text>解析路径：{value.resolvedPath || '解析中...'}</Text>{value.resolveError && <Text type="danger">{value.resolveError}</Text>}</Space>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未选择目录" />}

      <Button size="small" onClick={() => onChange(null)} disabled={!value}>清空</Button>
    </Space>
  </Card>
);


const ResultTabs: React.FC<{ report: any; reportMd: string; sessionId: string; events: SimpleperfProgressEvent[] }> = ({ report, reportMd, sessionId, events }) => {
  const cross = useMemo(() => buildCrossValidation(report), [report]);
  return (
    <Tabs items={[
      { key: 'summary', label: '执行摘要', children: <SummaryTab report={report} cross={cross} /> },
      { key: 'il2cpp', label: 'il2cpp [A]', children: <Il2cppTab stats={report.il2cpp_stats} /> },
      { key: 'hotspots', label: '热点函数 [B]', children: <HotspotsTab items={report.main_thread_hotspots?.compare || []} /> },
      { key: 'so', label: 'So 分布 [C]', children: <SoTab threads={report.level1_so_compare?.threads || []} /> },
      { key: 'diff', label: '虚函数/Diff [C3+C4]', children: <DiffTab anchors={report.level2_anchor_compare?.anchors || []} items={report.level3_func_diff?.items || []} /> },
      { key: 'perfetto', label: 'perfetto [D-F]', children: <PerfettoTab perfetto={report.perfetto || {}} /> },
      { key: 'pdata', label: 'pdata [G]', children: <PdataTab pdata={report.pdata || {}} /> },
      { key: 'cross', label: '交叉验证 [H]', children: <CrossTab cross={cross} /> },
      { key: 'ai', label: 'AI 分析报告', children: <AiTab content={reportMd} sessionId={sessionId} events={events} /> },
    ]} />
  );
};

const SummaryTab: React.FC<{ report: any; cross: any }> = ({ report, cross }) => (
  <Space direction="vertical" style={{ width: '100%' }} size={12}>
    <Row gutter={[12, 12]}>
      <Col xs={12} md={6}><Card><Statistic title="il2cpp 占比变化" value={report.il2cpp_stats?.delta_pp ?? 0} precision={2} suffix="pp" valueStyle={{ color: deltaColor(report.il2cpp_stats?.delta_pp) }} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="pdata P95 Base" value={report.pdata?.base?.frame_ms_p95 ?? 0} precision={2} suffix="ms" /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="pdata P95 Opt" value={report.pdata?.opt?.frame_ms_p95 ?? 0} precision={2} suffix="ms" /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="置信度" value={cross.confidence} valueStyle={{ color: cross.confidence === '高' ? '#52c41a' : cross.confidence === '中' ? '#faad14' : '#ff4d4f' }} /></Card></Col>
    </Row>
    <CrossTab cross={cross} />
  </Space>
);

const Il2cppTab: React.FC<{ stats: any }> = ({ stats = {} }) => (
  <Row gutter={[12, 12]}>
    <Col xs={24} md={8}><Card><Statistic title="占比 Base → Opt" value={`${fmt(stats.base_pct)}% → ${fmt(stats.opt_pct)}%`} suffix={<DeltaTag value={stats.delta_pp} unit="pp" />} /></Card></Col>
    <Col xs={24} md={8}><Card><Statistic title="绝对时间 Base → Opt" value={`${fmt(stats.base_ms)} → ${fmt(stats.opt_ms)}`} suffix="ms" /></Card></Col>
    <Col xs={24} md={8}><Card><Statistic title="帧均 Base → Opt" value={`${fmt(stats.base_ms_per_frame)} → ${fmt(stats.opt_ms_per_frame)}`} suffix="ms/frame" /></Card></Col>
  </Row>
);

const HotspotsTab: React.FC<{ items: any[] }> = ({ items }) => <Table size="small" rowKey={(_, i) => String(i)} dataSource={items} pagination={{ pageSize: 15 }} columns={[
  { title: '函数', dataIndex: 'func', ellipsis: true },
  { title: 'lib', dataIndex: 'lib', width: 180, render: (v: string) => <Tag>{v}</Tag> },
  { title: 'base_ms', dataIndex: 'base_ms', width: 110, render: fmt },
  { title: 'opt_ms', dataIndex: 'opt_ms', width: 110, render: fmt },
  { title: 'delta%', dataIndex: 'delta_pct', width: 110, render: (v: number) => <DeltaTag value={v} unit="%" /> },
]} />;

const SoTab: React.FC<{ threads: any[] }> = ({ threads }) => threads.length ? <Space direction="vertical" style={{ width: '100%' }}>{threads.map(t => <Card key={t.name} size="small" title={`${t.name} · event ${t.baseline_total_event || 0} → ${t.current_total_event || 0}`}><ReactECharts style={{ height: 280 }} option={barCompareOption((t.libs || []).slice(0, 12), 'name', 'baseline_pct', 'current_pct')} /></Card>)}</Space> : <Empty description="无 SO 分布数据" />;

const DiffTab: React.FC<{ anchors: any[]; items: any[] }> = ({ anchors, items }) => {
  const funcs = items.flatMap((g: any) => (g.functions || []).map((f: any) => ({ ...f, abs_ms: g.abs_ms })));
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Card size="small" title="Anchor 子树对比"><Table size="small" rowKey={(_, i) => String(i)} dataSource={anchors} pagination={{ pageSize: 10 }} columns={[{ title: 'Anchor', dataIndex: 'name', ellipsis: true }, { title: 'base_ms', dataIndex: 'baseline_ms', render: fmt }, { title: 'opt_ms', dataIndex: 'current_ms', render: fmt }, { title: 'delta%', dataIndex: 'delta_pct', render: (v: number) => <DeltaTag value={v} unit="%" /> }]} /></Card>
    <Card size="small" title="函数级 A/M/D Diff"><Table size="small" rowKey={(_, i) => String(i)} dataSource={funcs} pagination={{ pageSize: 15 }} columns={[{ title: 'Mask', dataIndex: 'mask', width: 80, render: (v: string) => <Tag color={v === 'D' ? 'red' : v === 'A' ? 'blue' : 'default'}>{v}</Tag> }, { title: '函数', dataIndex: 'func', ellipsis: true }, { title: 'lib', dataIndex: 'lib', width: 160 }, { title: 'delta_ms', dataIndex: 'delta_ms', render: fmt }, { title: 'delta%', dataIndex: 'delta_pct', render: (v: number) => <DeltaTag value={v} unit="%" /> }, { title: 'inline?', dataIndex: 'maybe_inlined', render: (v: boolean) => v ? <Tag color="gold">maybe</Tag> : '-' }]} /></Card>
  </Space>;
};

const PerfettoTab: React.FC<{ perfetto: any }> = ({ perfetto }) => {
  const base = perfetto.base || {};
  const opt = perfetto.opt || {};
  const sliceRows = unionKeys(base.unity_slices, opt.unity_slices).map(name => ({ name, base: base.unity_slices?.[name]?.avg_ms, baseP95: base.unity_slices?.[name]?.p95_ms, opt: opt.unity_slices?.[name]?.avg_ms, optP95: opt.unity_slices?.[name]?.p95_ms }));
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Row gutter={[12, 12]}>
      <Col xs={24} md={12}><Card size="small" title="Base 线程调度"><ReactECharts style={{ height: 240 }} option={schedPieOption(base)} /></Card></Col>
      <Col xs={24} md={12}><Card size="small" title="Opt 线程调度"><ReactECharts style={{ height: 240 }} option={schedPieOption(opt)} /></Card></Col>
    </Row>
    <Row gutter={[12, 12]}>
      {['frame_p50_ms', 'frame_p95_ms', 'frame_p99_ms'].map(k => <Col xs={24} md={8} key={k}><Card><Statistic title={k} value={`${fmt(base[k])} → ${fmt(opt[k])}`} suffix="ms" /></Card></Col>)}
    </Row>
    <Card size="small" title="Unity slices 帧均/P95"><Table size="small" rowKey="name" dataSource={sliceRows} pagination={false} columns={[{ title: 'Slice', dataIndex: 'name' }, { title: 'Base Avg', dataIndex: 'base', render: fmt }, { title: 'Opt Avg', dataIndex: 'opt', render: fmt }, { title: 'Base P95', dataIndex: 'baseP95', render: fmt }, { title: 'Opt P95', dataIndex: 'optP95', render: fmt }]} /></Card>
  </Space>;
};

const PdataTab: React.FC<{ pdata: any }> = ({ pdata }) => {
  const base = pdata.base || {};
  const opt = pdata.opt || {};
  const markerRows = unionKeys(base.markers, opt.markers).map(name => ({ name, base: base.markers?.[name]?.ms_mean, baseP95: base.markers?.[name]?.ms_p95, opt: opt.markers?.[name]?.ms_mean, optP95: opt.markers?.[name]?.ms_p95 }));
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}><Card><Statistic title="帧数 Base → Opt" value={`${fmt(base.frame_count, 0)} → ${fmt(opt.frame_count, 0)}`} /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="Median" value={`${fmt(base.frame_ms_median)} → ${fmt(opt.frame_ms_median)}`} suffix="ms" /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="P95" value={`${fmt(base.frame_ms_p95)} → ${fmt(opt.frame_ms_p95)}`} suffix="ms" /></Card></Col>
    </Row>
    <Card size="small" title="Marker 帧均柱状对比"><ReactECharts style={{ height: 360 }} option={barCompareOption(markerRows.slice(0, 16), 'name', 'base', 'opt')} /></Card>
    <Card size="small" title="Marker 明细"><Table size="small" rowKey="name" dataSource={markerRows} pagination={{ pageSize: 15 }} columns={[{ title: 'Marker', dataIndex: 'name', ellipsis: true }, { title: 'Base Mean', dataIndex: 'base', render: fmt }, { title: 'Opt Mean', dataIndex: 'opt', render: fmt }, { title: 'Base P95', dataIndex: 'baseP95', render: fmt }, { title: 'Opt P95', dataIndex: 'optP95', render: fmt }]} /></Card>
  </Space>;
};

const CrossTab: React.FC<{ cross: any }> = ({ cross }) => <Space direction="vertical" style={{ width: '100%' }}>{cross.items.map((item: any, i: number) => <Alert key={i} type={item.type} showIcon message={item.text} />)}<Tag color={cross.confidence === '高' ? 'success' : cross.confidence === '中' ? 'warning' : 'error'}>置信度：{cross.confidence}</Tag></Space>;

const AiTab: React.FC<{ content: string; sessionId: string; events: SimpleperfProgressEvent[] }> = ({ content, sessionId, events }) => <Row gutter={[12, 12]}>
  <Col xs={24} xl={16}><Card size="small" title="AI Markdown 报告" extra={<Button icon={<DownloadOutlined />} href={`${BASE_URL}/maple-compare/sessions/${sessionId}/artifact/md`} target="_blank" disabled={!content}>下载</Button>}>{content ? <div style={{ lineHeight: 1.7 }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div> : <Empty description="等待 AI 输出" />}</Card></Col>
  <Col xs={24} xl={8}><Card size="small" title="阶段日志"><Timeline items={events.filter(e => e.type !== 'ai_delta').slice(-60).reverse().map(e => ({ color: e.type === 'error' ? 'red' : e.stage === 'completed' ? 'green' : 'blue', children: <div><Text strong>{stageLabels[e.stage || ''] || e.type}</Text><Paragraph type="secondary" style={{ marginBottom: 0 }}>{e.message || e.error || e.type}</Paragraph></div> }))} /></Card></Col>
</Row>;

async function resolveLocalDirectory(dir: LocalDirectorySelection): Promise<LocalDirectorySelection> {
  const res = await fetch(`${BASE_URL}/maple-compare/local/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: dir.rawPath || dir.path, name: dir.name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.resolvedDir) {
    return { ...dir, resolveError: body.error || '服务端未解析到可用目录' };
  }
  return { ...dir, path: body.resolvedDir, resolvedPath: body.resolvedDir, resolveError: undefined };
}

function getDroppedDirectoryPath(dataTransfer: DataTransfer): LocalDirectorySelection | null {
  const file = dataTransfer.files?.[0] as any;
  const item = dataTransfer.items?.[0] as any;
  const entry = item?.webkitGetAsEntry?.();
  const rawPath = file?.path || entry?.fullPath || file?.name || entry?.filesystem?.root?.fullPath;
  if (!rawPath) return null;
  const normalized = String(rawPath).replace(/^file:\/\//, '');
  const name = file?.name || normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
  const pathValue = normalized === '/' && name ? name : normalized;
  return { path: pathValue, rawPath: pathValue, name };
}



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
  if (['upload_completed', 'queued'].includes(stage)) return 0;
  if (['extracting_perf', 'extract_completed', 'structured_report_ready'].includes(stage)) return 1;
  if (['ai_prompt_ready', 'ai_thinking', 'ai_streaming', 'ai_completed', 'writing_ai_report', 'report_ready'].includes(stage)) return 2;
  if (stage === 'completed') return 3;
  return 0;
}

function statusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'running' || status === 'ai_analyzing') return 'processing';
  if (status === 'failed') return 'error';
  return 'default';
}

function DeltaTag({ value, unit }: { value: number; unit: string }) {
  const color = Math.abs(value || 0) < 0.1 ? 'default' : value < 0 ? 'success' : 'error';
  return <Tag color={color}>{value > 0 ? '+' : ''}{fmt(value)}{unit}</Tag>;
}

function fmt(v: any, digits = 2) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'N/A';
}

function deltaColor(v: any) {
  if (typeof v !== 'number' || Math.abs(v) < 0.1) return undefined;
  return v < 0 ? '#52c41a' : '#ff4d4f';
}

function unionKeys(a?: Record<string, any>, b?: Record<string, any>) {
  return Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
}

function barCompareOption(items: any[], nameKey: string, baseKey: string, optKey: string) {
  const top = items.slice(0, 16).reverse();
  return { tooltip: { trigger: 'axis' }, legend: { data: ['base', 'opt'] }, grid: { left: 130, right: 20, top: 40, bottom: 30 }, xAxis: { type: 'value' }, yAxis: { type: 'category', data: top.map(i => i[nameKey]) }, series: [{ name: 'base', type: 'bar', data: top.map(i => i[baseKey] || 0), itemStyle: { color: '#60a5fa' } }, { name: 'opt', type: 'bar', data: top.map(i => i[optKey] || 0), itemStyle: { color: '#34d399' } }] };
}

function schedPieOption(item: any) {
  return { tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: ['42%', '70%'], data: [{ name: 'Running', value: item.main_thread_running_pct || 0 }, { name: 'Runnable', value: item.main_thread_runnable_pct || 0 }, { name: 'Sleeping', value: item.main_thread_sleeping_pct || 0 }] }] };
}

function buildCrossValidation(report: any) {
  const items: Array<{ type: 'success' | 'warning' | 'error' | 'info'; text: string }> = [];
  let score = 0;
  const dIl = report.il2cpp_stats?.delta_pp;
  if (typeof dIl === 'number') {
    if (dIl < -0.5) { score++; items.push({ type: 'success', text: `✓ simpleperf: libil2cpp 占比下降 ${Math.abs(dIl).toFixed(2)}pp` }); }
    else if (dIl > 0.5) items.push({ type: 'error', text: `! simpleperf: libil2cpp 占比上升 ${dIl.toFixed(2)}pp` });
    else items.push({ type: 'info', text: '≈ simpleperf: libil2cpp 占比基本持平' });
  }
  const bP95 = report.pdata?.base?.frame_ms_p95;
  const oP95 = report.pdata?.opt?.frame_ms_p95;
  if (typeof bP95 === 'number' && typeof oP95 === 'number' && bP95 > 0) {
    const d = (oP95 - bP95) / bP95 * 100;
    if (d < -3) { score++; items.push({ type: 'success', text: `✓ pdata: P95 帧时间下降 ${Math.abs(d).toFixed(1)}%` }); }
    else if (d > 3) items.push({ type: 'error', text: `! pdata: P95 帧时间上升 ${d.toFixed(1)}%` });
    else items.push({ type: 'info', text: '≈ pdata: P95 帧时间基本持平' });
  }
  const bRun = report.perfetto?.base?.main_thread_running_pct;
  const oRun = report.perfetto?.opt?.main_thread_running_pct;
  if (typeof bRun === 'number' && typeof oRun === 'number') {
    const d = oRun - bRun;
    if (d < -2) { score++; items.push({ type: 'success', text: `✓ perfetto: UnityMain Running 下降 ${Math.abs(d).toFixed(1)}pp` }); }
    else if (d > 2) items.push({ type: 'warning', text: `! perfetto: UnityMain Running 上升 ${d.toFixed(1)}pp` });
    else items.push({ type: 'info', text: '≈ perfetto: UnityMain Running 基本持平' });
  }
  if (!items.length) items.push({ type: 'warning', text: '! 三源数据不足，无法形成高置信结论' });
  return { items, confidence: score >= 2 ? '高' : score === 1 ? '中' : '低' };
}

export default MapleComparePage;
